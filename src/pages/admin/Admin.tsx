import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAccount } from "../../hooks/useAccount";
import { useI18n } from "../../i18n/useI18n";

/** The admin area: students, questions and packages, imports and the Drive sync. */
export function Admin() {
  const { user } = useAccount();
  const { t } = useI18n();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "admin-tab active" : "admin-tab");
  return (
    <section className="page admin-page">
      <h1>{t("admin.title")}</h1>
      <nav className="admin-tabs" aria-label={t("admin.title")}>
        <NavLink to="/admin/students" className={tab}>{t("admin.students")}</NavLink>
        <NavLink to="/admin/packages" className={tab}>{t("admin.packages")}</NavLink>
        <NavLink to="/admin/import" className={tab}>{t("admin.import")}</NavLink>
        <NavLink to="/admin/drive" className={tab}>{t("admin.drive")}</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
