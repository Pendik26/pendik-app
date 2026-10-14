import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QuestionImage } from "../../components/exam/QuestionImage";
import { errorText } from "../../i18n/errorText";
import { useI18n } from "../../i18n/useI18n";
import { importQuestions, listAllPackages, packagesFromImport, suggestedMinutes } from "../../lib/admin";
import { loadExamRecords } from "../../lib/exams";
import { clearImportDraft, readImportDraft, saveImportDraft } from "../../lib/importDraft";
import { fillSlots, imageSlots, repeatedSlots, toWebp, uploadImage } from "../../lib/importImages";
import { distinct, matchSpelling } from "../../lib/packageFilter";
import { parseQuestionMarkdown } from "../../lib/questionMarkdown";

/**
 * Importing a Markdown file of questions: check it, save the questions as drafts, then make an
 * exam package and a practice package from them (both drafts until published).
 */
export function AdminImport() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<{ importId: string; count: number } | null>(null);
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
  const previewed = (parsed?.questions ?? []).map((q, i) => ({ q, n: i + 1 })).filter(({ q }) => !onlyPictures || q.stem_image || q.options?.some((o) => o.image));

  // Keep an unfinished import in this browser, so a refresh doesn't lose it.
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
      const importId = await importQuestions(header.title, effective, parsed.questions);
      setImported({ importId, count: parsed.questions.length });
      clearImportDraft();
      setExamTitle(header.title);
      setPracticeTitle(`${header.title} (${t("exam.modePractice").toLowerCase()})`);
      setMinutes(String(suggestedMinutes(parsed.questions.length)));
      setBlock(header.block);
      setSource(header.source ?? "");
    } catch (e) {
      setProblem(errorText(e));
    }
    setBusy(false);
  };

  const makePackages = async () => {
    if (!imported || !header) return;
    setBusy(true);
    setProblem(null);
    try {
      setMade(await packagesFromImport({
        importId: imported.importId,
        examTitle: examTitle.trim() || header.title,
        practiceTitle: practiceTitle.trim() || header.title,
        block: finalBlock || header.block,
        source: finalSource || null,
        year: header.year,
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
                    <p className="exam-stem">{q.stem}</p>
                    {q.stem_image && <QuestionImage path={q.stem_image} alt={q.stem_image_alt} small />}
                    {q.options ? (
                      <ul>{q.options.map((o, oi) => <li key={oi} className={oi === q.correct_index ? "admin-correct" : undefined}>{o.text}</li>)}</ul>
                    ) : (
                      <p className="admin-correct">{q.accepted_answers?.join(" · ")}</p>
                    )}
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
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void makePackages()}>{t("admin.makePackages")}</button>
        </div>
      )}

      {made && (
        <div className="account-card">
          <p className="account-success">{t("admin.packagesMade")}</p>
          <div className="account-row">
            <Link to="/admin/packages" className="btn btn-small">{t("admin.reviewAndPublish")}</Link>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setText(""); setUploaded({}); setImported(null); setMade(null); }}>{t("admin.importAnother")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
