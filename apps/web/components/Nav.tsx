import Link from "next/link";

const LINKS = [
  { href: "/", label: "Bugün" },
  { href: "/topics", label: "Konular" },
  { href: "/questions", label: "Sorular" },
  { href: "/watchlist", label: "Takip" },
  { href: "/sources", label: "Kaynaklar" },
  { href: "/archive", label: "Arşiv" },
  { href: "/reading-list", label: "Okuma listem" },
  { href: "/briefs", label: "Bültenler" },
  { href: "/settings", label: "Ayarlar" },
];

export function Nav() {
  return (
    <nav className="wb-nav"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        padding: "18px 32px",
        borderBottom: "1px solid #293039",
        fontSize: 13,
        alignItems: "center",
        background: "#0d1116",
      }}
    >
      <Link href="/" style={{ marginRight: 18, color: "#e8eae8", textDecoration: "none", fontFamily: "Georgia, serif", fontSize: 21, letterSpacing: "-.5px" }}>World Brief<span style={{ color: "#79b9a8" }}>.</span></Link>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} style={{ color: "#333", textDecoration: "none" }}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
