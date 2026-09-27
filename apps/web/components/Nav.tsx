import Link from "next/link";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/topics", label: "Topics" },
  { href: "/sources", label: "Sources" },
  { href: "/briefs", label: "Briefs" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 20,
        padding: "12px 20px",
        borderBottom: "1px solid #e5e5e5",
        fontSize: 14,
        alignItems: "center",
      }}
    >
      <strong style={{ marginRight: 12 }}>dailydigest</strong>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} style={{ color: "#333", textDecoration: "none" }}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
