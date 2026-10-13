import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { PulseLine } from "./PulseLine";
import { OPEN_COMMAND_PALETTE_EVENT } from "./CommandPalette";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDueCounts } from "../hooks/useDueCounts";
import { STORAGE_KEYS } from "../lib/storage";
import {
  AlfondIcon,
  DriveIcon,
  BookIcon,
  CalendarIcon,
  CardsIcon,
  FlaskIcon,
  GridIcon,
  HelpIcon,
  HomeIcon,
  BodyIcon,
  MapIcon,
  OcclusionIcon,
  ProgressIcon,
  QuizIcon,
  SearchIcon,
  SlidesIcon,
  SummaryIcon,
  TimerIcon,
  ShieldIcon,
  TrophyIcon,
  UserIcon,
} from "./icons";
import { firstName } from "../lib/firstName";
import { useAccount } from "../hooks/useAccount";
import { useI18n } from "../i18n/useI18n";
import type { MessageKey } from "../i18n/i18n";

interface NavItem {
  to: string;
  /** A message key until useNavGroups translates it. */
  label: string;
  end?: boolean;
  icon: ReactNode;
  /** Shows how many reviews are due here. */
  due?: "cards" | "questions";
  /** Only admins see it. */
  admin?: true;
}

interface NavGroup {
  /** Shown above the group; the first group has none. */
  label?: string;
  items: NavItem[];
}

// The few places most students go every day are always in view. Everything else (each study
// tool on its own, the library, the extras and the student's own pages) sits under one "More"
// that stays closed until it's wanted, so the sidebar reads at a glance.
const mainLinks: NavItem[] = [
  { to: "/", label: "nav.home", end: true, icon: <HomeIcon /> },
  { to: "/subjects", label: "nav.subjects", icon: <GridIcon /> },
  { to: "/exam", label: "nav.exams", icon: <TimerIcon /> },
  { to: "/drive", label: "nav.drive", icon: <DriveIcon /> },
  { to: "/alfond", label: "nav.alfond", icon: <AlfondIcon /> },
];

const moreGroups: NavGroup[] = [
  {
    label: "nav.study",
    items: [
      { to: "/flashcards", label: "nav.flashcards", icon: <CardsIcon />, due: "cards" },
      { to: "/quizzes", label: "nav.quizzes", icon: <QuizIcon />, due: "questions" },
      { to: "/occlusion", label: "nav.occlusion", icon: <OcclusionIcon /> },
      { to: "/plan", label: "nav.plan", icon: <CalendarIcon /> },
    ],
  },
  {
    label: "nav.library",
    items: [
      { to: "/ebooks", label: "nav.ebooks", icon: <BookIcon /> },
      { to: "/summaries", label: "nav.summaries", icon: <SummaryIcon /> },
      { to: "/modules", label: "nav.modules", icon: <SlidesIcon /> },
    ],
  },
  {
    label: "nav.explore",
    items: [
      { to: "/atlas", label: "nav.atlas", icon: <BodyIcon /> },
      { to: "/map", label: "nav.map", icon: <MapIcon /> },
      { to: "/lab", label: "nav.lab", icon: <FlaskIcon /> },
    ],
  },
  {
    label: "nav.you",
    items: [
      { to: "/search", label: "nav.search", icon: <SearchIcon /> },
      { to: "/progress", label: "nav.progress", icon: <ProgressIcon /> },
      { to: "/leaderboard", label: "nav.leaderboard", icon: <TrophyIcon /> },
      { to: "/docs", label: "nav.help", icon: <HelpIcon /> },
      { to: "/admin", label: "nav.admin", icon: <ShieldIcon />, admin: true },
    ],
  },
];

