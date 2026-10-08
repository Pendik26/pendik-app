import { Link } from "react-router-dom";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { blockById } from "../lib/blocks";
import { BUILD, commitUrl, SOURCE_URL } from "../lib/buildInfo";
import { focusBlockId } from "../lib/examPlan";
import { STORAGE_KEYS } from "../lib/storage";
import { useI18n } from "../i18n/useI18n";

/** "Block 1.2: Integument and…" → "Integument and Musculoskeletal System". */
const shortName = (label: string) => label.replace(/^Block\s+[\d.]+:\s*/i, "");

/** On every page: the legal pages and source, the block being studied, and this version. */
export function SiteFooter() {
  // Read so the footer follows a change of block on the Account page.
  const { t } = useI18n();
  const [chosen] = useLocalStorage<string>(STORAGE_KEYS.currentBlock, "");
  const blockId = blockById(chosen) ? chosen : focusBlockId();
  const block = blockId ? blockById(blockId) : undefined;
  const built = BUILD.builtAt ? new Date(BUILD.builtAt).toLocaleDateString(t("drive.dateLocale"), { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label={t("misc.aboutSite")}>
        <a href="/privacy">{t("misc.privacy")}</a>
        <a href="/terms">{t("misc.terms")}</a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {t("misc.source")}
        </a>
      </nav>
      <p className="site-footer-meta">
        {block && (
          <Link to={`/plan/${block.id}`} title={`${chosen === block.id ? t("misc.yourBlock") : t("misc.currentBlock")}: ${shortName(block.label)}`}>
            {t("drive.block", { block: block.id })} <span className="site-footer-dim">{shortName(block.label)}</span>
          </Link>
        )}
        <a
          href={commitUrl()}
          target="_blank"
          rel="noopener noreferrer"
          title={BUILD.subject ? `${BUILD.subject}${built ? ` (${t("misc.built", { date: built })})` : ""}` : t("misc.versionSource")}
        >
          {BUILD.version}
          {BUILD.short && <span className="site-footer-dim"> · {t("misc.build", { id: BUILD.short })}</span>}
        </a>
      </p>
    </footer>
  );
}
