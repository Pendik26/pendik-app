import { useCallback, useEffect, useState } from "react";
import { QuestionList } from "../../components/admin/QuestionList";
import { useI18n } from "../../i18n/useI18n";
import { BANK_PAGE, questionFacets, searchQuestions, type BankFilter, type BankQuestion } from "../../lib/admin";

type Facets = Awaited<ReturnType<typeof questionFacets>>;

/** Every question in the bank, across packages: filter, search, edit, delete. */
export function AdminQuestions() {
  const { t } = useI18n();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [filter, setFilter] = useState<BankFilter>({});
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    questionFacets().then(setFacets, (e: Error) => { setProblem(e.message); });
  }, []);

  const search = useCallback(() => {
    searchQuestions(filter).then(setQuestions, (e: Error) => { setProblem(e.message); });
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
        <button type="submit" className="btn btn-small">{t("admin.searchButton")}</button>
      </form>

      {!questions ? (
        <p className="subtitle">{t("common.loading")}</p>
      ) : questions.length === 0 ? (
        <p className="account-note">{t("admin.noQuestionsFound")}</p>
      ) : (
        <>
          <p className="account-note">
            {questions.length >= BANK_PAGE ? t("admin.questionsFirstN", { count: BANK_PAGE }) : t("admin.questionsFound", { count: questions.length })}
          </p>
          <QuestionList
            questions={questions}
            onChanged={search}
            details={(q) => {
              const b = q as BankQuestion;
              return [t("admin.blockN", { block: b.block }), b.source, b.year, b.subject,
                b.packages.length ? b.packages.join(", ") : t("admin.inNoPackage")].filter(Boolean).join(" · ");
            }}
          />
        </>
      )}
    </div>
  );
}
