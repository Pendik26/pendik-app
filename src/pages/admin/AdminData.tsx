import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../../i18n/useI18n";

/** The people data in one place: students and lecturers, one sub-tab each. */
export function AdminData() {
  const { t } = useI18n();
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "admin-tab active" : "admin-tab");
  return (
    <div className="admin-data">
      <nav className="admin-tabs admin-subtabs" aria-label={t("admin.data")}>
        <NavLink to="/admin/data/students" className={tab}>{t("admin.students")}</NavLink>
        <NavLink to="/admin/data/lecturers" className={tab}>{t("admin.lecturers")}</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
