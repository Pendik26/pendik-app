import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { StreakBadge } from "./StreakBadge";
import { QuizDueBadge } from "./QuizDueBadge";
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
  TrophyIcon,
  UserIcon,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
  /** Shows how many reviews are due here. */
  due?: "cards" | "questions";
}

interface NavGroup {
  /** Shown above the group in the sidebar; the first group has none. */
  label?: string;
  items: NavItem[];
}

// Grouped by what the student is doing: studying (with what's due), reading, exploring, and
// their own pages. Search lives in the sidebar footer (and the phone tab bar), so it isn't
// repeated here.
const groups: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Home", end: true, icon: <HomeIcon /> },
      { to: "/subjects", label: "Subjects", icon: <GridIcon /> },
      { to: "/alfond", label: "Alfond", icon: <AlfondIcon /> },
    ],
  },
  {
    label: "Study",
    items: [
      { to: "/flashcards", label: "Flashcards", icon: <CardsIcon />, due: "cards" },
      { to: "/quizzes", label: "Quizzes", icon: <QuizIcon />, due: "questions" },
      { to: "/occlusion", label: "Image Occlusion", icon: <OcclusionIcon /> },
      { to: "/exam", label: "Mock exam", icon: <TimerIcon /> },
      { to: "/plan", label: "Exam plan", icon: <CalendarIcon /> },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/ebooks", label: "Ebooks", icon: <BookIcon /> },
      { to: "/summaries", label: "Summaries", icon: <SummaryIcon /> },
      { to: "/modules", label: "Modules", icon: <SlidesIcon /> },
      { to: "/drive", label: "Class Drive", icon: <DriveIcon /> },
    ],
  },
  {
    label: "Explore",
    items: [
      { to: "/atlas", label: "3D anatomy", icon: <BodyIcon /> },
      { to: "/map", label: "Knowledge map", icon: <MapIcon /> },
      { to: "/lab", label: "Virtual Lab", icon: <FlaskIcon /> },
    ],
  },
  {
    label: "You",
    items: [
      { to: "/progress", label: "Progress", icon: <ProgressIcon /> },
      { to: "/leaderboard", label: "Leaderboard", icon: <TrophyIcon /> },
      { to: "/account", label: "Account", icon: <UserIcon /> },
      { to: "/docs", label: "Help", icon: <HelpIcon /> },
    ],
  },
];

/** The phone tab bar: two direct tabs and three that open their groups as a sheet. */
const tabs: { id: string; label: string; icon: ReactNode; to?: string; sections?: NavGroup[] }[] = [
  { id: "home", label: "Home", icon: <HomeIcon />, to: "/" },
  { id: "study", label: "Study", icon: <CardsIcon />, sections: [{ items: [groups[0].items[1], ...groups[1].items] }] },
  { id: "library", label: "Library", icon: <BookIcon />, sections: [groups[2], groups[3]] },
  { id: "search", label: "Search", icon: <SearchIcon />, to: "/search" },
  { id: "me", label: "Me", icon: <UserIcon />, sections: [{ items: [groups[0].items[2], ...groups[4].items] }] },
];

/** The due count for a link, if it has one and anything is due. */
function dueFor(item: NavItem, counts: { cards: number; questions: number }): number {
  return item.due ? counts[item.due] : 0;
}

