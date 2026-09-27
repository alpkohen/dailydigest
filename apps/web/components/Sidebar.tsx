"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OWNER_DISPLAY_NAME, OWNER_INITIALS } from "@/lib/ownerProfile";
import { IconArchive, IconBookmark, IconToday } from "./icons";

const PRIMARY_LINKS = [
  { href: "/", label: "Bugün", icon: IconToday },
  { href: "/archive", label: "Arşiv", icon: IconArchive },
];

const MANAGEMENT_LINKS = [
  { href: "/topics", label: "Konular" },
  { href: "/questions", label: "Sorular" },
  { href: "/watchlist", label: "Takip listesi" },
  { href: "/sources", label: "Kaynaklar" },
  { href: "/briefs", label: "Brief geçmişi" },
  { href: "/settings", label: "Ayarlar" },
];

export interface SidebarTopic {
  id: string;
  name: string;
}

export function Sidebar({ topics, unreadCount }: { topics: SidebarTopic[]; unreadCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo-row">
        <span className="sidebar-logo-icon">d</span>
        <span className="sidebar-logo-text">dailydigest.</span>
      </div>

      <p className="sidebar-eyebrow">Kişisel masan</p>
      <nav className="sidebar-nav">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`sidebar-link${isActive(href) ? " active" : ""}`}>
            <Icon className="icon" />
            {label}
          </Link>
        ))}
        <Link href="/reading-list" className={`sidebar-link${isActive("/reading-list") ? " active" : ""}`}>
          <IconBookmark className="icon" />
          Okuma listem
          {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
        </Link>
      </nav>

      {topics.length > 0 && (
        <>
          <p className="sidebar-eyebrow">Takip ettiğin konular</p>
          <div className="sidebar-topics">
            {topics.map((t) => (
              <Link key={t.id} href={`/topics/${t.id}`} className="sidebar-topic-link">
                <span className="sidebar-topic-dot" />
                {t.name}
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="sidebar-eyebrow">Yönetim</p>
      <div className="sidebar-topics">
        {MANAGEMENT_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`sidebar-topic-link${isActive(link.href) ? " active" : ""}`}>
            {link.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="sidebar-avatar">{OWNER_INITIALS}</span>
        <div>
          <div className="sidebar-footer-name">{OWNER_DISPLAY_NAME}</div>
          <div className="sidebar-footer-sub">Kişisel çalışma alanı</div>
        </div>
      </div>
    </aside>
  );
}
