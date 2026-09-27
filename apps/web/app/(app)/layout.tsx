import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px" }}>{children}</div>
    </>
  );
}
