import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <div className="page">{children}</div>
    </>
  );
}