/** The phone tab bar: four direct tabs and "More", which opens everything else as a sheet. */
const tabs: { id: string; label: string; icon: ReactNode; to?: string; sections?: NavGroup[] }[] = [
  { id: "home", label: "nav.home", icon: <HomeIcon />, to: "/" },
  { id: "subjects", label: "nav.subjects", icon: <GridIcon />, to: "/subjects" },
  { id: "exam", label: "nav.exams", icon: <TimerIcon />, to: "/exam" },
  { id: "drive", label: "nav.drive", icon: <DriveIcon />, to: "/drive" },
  {
    id: "more",
    label: "nav.more",
    icon: <MoreIcon />,
    sections: [
      ...moreGroups.slice(0, 3),
      {
        label: "nav.you",
        items: [
          { to: "/alfond", label: "nav.alfond", icon: <AlfondIcon /> },
          { to: "/account", label: "nav.account", icon: <UserIcon /> },
          ...moreGroups[3].items,
        ],
      },
    ],
  },
];

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Groups as this student sees them: in their language, admin links only for admins. */
function useNavGroups(): <T extends { label?: string; items: NavItem[] }>(list: T[]) => T[] {
  const { user } = useAccount();
  const { t } = useI18n();
  const isAdmin = user?.role === "admin";
  const tr = (key: string) => t(key as MessageKey);
  return (list) =>
    list.map((g) => ({
      ...g,
      label: g.label && tr(g.label),
      items: g.items.filter((i) => isAdmin || !i.admin).map((i) => ({ ...i, label: tr(i.label) })),
    }));
}

/** The due count for a link, if it has one and anything is due. */
function dueFor(item: NavItem, counts: { cards: number; questions: number }): number {
  return item.due ? counts[item.due] : 0;
}

function DueCount({ n, kind }: { n: number; kind: NavItem["due"] }) {
  const { t } = useI18n();
  if (n <= 0) return null;
  const label = kind === "cards" ? t("nav.dueCards", { count: n }) : t("nav.dueQuestions", { count: n });
  return (
    <span className="nav-due" aria-label={label} title={label}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

const inSection = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));

