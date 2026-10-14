import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QuestionImage } from "../../components/exam/QuestionImage";
import { QuestionPreview } from "../../components/admin/QuestionPreview";
import { hasPicture } from "../../lib/questionPreview";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import { importQuestions, listAllPackages, listImports, packagesFromImport, suggestedMinutes, type ImportSummary } from "../../lib/admin";
import { loadExamRecords } from "../../lib/exams";
import { clearImportDraft, readImportDraft, saveImportDraft, useImportDraftKept } from "../../lib/importDraft";
import { fillSlots, imageSlots, repeatedSlots, toWebp, uploadImage } from "../../lib/importImages";
import { distinct, matchSpelling } from "../../lib/packageFilter";
import { parseQuestionMarkdown } from "../../lib/questionMarkdown";

/**
 * Importing a Markdown file of questions: check it, save the questions as drafts, then make an
 * exam package and a practice package from them (both drafts until published).
 */
export function AdminImport() {
  const { t, language } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The import saved (or picked from earlier ones) that packages are made from, with what it carries.
  const [imported, setImported] = useState<{ importId: string; count: number; title: string; year: number | null } | null>(null);
  // Ids made once per file and once per package form, so a retry or a second click can't save twice.
  const [importFormId, setImportFormId] = useState(() => crypto.randomUUID());
  const [packageIds, setPackageIds] = useState(() => ({ exam: crypto.randomUUID(), practice: crypto.randomUUID() }));
  const [earlier, setEarlier] = useState<ImportSummary[] | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [made, setMade] = useState<{ exam_id: string; practice_id: string } | null>(null);
  // Pictures the file asks for as ![..](upload:label); once uploaded, the label becomes the picture's path.
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => readImportDraft());
  const effective = fillSlots(text, uploaded);
  const slots = imageSlots(text);
  const repeated = repeatedSlots(text);
  const parsed = effective.trim() ? parseQuestionMarkdown(effective) : null;
  const header = parsed?.header ?? null;
  const [examTitle, setExamTitle] = useState("");
  const [practiceTitle, setPracticeTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [trackBest, setTrackBest] = useState(true);
  const [block, setBlock] = useState("");
  const [source, setSource] = useState("");
  const [year, setYear] = useState("");
  const [onlyPictures, setOnlyPictures] = useState(false);
  // Blocks and types already in use, so a new package matches their spelling.
  const [known, setKnown] = useState<{ blocks: string[]; sources: string[] }>({ blocks: [], sources: [] });
  useEffect(() => {
    listAllPackages().then(
      (ps) => { setKnown({ blocks: distinct(ps.map((p) => p.block)), sources: distinct(ps.map((p) => p.source)) }); },
      () => undefined,
    );
  }, []);
  const finalBlock = matchSpelling(block, known.blocks);
  const finalSource = matchSpelling(source, known.sources);
  // Four digits, or empty for none.
  const yearOk = /^(19|20|21)[0-9]{2}$/.test(year.trim()) || year.trim() === "";
  const previewed = (parsed?.questions ?? []).map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => !onlyPictures || hasPicture(q));

  // Keep an unfinished import in this browser, so a refresh doesn't lose it.
  const draftLost = !useImportDraftKept();
  useEffect(() => {
    if (!imported) saveImportDraft({ text, uploaded });
  }, [text, uploaded, imported]);

  const uploadPicture = async (label: string, file: File | undefined) => {
    if (!file) return;
    setUploading(label);
    setProblem(null);
    try {
      const path = await uploadImage(await toWebp(file), label);
      setUploaded((u) => ({ ...u, [label]: path }));
    } catch (e) {
      setProblem(t("admin.imageFailed", { label, message: errorText(e) }));
    }
    setUploading(null);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setImportFormId(crypto.randomUUID());
    setUploaded({});
    setDraft(null);
    setImported(null);
    setMade(null);
  };

  const save = async () => {
    if (!parsed || !header || parsed.problems.length) return;
    setBusy(true);
    setProblem(null);
    try {
      const importId = await importQuestions(header.title, effective, parsed.questions, importFormId);
      clearImportDraft();
      startPackages({ importId, count: parsed.questions.length, title: header.title, year: header.year }, header.block, header.source);
    } catch (e) {
      setProblem(errorText(e));
    }
    setBusy(false);
  };

  /** Opens the package form for a saved import, filled from what the import carries. */
  const startPackages = (from: { importId: string; count: number; title: string; year: number | null }, fromBlock: string | null, fromSource: string | null) => {
    setImported(from);
    setPackageIds({ exam: crypto.randomUUID(), practice: crypto.randomUUID() });
    setExamTitle(from.title);
    setPracticeTitle(`${from.title} (${t("exam.modePractice").toLowerCase()})`);
    setMinutes(String(suggestedMinutes(from.count)));
    setBlock(fromBlock ?? "");
    setSource(fromSource ?? "");
    setYear(from.year ? String(from.year) : "");
  };

  // Earlier imports, for making packages from one later (shown while no file is open).
  useEffect(() => {
    if (imported || text.trim() || earlier) return;
    listImports().then(setEarlier, () => { setEarlier([]); });
  }, [imported, text, earlier]);

  const makePackages = async () => {
    if (!imported || !finalBlock || !yearOk) return;
    setBusy(true);
    setProblem(null);
    try {
      setMade(await packagesFromImport({
        importId: imported.importId,
        examTitle: examTitle.trim() || imported.title,
        practiceTitle: practiceTitle.trim() || imported.title,
        block: finalBlock,
        source: finalSource || null,
        year: year.trim() ? Number(year.trim()) : null,
        ids: packageIds,
        timeLimitMinutes: Math.max(1, Math.min(300, Number(minutes) || suggestedMinutes(imported.count))),
        trackBest,
      }));
      await loadExamRecords().catch(() => undefined);
    } catch (e) {
      setProblem(errorText(e));
    }
    setBusy(false);
  };

  return (
    <div className="admin-section">
      {problem && <p className="account-error" role="alert">{problem}</p>}
      {draftLost && !imported && text.trim() && <p className="account-error" role="status">{t("admin.draftNotKept")}</p>}

      {!imported && draft && !text.trim() && (
        <p className="account-note admin-draft">
          {t("admin.draftFound")}{" "}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { setText(draft.text); setUploaded(draft.uploaded); setDraft(null); }}>{t("admin.draftRestore")}</button>{" "}
          <button type="button" className="btn btn-link" onClick={() => { clearImportDraft(); setDraft(null); }}>{t("admin.draftDiscard")}</button>
        </p>
      )}

      {!imported && (
        <>
          <p className="account-note">
            {t("admin.importHint")} <a href="https://github.com/Pendik26/pendik-app/blob/major/docs/questions.md" target="_blank" rel="noopener noreferrer">{t("admin.formatGuide")}</a>
          </p>
          <div className="admin-toolbar">
            <label className="btn btn-secondary btn-small">
              {t("admin.chooseFile")}
              <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => void readFile(e.target.files?.[0])} />
            </label>
          </div>
          <textarea className="form-input admin-textarea admin-mono" rows={14} value={text} spellCheck={false}
            placeholder={"---\ntitle: Block 1.1 UB 2025\nblock: 1.1\nsource: ub\nyear: 2025\n---\n\n## 1\n…"}
            onChange={(e) => { setText(e.target.value); }} />
        </>
      )}

      {!imported && !text.trim() && earlier && earlier.length > 0 && (
        <div className="account-card">
          <h3>{t("admin.earlierImports")}</h3>
          <p className="account-note">{t("admin.earlierImportsHint")}</p>
          <label className="admin-check">
            <input type="checkbox" checked={showEmpty} onChange={(e) => { setShowEmpty(e.target.checked); }} />
            {t("admin.showEmptyImports")}
          </label>
          <ul className="admin-imports">
            {earlier.filter((i) => showEmpty || i.question_count > 0).map((i) => (
              <li key={i.id}>
                <span>
                  <strong>{i.title}</strong>
                  <small>
                    {[new Date(i.created_at).toLocaleDateString(language === "id" ? "id-ID" : "en-GB", { dateStyle: "medium" }),
                      t("admin.questionsN", { count: i.question_count }),
                      i.package_count ? t("admin.packagesMadeN", { count: i.package_count }) : t("admin.noPackagesYet")].join(" · ")}
                  </small>
                </span>
                <button type="button" className="btn btn-secondary btn-small" disabled={i.question_count === 0}
                  onClick={() => { startPackages({ importId: i.id, count: i.question_count, title: i.title, year: i.year }, i.block, i.source); }}>
                  {t("admin.makePackages")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {slots.length > 0 && !imported && (
        <div className="account-card">
          <h3>{t("admin.slotsTitle")}</h3>
          <p className="account-note">{t("admin.slotsHint")}</p>
          {repeated.length > 0 && <p className="account-error" role="alert">{t("admin.slotsRepeated", { labels: repeated.join(", ") })}</p>}
          <ul className="admin-slots">
            {slots.map((label) => (
              <li key={label} className="admin-slot"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); void uploadPicture(label, e.dataTransfer.files[0]); }}>
                <span className="admin-mono">{label}</span>
                {uploaded[label] ? (
                  <>
                    <span className="account-success">{t("admin.slotDone")}</span>
                    <QuestionImage path={uploaded[label]} alt={label} small />
                  </>
                ) : (
                  <span className="account-note">{uploading === label ? t("admin.slotUploading") : t("admin.slotWaiting")}</span>
                )}
                <label className="btn btn-secondary btn-small">
                  {uploaded[label] ? t("admin.slotReplace") : t("admin.slotChoose")}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={uploading !== null}
                    onChange={(e) => { void uploadPicture(label, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed && !imported && (
        <div className="account-card">
          {header && (
            <p>
              <strong>{header.title}</strong> · {t("admin.blockN", { block: header.block })}
              {header.source && ` · ${header.source}`}
              {header.year && ` · ${header.year}`}
            </p>
          )}
          <p>{t("admin.questionsReady", { count: parsed.questions.length })}</p>
          {parsed.problems.length > 0 && (
            <>
              <p className="account-error">{t("admin.fixFirst", { count: parsed.problems.length })}</p>
              <ul className="admin-problems">
                {parsed.problems.slice(0, 50).map((p) => <li key={`${p.line}:${p.message}`}>{t("admin.lineN", { line: p.line })} {p.message}</li>)}
              </ul>
            </>
          )}
          <button type="button" className="btn btn-small" disabled={busy || !header || parsed.problems.length > 0 || parsed.questions.length === 0} onClick={() => void save()}>
            {busy ? t("common.saving") : t("admin.importDrafts", { count: parsed.questions.length })}
          </button>
          {parsed.questions.length > 0 && (
            <details className="admin-preview">
              <summary>{t("admin.preview")}</summary>
              <label className="admin-check">
                <input type="checkbox" checked={onlyPictures} onChange={(e) => { setOnlyPictures(e.target.checked); }} />
                {t("admin.onlyPictures")}
              </label>
              {onlyPictures && previewed.length === 0 && <p className="account-note">{t("admin.noPictures")}</p>}
              <ol>
                {previewed.slice(0, 200).map(({ q, n }) => (
                  <li key={n} value={n}>
                    <QuestionPreview q={q} />
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {imported && !made && (
        <div className="account-card admin-form">
          <p className="account-success">{t("admin.importedN", { count: imported.count })}</p>
          <p className="account-note">{t("admin.makePackagesHint")}</p>
          <label className="account-field">
            <span>{t("admin.examTitle")}</span>
            <input className="form-input" value={examTitle} onChange={(e) => { setExamTitle(e.target.value); }} />
          </label>
          <div className="admin-pair">
            <label className="account-field">
              <span>{t("admin.packageBlock")}</span>
              <input className="form-input" list="known-blocks" value={block} onChange={(e) => { setBlock(e.target.value); }} />
            </label>
            <label className="account-field">
              <span>{t("admin.packageType")}</span>
              <input className="form-input" list="known-sources" value={source} placeholder={t("admin.packageTypeHint")}
                onChange={(e) => { setSource(e.target.value); }} />
            </label>
            <label className="account-field">
              <span>{t("admin.packageYear")}</span>
              <input className="form-input" inputMode="numeric" maxLength={4} value={year} placeholder="2025"
                aria-invalid={!yearOk} onChange={(e) => { setYear(e.target.value.replace(/[^0-9]/g, "")); }} />
            </label>
            <datalist id="known-blocks">{known.blocks.map((b) => <option key={b} value={b} />)}</datalist>
            <datalist id="known-sources">{known.sources.map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          {(finalBlock !== block.trim() || finalSource !== source.trim()) && (
            <p className="account-note">{t("admin.spellingMatched", { block: finalBlock, type: finalSource || "–" })}</p>
          )}
          <label className="account-field">
            <span>{t("admin.timeLimit")}</span>
            <input className="form-input" type="number" min={1} max={300} value={minutes} onChange={(e) => { setMinutes(e.target.value); }} />
          </label>
          <label className="admin-check">
            <input type="checkbox" checked={trackBest} onChange={(e) => { setTrackBest(e.target.checked); }} />
            {t("admin.trackBest")}
          </label>
          <label className="account-field">
            <span>{t("admin.practiceTitle")}</span>
            <input className="form-input" value={practiceTitle} onChange={(e) => { setPracticeTitle(e.target.value); }} />
          </label>
          {!yearOk && <p className="account-error">{t("admin.yearHint")}</p>}
          <button type="button" className="btn btn-small" disabled={busy || !yearOk} onClick={() => void makePackages()}>{t("admin.makePackages")}</button>
        </div>
      )}

      {made && (
        <div className="account-card">
          <p className="account-success">{t("admin.packagesMade")}</p>
          <div className="account-row">
            <Link to="/admin/packages" className="btn btn-small">{t("admin.reviewAndPublish")}</Link>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setText(""); setUploaded({}); setImported(null); setMade(null); setImportFormId(crypto.randomUUID()); setEarlier(null); }}>{t("admin.importAnother")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
