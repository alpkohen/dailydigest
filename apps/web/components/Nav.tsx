"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/topics", label: "Topics" },
  { href: "/questions", label: "Questions" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/sources", label: "Sources" },
  { href: "/archive", label: "Archive" },
  { href: "/reading-list", label: "Reading" },
  { href: "/briefs", label: "Briefs" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <span className="nav-logo">World Brief.</span>
      <div className="nav-links">
        {LINKS.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={`nav-link${isActive ? " active" : ""}`}>
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
