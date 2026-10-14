import { Suspense, useEffect } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { PulseLine } from "../../components/PulseLine";
import { useAccount } from "../../hooks/useAccount";
import { useI18n } from "../../i18n/useI18n";

/** Fetched in the background once the admin area is open, so switching tabs doesn't wait on a download. */
function preloadTabs() {
  void import("./AdminData");
  void import("./AdminStudents");
  void import("./AdminLecturers");
  void import("./AdminPackages");
  void import("./AdminQuestions");
  void import("./AdminImport");
  void import("./AdminDrive");
  void import("./AdminSchedule");
}

/**
 * The admin area, most-used first: data (students and lecturers), the schedule, the Drive sync, then
 * questions, packages and imports. The heading and tabs stay put when a tab changes; only the content below them is swapped (and loads in place).
 */
export function Admin() {
  const { user } = useAccount();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (isAdmin) preloadTabs();
  }, [isAdmin]);
  if (!isAdmin) return <Navigate to="/" replace />;
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "admin-tab active" : "admin-tab");
  return (
    <section className="page admin-page">
      <h1>{t("admin.title")}</h1>
      <nav className="admin-tabs" aria-label={t("admin.title")}>
        <NavLink to="/admin/data" className={tab}>{t("admin.data")}</NavLink>
        <NavLink to="/admin/schedule" className={tab}>{t("schedule.adminTitle")}</NavLink>
        <NavLink to="/admin/drive" className={tab}>{t("admin.drive")}</NavLink>
        <NavLink to="/admin/questions" className={tab}>{t("admin.questionBank")}</NavLink>
        <NavLink to="/admin/packages" className={tab}>{t("admin.packages")}</NavLink>
        <NavLink to="/admin/import" className={tab}>{t("admin.import")}</NavLink>
      </nav>
      {/* Keyed by tab so a crash in one resets when another is opened. */}
      <ErrorBoundary key={pathname}>
        <Suspense
          fallback={
            <div className="route-loading" role="status" aria-label={t("app.loadingPage")}>
              <PulseLine />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </section>
  );
}
