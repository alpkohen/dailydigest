import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Single-owner allowlist (SPEC.md section 2): the only account allowed in is
 * OWNER_EMAIL. Anything else that completes a magic-link sign-in is signed
 * out immediately and sent back to /login.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // /auth/callback is the route that EXCHANGES the magic-link code for a
  // session, so no session exists yet when this request arrives — it must
  // be allowed through untouched, or the exchange never runs and every
  // sign-in bounces straight back to /login.
  const isAuthCallbackRoute = request.nextUrl.pathname.startsWith("/auth/callback");
  if (isAuthCallbackRoute) return response;

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const ownerEmail = process.env.OWNER_EMAIL;

  if (user && ownerEmail && user.email !== ownerEmail) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  if (!user && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
