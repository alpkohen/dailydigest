"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OWNER_DISPLAY_NAME, OWNER_INITIALS } from "@/lib/ownerProfile";
import { IconArchive, IconBookmark, IconToday } from "./icons";

const PRIMARY_LINKS = [
  { href: "/", label: "Today", icon: IconToday },
  { href: "/archive", label: "Archive", icon: IconArchive },
];

const MANAGEMENT_LINKS = [
  { href: "/topics", label: "Topics" },
  { href: "/questions", label: "Questions" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/sources", label: "Sources" },
  { href: "/briefs", label: "Brief history" },
  { href: "/settings", label: "Settings" },
];

const MAX_VISIBLE_TOPICS = 5;

export interface SidebarTopic {
  id: string;
  name: string;
}

export function Sidebar({ topics, unreadCount }: { topics: SidebarTopic[]; unreadCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const visibleTopics = topics.slice(0, MAX_VISIBLE_TOPICS);
  const hiddenCount = topics.length - visibleTopics.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo-row">
        <Image src="/brand/world-brief-mark.webp" alt="World Brief." width={1248} height={226} className="sidebar-logo-mark" priority />
      </div>

      <p className="sidebar-eyebrow">Your desk</p>
      <nav className="sidebar-nav">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`sidebar-link${isActive(href) ? " active" : ""}`}>
            <Icon className="icon" />
            {label}
          </Link>
        ))}
        <Link href="/reading-list" className={`sidebar-link${isActive("/reading-list") ? " active" : ""}`}>
          <IconBookmark className="icon" />
          Reading list
          {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
        </Link>
      </nav>

      {visibleTopics.length > 0 && (
        <>
          <p className="sidebar-eyebrow">Topics you follow</p>
          <div className="sidebar-topics">
            {visibleTopics.map((t) => (
              <Link key={t.id} href={`/topics/${t.id}`} className="sidebar-topic-link">
                <span className="sidebar-topic-dot" />
                {t.name}
              </Link>
            ))}
            {hiddenCount > 0 && (
              <Link href="/topics" className="sidebar-topic-link" style={{ color: "var(--text-faint)" }}>
                +{hiddenCount} more · See all
              </Link>
            )}
          </div>
        </>
      )}

      <p className="sidebar-eyebrow">Manage</p>
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
          <div className="sidebar-footer-sub">Personal workspace</div>
        </div>
      </div>
    </aside>
  );
}
