import { useCallback, useEffect, useState } from "react";
import { QuestionList } from "../../components/admin/QuestionList";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import { BANK_PAGE, questionFacets, searchQuestions, type BankFilter, type BankQuestion } from "../../lib/admin";

type Facets = Awaited<ReturnType<typeof questionFacets>>;

/** Every question in the bank, across packages: filter, search, edit, delete. */
export function AdminQuestions() {
  const { t, language } = useI18n();
  const day = (iso: string) => new Date(iso).toLocaleDateString(language === "id" ? "id-ID" : "en-GB", { dateStyle: "medium" });
  const [facets, setFacets] = useState<Facets | null>(null);
  const [filter, setFilter] = useState<BankFilter>({});
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // True while the last page came back full, so there may be more.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    questionFacets().then(setFacets, (e: Error) => { setProblem(errorText(e)); });
  }, []);

  const search = useCallback(() => {
    searchQuestions(filter).then((qs) => { setQuestions(qs); setMore(qs.length >= BANK_PAGE); }, (e: Error) => { setProblem(errorText(e)); });
  }, [filter]);
  useEffect(search, [search]);

  const pick = (key: keyof BankFilter, value: string) => {
    setFilter((f) => ({ ...f, [key]: value === "" ? undefined : key === "year" ? Number(value) : value }));
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      <form className="admin-toolbar" onSubmit={(e) => { e.preventDefault(); setFilter((f) => ({ ...f, text })); }}>
        <input className="form-input" type="search" placeholder={t("admin.searchQuestions")} value={text}
          onChange={(e) => { setText(e.target.value); }} />
        <select className="form-input admin-select" aria-label={t("admin.filterBlock")} value={filter.block ?? ""} onChange={(e) => { pick("block", e.target.value); }}>
          <option value="">{t("admin.anyBlock")}</option>
          {facets?.blocks.map((b) => <option key={b} value={b}>{t("admin.blockN", { block: b })}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterSource")} value={filter.source ?? ""} onChange={(e) => { pick("source", e.target.value); }}>
          <option value="">{t("admin.anySource")}</option>
          {facets?.sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterYear")} value={filter.year ?? ""} onChange={(e) => { pick("year", e.target.value); }}>
          <option value="">{t("admin.anyYear")}</option>
          {facets?.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.filterSubject")} value={filter.subject ?? ""} onChange={(e) => { pick("subject", e.target.value); }}>
          <option value="">{t("admin.anySubject")}</option>
          {facets?.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-input admin-select" aria-label={t("admin.status")} value={filter.status ?? ""}
          onChange={(e) => { const v = e.target.value; setFilter((f) => ({ ...f, status: v === "draft" || v === "published" ? v : undefined })); }}>
          <option value="">{t("admin.anyStatus")}</option>
          <option value="draft">{t("admin.draft")}</option>
          <option value="published">{t("admin.published")}</option>
        </select>
        <label className="admin-check">
          <input type="checkbox" checked={filter.deleted === true} onChange={(e) => { setFilter((f) => ({ ...f, deleted: e.target.checked })); }} />
          {t("admin.showDeleted")}
        </label>
        <button type="submit" className="btn btn-small">{t("admin.searchButton")}</button>
      </form>

      {!questions ? (
        <p className="subtitle">{t("common.loading")}</p>
      ) : questions.length === 0 ? (
        <p className="account-note">{t("admin.noQuestionsFound")}</p>
      ) : (
        <>
          <p className="account-note">
            {more ? t("admin.questionsFirstN", { count: questions.length }) : t("admin.questionsFound", { count: questions.length })}
          </p>
          <QuestionList
            questions={questions}
            onChanged={search}
            details={(q) => {
              const b = q as BankQuestion;
              return [t("admin.blockN", { block: b.block }), b.source, b.year, b.subject,
                b.packages.length ? b.packages.join(", ") : t("admin.inNoPackage"),
                b.status === "draft" ? t("admin.draft") : t("admin.published"),
                t("admin.createdUpdated", { created: day(b.created_at), updated: day(b.updated_at) })].filter(Boolean).join(" · ");
            }}
          />
          {more && (
            <button type="button" className="btn btn-secondary btn-small" disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                searchQuestions(filter, questions.length).then(
                  (next) => { setQuestions([...questions, ...next]); setMore(next.length >= BANK_PAGE); setLoadingMore(false); },
                  (e: Error) => { setProblem(errorText(e)); setLoadingMore(false); },
                );
              }}>
              {loadingMore ? t("common.loading") : t("admin.loadMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
