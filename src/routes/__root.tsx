import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import "@/features/event-track/event-track.scss";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-brand">
          <span className="app-brand__mark">◈</span>
          <span>
            <strong>Investor</strong>
            <small>事件追踪 · A股量能</small>
          </span>
        </Link>
        <nav className="app-nav" aria-label="主导航">
          <Link
            to="/"
            className="app-nav__link"
            activeProps={{ className: "app-nav__link--active" }}
          >
            事件追踪
          </Link>
          <Link
            to="/turnover"
            className="app-nav__link"
            activeProps={{ className: "app-nav__link--active" }}
          >
            A股量能
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        本工具仅提供研究信息聚合与整理，不构成投资建议。数据来自公司 IR 官网、SEC EDGAR、Nasdaq
        Calendar、Federal Reserve 等公开来源。
      </footer>
    </div>
  );
}
