import { BookmarkIcon } from "../icons";
import { useBookmarks } from "../../hooks/useBookmarks";
import { useI18n } from "../../i18n/useI18n";

/** "Bookmark" / "Bookmarked" on one question. */
export function BookmarkButton({ questionId }: { questionId: string }) {
  const { t } = useI18n();
  const { has, toggle, problem } = useBookmarks();
  const on = has(questionId);
  return (
    <button type="button" className="bookmark-btn" aria-pressed={on} title={problem ?? undefined}
      onClick={() => { toggle(questionId); }}>
      <BookmarkIcon filled={on} />
      {on ? t("bookmarks.saved") : t("bookmarks.save")}
    </button>
  );
}
