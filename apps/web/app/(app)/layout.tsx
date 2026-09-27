import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wb-shell">
      <Nav />
      <div className="wb-content"><div className="wb-page">{children}</div></div>
    </div>
  );
}
