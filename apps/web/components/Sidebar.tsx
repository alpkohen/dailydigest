"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { OWNER_DISPLAY_NAME, OWNER_INITIALS } from "@/lib/ownerProfile";
import { AskPanel } from "./AskWidget";
import { IconArchive, IconBookmark, IconChevronDown, IconClose, IconMenu, IconSpark, IconToday } from "./icons";

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

  const [menuOpen, setMenuOpen] = useState(false);
  // A route change (tapping a link) should close the mobile dropdown.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const [askOpen, setAskOpen] = useState(false);

  // Collapsed state is a per-viewer UI preference, not data other people or
  // future sessions need to see, so it lives in localStorage rather than
  // the DB. Default to expanded on both server and client renders (a
  // localStorage read can't happen during SSR) and only flip after mount,
  // matching the pattern already used for the greeting to avoid a
  // hydration mismatch.
  const [topicsCollapsed, setTopicsCollapsed] = useState(false);
  useEffect(() => {
    try {
      setTopicsCollapsed(localStorage.getItem("sidebar-topics-collapsed") === "true");
    } catch {
      // Private browsing / blocked storage: keep the default (expanded).
    }
  }, []);
  const toggleTopicsCollapsed = () => {
    setTopicsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-topics-collapsed", String(next));
      } catch {
        // Ignore - nothing to persist to if storage is unavailable.
      }
      return next;
    });
  };

  return (
    <aside className={`sidebar${menuOpen ? " menu-open" : ""}`}>
      <div className="sidebar-top-row">
        <div className="sidebar-logo-row">
          <Image src="/brand/world-brief-mark.webp" alt="World Brief." width={1248} height={226} className="sidebar-logo-mark" priority />
        </div>
        <button className="sidebar-menu-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <IconClose /> : <IconMenu />}
        </button>
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
        <button type="button" className={`sidebar-link${askOpen ? " active" : ""}`} onClick={() => setAskOpen((v) => !v)}>
          <IconSpark className="icon" />
          Ask
        </button>
      </nav>

      {visibleTopics.length > 0 && (
        <>
          <button
            type="button"
            className="sidebar-eyebrow sidebar-eyebrow-toggle"
            onClick={toggleTopicsCollapsed}
            aria-expanded={!topicsCollapsed}
          >
            Topics you follow
            <IconChevronDown className={`sidebar-eyebrow-chevron${topicsCollapsed ? " collapsed" : ""}`} />
          </button>
          {!topicsCollapsed && (
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
          )}
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

      <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />
    </aside>
  );
}
