import { Link, Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import clsx from "clsx";
import {
  ChartCandlestick,
  ChartNoAxesCombined,
  ListFilter,
  Menu,
  Newspaper,
  type LucideIcon,
  Route as RouteIcon,
  Rss,
  Star,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

export const Route = createRootRoute({
  component: RootLayout,
});

const iconProps = { size: 16, strokeWidth: 1.7, "aria-hidden": true as const };

const PLACEHOLDER_NAV: { label: string; Icon: LucideIcon }[] = [
  { label: "News 快讯", Icon: Rss },
  { label: "自选", Icon: Star },
  { label: "筛选器", Icon: ListFilter },
  { label: "研报", Icon: Newspaper },
];

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const eventsActive = pathname.startsWith("/events");
  const turnoverActive = pathname.startsWith("/turnover");
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="menu-toggle"
          aria-label={navOpen ? "关闭导航" : "打开导航"}
          aria-expanded={navOpen}
          aria-controls={navId}
          onClick={() => setNavOpen((open) => !open)}
        >
          <Menu size={18} strokeWidth={1.7} aria-hidden />
        </button>
        <Link to="/" className="brand">
          <img className="brand-mark" src="/brand/brand-mark.svg" alt="" width={22} height={22} />
          <span className="brand-name">
            AlphaDesk <span>Terminal</span>
          </span>
        </Link>
      </header>

      <div
        className={clsx("nav-backdrop", navOpen && "is-on")}
        aria-hidden={!navOpen}
        onClick={() => setNavOpen(false)}
      />

      <div className="workspace">
        <nav id={navId} className={clsx("nav", navOpen && "is-open")} aria-label="主导航">
          <div className="nav-drawer-head">
            <span className="nav-drawer-title">导航</span>
            <button
              type="button"
              className="nav-close"
              aria-label="关闭导航"
              onClick={() => setNavOpen(false)}
            >
              <X size={18} strokeWidth={1.7} aria-hidden />
            </button>
          </div>
          <div className="nav-section">
            <div className="nav-label">工作区</div>
            {PLACEHOLDER_NAV.map(({ label, Icon }) => (
              <button key={label} type="button" className="nav-item" disabled>
                <Icon {...iconProps} />
                <span>{label}</span>
                <span className="soon">待建</span>
              </button>
            ))}
          </div>
          <div className="nav-section">
            <div className="nav-label">宏观</div>
            <Link to="/events" className={clsx("nav-item", eventsActive && "is-active")}>
              <RouteIcon {...iconProps} />
              <span>事件追踪</span>
            </Link>
            <Link to="/turnover" className={clsx("nav-item", turnoverActive && "is-active")}>
              <ChartNoAxesCombined {...iconProps} />
              <span>A股盘面</span>
            </Link>
            <button type="button" className="nav-item" disabled>
              <ChartCandlestick {...iconProps} />
              <span>市场总览</span>
              <span className="soon">待建</span>
            </button>
          </div>
        </nav>
        <main className="content-pane" data-scroll-restoration-id="content-pane">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
