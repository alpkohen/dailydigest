import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * No visible login screen for now (single-owner app, not yet deployed
 * publicly — the owner decided the friction wasn't worth it before going
 * live). The magic-link flow (/login, /auth/callback) is left in place
 * and still works, but middleware now auto-establishes a real Supabase
 * session on the owner's behalf whenever a request arrives without one,
 * using a password set once via the admin API (OWNER_PASSWORD, server
 * env only). This keeps the anon-key + RLS architecture intact — every
 * request is still genuinely authenticated as the owner — it just skips
 * asking them to click through an email.
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

  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    request.nextUrl.pathname.startsWith("/api/feedback") ||
    request.nextUrl.pathname.startsWith("/feedback-confirm");
  if (isPublicRoute) return response;

  let { data } = await supabase.auth.getUser();
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!data.user && ownerEmail && ownerPassword) {
    const { error } = await supabase.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
    if (!error) ({ data } = await supabase.auth.getUser());
  }

  const user = data.user;

  if (user && ownerEmail && user.email !== ownerEmail) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_allowed", request.url));
  }

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  if (!user && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