/** Bottom navigation for phones; the sidebar stays reachable from the top bar's menu button. */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const counts = useDueCounts();
  const [open, setOpen] = useState<string | null>(null);
  const navGroups = useNavGroups();
  const { t } = useI18n();
  // A new page closes the sheet that led to it.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const visibleTabs = tabs.map((tab) => ({ ...tab, label: t(tab.label as MessageKey), sections: tab.sections && navGroups(tab.sections) }));
  const sheet = visibleTabs.find((t) => t.id === open);
  return (
    <>
      {sheet?.sections && (
        <div className="tabsheet-backdrop" onClick={() => { setOpen(null); }}>
          <div className="tabsheet" role="dialog" aria-modal="true" aria-label={sheet.label} onClick={(e) => { e.stopPropagation(); }}>
            <span className="tabsheet-handle" aria-hidden="true" />
            {sheet.sections.map((section, si) => (
              <Fragment key={section.label ?? si}>
                {section.label && <h3 className="tabsheet-subtitle">{section.label}</h3>}
                <div className="tabsheet-grid">
                  {section.items.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "tabsheet-link active" : "tabsheet-link")}>
                      <span className="tabsheet-icon">{item.icon}</span>
                      {item.label}
                      <DueCount n={dueFor(item, counts)} kind={item.due} />
                    </NavLink>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <nav className="tabbar" aria-label={t("nav.sections")}>
        {visibleTabs.map((tab) => {
          const items = (tab.sections ?? []).flatMap((s) => s.items);
          const active = tab.to ? inSection(pathname, tab.to) : items.some((i) => inSection(pathname, i.to));
          const due = items.reduce((n, i) => n + dueFor(i, counts), 0);
          const cls = `tabbar-item${active ? " active" : ""}${open === tab.id ? " open" : ""}`;
          return tab.to ? (
            <NavLink key={tab.id} to={tab.to} end={tab.to === "/"} className={cls} aria-current={active ? "page" : undefined}>
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          ) : (
            <button key={tab.id} type="button" className={cls} aria-expanded={open === tab.id} aria-haspopup="dialog" onClick={() => { setOpen((o) => (o === tab.id ? null : tab.id)); }}>
              {tab.icon}
              <span>{tab.label}</span>
              {due > 0 && <span className="tabbar-dot" aria-label={t("nav.dueReviews", { count: due })} />}
            </button>
          );
        })}
      </nav>
    </>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

const collapseShortcut = isMac ? "⌘\\" : "Ctrl+\\";

function SidebarLink({ link, due, onNavigate }: { link: NavItem; due: number; onNavigate: () => void }) {
  return (
    <NavLink
      to={link.to}
      end={link.end}
      className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
      onClick={onNavigate}
      title={link.label}
    >
      <span className="sidebar-link-icon">{link.icon}</span>
      <span className="sidebar-link-label">{link.label}</span>
      <DueCount n={due} kind={link.due} />
    </NavLink>
  );
}

/** The student's initial in a circle, as on their account row. */
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {(firstName(name)[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Sidebar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop only: shrinks the sidebar to an icon rail. The mobile drawer ignores it.
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false);
  const { pathname } = useLocation();
  const counts = useDueCounts();
  const navGroups = useNavGroups();
  const main = navGroups([{ items: mainLinks }])[0].items;
  const more = navGroups(moreGroups);
  const { t } = useI18n();
  const { user } = useAccount();

  // "More" opens by itself when the current page is inside it, and otherwise remembers nothing:
  // a fresh visit always starts with the short list.
  const inMore = more.some((g) => g.items.some((i) => inSection(pathname, i.to)));
  const [moreOpen, setMoreOpen] = useState(inMore);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (inMore && !moreOpen) setMoreOpen(true);
  }
  const moreDue = more.flatMap((g) => g.items).reduce((n, i) => n + dueFor(i, counts), 0);
  const closeDrawer = useCallback(() => { setDrawerOpen(false); }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [setCollapsed]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [drawerOpen]);

  const name = user?.fullName ?? "";

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <button
            type="button"
            className="icon-btn icon-btn-quiet sidebar-toggle"
            onClick={() => { setDrawerOpen((o) => !o); }}
            aria-label={drawerOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              {drawerOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M4 8h16M4 16h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>

          <div className="topbar-brand">
            <PulseLine width={22} height={13} />
            Pendik
          </div>

          <div className="topbar-actions">
            <button type="button" className="icon-btn icon-btn-quiet" onClick={openCommandPalette} aria-label={t("nav.commandPalette")}>
              <SearchIcon />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="sidebar-backdrop" onClick={closeDrawer} aria-hidden="true" />
      )}

      <aside
        id="app-sidebar"
        className={["sidebar", drawerOpen && "open", collapsed && "collapsed"].filter(Boolean).join(" ")}
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">
            <PulseLine width={24} height={14} />
            Pendik
          </span>
          <button
            type="button"
            className="icon-btn icon-btn-quiet sidebar-collapse-btn"
            onClick={() => { setCollapsed((c) => !c); }}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            title={`${collapsed ? t("nav.expand") : t("nav.collapse")} (${collapseShortcut})`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="sidebar-search"
          onClick={openCommandPalette}
          title={t("nav.commandPaletteHint")}
          aria-label={t("nav.commandPalette")}
        >
          <SearchIcon />
          <span className="sidebar-link-label">{t("nav.searchShort")}</span>
          <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>

        <nav className="sidebar-nav" aria-label={t("nav.primary")}>
          {main.map((link) => (
            <SidebarLink key={link.to} link={link} due={dueFor(link, counts)} onNavigate={closeDrawer} />
          ))}

          <button
            type="button"
            className={`sidebar-more${moreOpen ? " open" : ""}`}
            aria-expanded={moreOpen}
            aria-controls="sidebar-more-list"
            onClick={() => { setMoreOpen((o) => !o); }}
            title={t("nav.more")}
          >
            <span className="sidebar-link-icon"><MoreIcon /></span>
            <span className="sidebar-link-label">{t("nav.more")}</span>
            {!moreOpen && moreDue > 0 && <span className="sidebar-more-dot" aria-label={t("nav.dueReviews", { count: moreDue })} />}
            <svg className="sidebar-more-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {moreOpen && (
            <div id="sidebar-more-list" className="sidebar-more-list">
              {more.map((group) => (
                <Fragment key={group.label}>
                  <span className="sidebar-group-label" aria-hidden="true">{group.label}</span>
                  {group.items.map((link) => (
                    <SidebarLink key={link.to} link={link} due={dueFor(link, counts)} onNavigate={closeDrawer} />
                  ))}
                </Fragment>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/account"
            className={({ isActive }) => (isActive ? "sidebar-account active" : "sidebar-account")}
            onClick={closeDrawer}
            title={t("nav.account")}
          >
            <Avatar name={name || "?"} />
            <span className="sidebar-account-text">
              <span className="sidebar-account-name">{name || t("nav.account")}</span>
              {user?.track && <span className="sidebar-account-meta">{user.track === "IUP" ? "IUP" : "Reguler"}</span>}
            </span>
          </NavLink>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
