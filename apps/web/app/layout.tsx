import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Brief · Evren Balta",
  description: "Evren Balta'nın kişisel gündem ve araştırma masası.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
      </body>
    </html>
  );
}
