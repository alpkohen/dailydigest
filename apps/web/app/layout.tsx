import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "dailydigest",
  description: "Personal foreign policy and political science intelligence desk.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, fontFamily: "-apple-system, Helvetica, Arial, sans-serif", color: "#1a1a1a" }}>
        {children}
      </body>
    </html>
  );
}
