import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../../i18n/useI18n";
import { listLecturerReports } from "../../lib/admin";

/** What the Data tab hands its sub-tabs. */
export interface DataContext {
  setOpenReports: (count: number) => void;
}

/** The people data in one place: students and lecturers, one sub-tab each. */
export function AdminData() {
  const { t } = useI18n();
  // Open notes from students (wrong numbers, suggested lecturers), counted on the Lecturers tab so
  // they're seen without opening it. The Lecturers page passes its fresh count back after each change.
  const [open, setOpen] = useState(0);
  useEffect(() => {
    listLecturerReports().then((r) => { setOpen(r.length); }, () => { setOpen(0); });
  }, []);
  const tab = ({ isActive }: { isActive: boolean }) => (isActive ? "admin-tab active" : "admin-tab");
  return (
    <div className="admin-data">
      <nav className="admin-tabs admin-subtabs" aria-label={t("admin.data")}>
        <NavLink to="/admin/data/students" className={tab}>{t("admin.students")}</NavLink>
        <NavLink to="/admin/data/lecturers" className={tab}>
          {t("admin.lecturers")}
          {open > 0 && <span className="nav-due" title={t("admin.openReports", { count: open })} aria-label={t("admin.openReports", { count: open })}>{open}</span>}
        </NavLink>
      </nav>
      <Outlet context={{ setOpenReports: setOpen } satisfies DataContext} />
    </div>
  );
}
