import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { useI18n } from "../i18n/useI18n";

/** Any address the app has no page for. */
export function NotFound() {
  const { t } = useI18n();
  return (
    <section className="page">
      <EmptyState title={t("misc.notFound")}>
        <p>{t("misc.notFoundBody")}</p>
        <p>
          <Link to="/" className="btn">
            {t("misc.goHome")}
          </Link>
        </p>
      </EmptyState>
    </section>
  );
}