function DueCount({ n, label }: { n: number; label: string }) {
  if (n <= 0) return null;
  return (
    <span className="nav-due" aria-label={`${n} ${label} due`} title={`${n} ${label} due for review`}>
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

  const sheet = tabs.find((t) => t.id === open);
  return (
    <>
      {sheet?.sections && (
        <div className="tabsheet-backdrop" onClick={() => { setOpen(null); }}>
          <div className="tabsheet" role="dialog" aria-modal="true" aria-label={sheet.label} onClick={(e) => { e.stopPropagation(); }}>
            <span className="tabsheet-handle" aria-hidden="true" />
            <h2 className="tabsheet-title">{sheet.label}</h2>
            {sheet.sections.map((section, si) => (
              <Fragment key={section.label ?? si}>
                {section.label && section.label !== sheet.label && <h3 className="tabsheet-subtitle">{section.label}</h3>}
                <div className="tabsheet-grid">
                  {section.items.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "tabsheet-link active" : "tabsheet-link")}>
                      <span className="tabsheet-icon">{item.icon}</span>
                      {item.label}
                      <DueCount n={dueFor(item, counts)} label={item.due === "cards" ? "flashcards" : "quiz questions"} />
                    </NavLink>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <nav className="tabbar" aria-label="Sections">
        {tabs.map((tab) => {
          // Subject pages sit under Home: they're reached from its subject cards.
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
              {due > 0 && <span className="tabbar-dot" aria-label={`${due} reviews due`} />}
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

/** Marks which ends of the scrolling link list have more links past them, for the edge fades. */
function markScrollEdges(nav: HTMLElement) {
  nav.toggleAttribute("data-more-above", nav.scrollTop > 1);
  nav.toggleAttribute("data-more-below", nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
}

const collapseShortcut = isMac ? "⌘\\" : "Ctrl+\\";

export function Sidebar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Desktop only: shrinks the sidebar to an icon rail. The mobile drawer ignores it.
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false);
  const navRef = useRef<HTMLElement>(null);
  const hoveredLink = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const counts = useDueCounts();
  // On the collapsed rail, the hovered or focused link's name, shown beside it right away
  // (a title attribute takes a second to appear and can't be styled).
  const [tip, setTip] = useState<{ label: string; x: number; y: number; path: string } | null>(null);
  const showTip = useCallback(
    (link: HTMLElement | null) => {
      if (!collapsed || !link || !window.matchMedia("(min-width: 961px)").matches) { setTip(null); return; }
      const r = link.getBoundingClientRect();
      setTip({ label: link.dataset.label ?? "", x: r.right + 14, y: r.top + r.height / 2, path: pathname });
    },
    [collapsed, pathname],
  );

  // Two glass "lenses" sit behind the links: one marks the current page, the other follows the
  // pointer. Both are positioned from the link boxes through CSS custom properties on the nav,
  // and CSS springs them between links.
  const placeLens = useCallback((name: "active" | "hover", link: Element | null) => {
    const nav = navRef.current;
    if (!nav) return;
    if (!(link instanceof HTMLElement)) {
      nav.style.setProperty(`--${name}-o`, "0");
      return;
    }
    nav.style.setProperty(`--${name}-x`, `${link.offsetLeft}px`);
    nav.style.setProperty(`--${name}-y`, `${link.offsetTop}px`);
    nav.style.setProperty(`--${name}-w`, `${link.offsetWidth}px`);
    nav.style.setProperty(`--${name}-h`, `${link.offsetHeight}px`);
    nav.style.setProperty(`--${name}-o`, "1");
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const sync = () => {
      placeLens("active", nav.querySelector(".sidebar-link.active"));
      if (hoveredLink.current) placeLens("hover", hoveredLink.current);
      markScrollEdges(nav);
    };
    sync();
    // On a short window the links scroll: keep the current page's in view.
    const active = nav.querySelector<HTMLElement>(".sidebar-link.active");
    if (active) {
      const top = active.offsetTop - nav.scrollTop;
      if (top < 0 || top + active.offsetHeight > nav.clientHeight) nav.scrollTop = active.offsetTop - nav.clientHeight / 2;
    }
    // Only animate once the lenses have a real starting position.
    const frame = requestAnimationFrame(() => { nav.setAttribute("data-ready", ""); });
    // Keeps the lenses glued to the links while the sidebar collapses or expands.
    const observer = new ResizeObserver(sync);
    observer.observe(nav);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname, placeLens]);

  // While the sidebar itself is resizing, the lenses follow the links frame by frame (via the
  // ResizeObserver) instead of springing, so they never lag behind the narrowing rail.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const nav = navRef.current;
    if (!nav) return;
    nav.setAttribute("data-morphing", "");
    const timer = window.setTimeout(() => { nav.removeAttribute("data-morphing"); }, 700);
    return () => { window.clearTimeout(timer); };
  }, [collapsed]);

  const onNavPointerMove = (e: PointerEvent<HTMLElement>) => {
    const nav = navRef.current;
    const link = (e.target as HTMLElement).closest(".sidebar-link") as HTMLElement | null;
    if (!nav || !link) return;
    if (link !== hoveredLink.current) {
      // Coming from outside the nav, the lens appears in place instead of sliding in from
      // wherever it was last.
      if (!hoveredLink.current) {
        nav.setAttribute("data-lens-jump", "");
        requestAnimationFrame(() => requestAnimationFrame(() => { nav.removeAttribute("data-lens-jump"); }));
      }
      hoveredLink.current = link;
      placeLens("hover", link);
      showTip(link);
    }
    const rect = link.getBoundingClientRect();
    nav.style.setProperty("--lens-px", `${e.clientX - rect.left}px`);
    nav.style.setProperty("--lens-py", `${e.clientY - rect.top}px`);
  };

  const onNavPointerLeave = () => {
    hoveredLink.current = null;
    placeLens("hover", null);
    setTip(null);
  };

  // The name goes away when the rail expands (the labels are back) or the page changes.
  const shownTip = tip && collapsed && tip.path === pathname ? tip : null;

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

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <button
            type="button"
            className="icon-btn sidebar-toggle"
            onClick={() => { setDrawerOpen((o) => !o); }}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              {drawerOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>

          <div className="topbar-brand">
            <PulseLine width={24} height={14} />
            Medicine
          </div>

          <div className="topbar-actions">
            <StreakBadge />
            <QuizDueBadge />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="sidebar-backdrop" onClick={() => { setDrawerOpen(false); }} aria-hidden="true" />
      )}

      <aside
        id="app-sidebar"
        className={["sidebar", drawerOpen && "open", collapsed && "collapsed"].filter(Boolean).join(" ")}
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">
            <PulseLine width={28} height={17} />
            Medicine
          </span>
          <button
            type="button"
            className="icon-btn sidebar-collapse-btn"
            onClick={() => { setCollapsed((c) => !c); }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (${collapseShortcut})`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.6" />
              <path
                d={collapsed ? "M13.5 10l2 2-2 2" : "M16 10l-2 2 2 2"}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <nav
          className="sidebar-nav"
          aria-label="Primary"
          ref={navRef}
          onPointerMove={onNavPointerMove}
          onPointerLeave={onNavPointerLeave}
          onFocus={(e) => { showTip((e.target as HTMLElement).closest<HTMLElement>(".sidebar-link")); }}
          onBlur={() => { setTip(null); }}
          onScroll={(e) => {
            hoveredLink.current = null;
            setTip(null);
            markScrollEdges(e.currentTarget);
          }}
        >
          <span className="sidebar-lens sidebar-lens-active" aria-hidden="true" />
          <span className="sidebar-lens sidebar-lens-hover" aria-hidden="true" />
          {groups.map((group, gi) => (
            <Fragment key={group.label ?? gi}>
              {group.label && (
                <span className="sidebar-group-label" aria-hidden="true">
                  {group.label}
                </span>
              )}
              {group.items.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
                  onClick={() => { setDrawerOpen(false); }}
                  data-label={link.label}
                >
                  <span className="sidebar-link-icon">{link.icon}</span>
                  <span className="sidebar-link-label">{link.label}</span>
                  <DueCount n={dueFor(link, counts)} label={link.due === "cards" ? "flashcards" : "quiz questions"} />
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-badges">
            <StreakBadge />
            <QuizDueBadge />
          </div>
          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="icon-btn command-trigger"
              onClick={openCommandPalette}
              aria-label="Open command palette"
              title="Search & jump to anything"
            >
              <SearchIcon />
              <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {shownTip && (
        <span className="sidebar-tip" style={{ left: shownTip.x, top: shownTip.y }} aria-hidden="true">
          {shownTip.label}
        </span>
      )}
    </>
  );
}
