// The Markdown format admins write questions in, and its parser. One file is one import: a
// header with what the questions are, then one `##` section per question.
//
//   ---
//   title: Block 1.1 UB 2025
//   block: 1.1
//   source: ub
//   year: 2025
//   subject: Histology          (optional; a question can set its own)
//   ---
//
//   ## 1
//   Subject: Anatomy            (optional)
//   Which bone is a sesamoid bone?
//
//   ![Lateral knee X-ray](question-images/1.1/knee.jpg)
//
//   - [ ] Femur
//   - [x] Patella               (the one correct option)
//
//   > The patella sits inside the quadriceps tendon.   (explanation, optional)
//
// A short-answer question has `Answer: main answer | other accepted answer` instead of options.
// Import-free, so scripts can load it too.

export interface ImportOption {
  text: string;
  image: string | null;
}

/** One question as admin_import_questions takes it. */
export interface ImportQuestion {
  block: string;
  source: string | null;
  year: number | null;
  subject: string | null;
  type: "single_choice" | "short_answer";
  stem: string;
  stem_image: string | null;
  stem_image_alt: string | null;
  options: ImportOption[] | null;
  correct_index: number | null;
  accepted_answers: string[] | null;
  explanation: string | null;
}

export interface ImportHeader {
  title: string;
  block: string;
  source: string | null;
  year: number | null;
  subject: string | null;
}

export interface ImportProblem {
  /** 1-based line in the file. */
  line: number;
  message: string;
}

export interface ParsedImport {
  header: ImportHeader | null;
  questions: ImportQuestion[];
  problems: ImportProblem[];
}

const BLOCK = /^[0-9]+\.[0-9]+$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const OPTION = /^[-*]\s+\[( |x|X)\]\s+(.*)$/;
const ANSWER = /^answer:\s*(.*)$/i;
const SUBJECT = /^subject:\s*(.*)$/i;

/** Images are files in the repo under public/; a path is stored without the leading slash. */
function imagePath(path: string): string | null {
  const clean = path.replace(/^\/+/, "");
  if (/^[a-z]+:/i.test(clean) || clean.includes("..")) return null;
  return clean;
}

function parseHeader(lines: string[], problems: ImportProblem[]): { header: ImportHeader | null; body: number } {
  if (lines[0]?.trim() !== "---") {
    problems.push({ line: 1, message: "The file starts with a header between --- lines (title, block, source, year)." });
    return { header: null, body: 0 };
  }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) {
    problems.push({ line: 1, message: "The header has no closing --- line." });
    return { header: null, body: lines.length };
  }
  const fields = new Map<string, { value: string; line: number }>();
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (m) fields.set(m[1].toLowerCase(), { value: m[2], line: i + 1 });
    else if (lines[i].trim()) problems.push({ line: i + 1, message: `Not a "name: value" line: ${lines[i].trim()}` });
  }
  const title = fields.get("title")?.value ?? "";
  const block = fields.get("block")?.value ?? "";
  const yearField = fields.get("year");
  const year = yearField?.value ? Number(yearField.value) : null;
  if (!title) problems.push({ line: 1, message: "The header needs a title." });
  if (!BLOCK.test(block)) problems.push({ line: fields.get("block")?.line ?? 1, message: "The header needs a block like 1.1." });
  if (year !== null && !(Number.isInteger(year) && year >= 2000 && year <= 2100)) {
    problems.push({ line: yearField?.line ?? 1, message: "The year should be like 2025." });
  }
  return {
    header: {
      title,
      block,
      source: fields.get("source")?.value || null,
      year: year !== null && Number.isInteger(year) ? year : null,
      subject: fields.get("subject")?.value || null,
    },
    body: end + 1,
  };
}

function parseQuestion(lines: string[], start: number, header: ImportHeader, problems: ImportProblem[]): ImportQuestion | null {
  const at = (i: number) => start + i + 1;
  const stem: string[] = [];
  const explanation: string[] = [];
  const options: ImportOption[] = [];
  let correct: number[] = [];
  let accepted: string[] | null = null;
  let subject = header.subject;
  let image: { path: string; alt: string } | null = null;
  const before = problems.length;

  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) {
      if (stem.length && options.length === 0 && accepted === null) stem.push("");
      continue;
    }
    const subjectLine = line.match(SUBJECT);
    if (subjectLine && stem.length === 0) {
      subject = subjectLine[1].trim() || subject;
      continue;
    }
    if (line.startsWith(">")) {
      explanation.push(line.replace(/^>\s?/, ""));
      continue;
    }
    const option = line.match(OPTION);
    if (option) {
      if (accepted !== null) problems.push({ line: at(i), message: "A question has options or an Answer: line, not both." });
      const text = option[2].trim();
      const img = text.match(IMAGE);
      if (option[1].toLowerCase() === "x") correct = [...correct, options.length];
      options.push(img ? { text: img[1], image: imagePath(img[2]) } : { text, image: null });
      continue;
    }
    const answer = line.match(ANSWER);
    if (answer) {
      if (options.length) problems.push({ line: at(i), message: "A question has options or an Answer: line, not both." });
      accepted = answer[1].split("|").map((a) => a.trim()).filter(Boolean);
      continue;
    }
    const img = line.match(IMAGE);
    if (img) {
      const path = imagePath(img[2]);
      if (!path) problems.push({ line: at(i), message: "Images are paths in the repo, like question-images/1.1/name.jpg." });
      else if (image) problems.push({ line: at(i), message: "A question has one image." });
      else image = { path, alt: img[1].trim() };
      continue;
    }
    if (options.length || accepted !== null) {
      problems.push({ line: at(i), message: `Text after the options: ${line.slice(0, 60)}` });
      continue;
    }
    stem.push(line);
  }

  const stemText = stem.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!stemText) problems.push({ line: start, message: "This question has no text." });
  if (accepted === null && options.length === 0) problems.push({ line: start, message: "This question needs options (- [ ] / - [x]) or an Answer: line." });
  if (options.length) {
    if (options.length < 2 || options.length > 8) problems.push({ line: start, message: "A question has 2 to 8 options." });
    if (correct.length !== 1) problems.push({ line: start, message: "Mark exactly one option correct with - [x]." });
    if (options.some((o) => !o.text && !o.image)) problems.push({ line: start, message: "An option is empty." });
  }
  if (accepted !== null && (accepted as string[]).length === 0) problems.push({ line: start, message: "Answer: needs at least one answer." });
  if (problems.length > before) return null;

  const isChoice = options.length > 0;
  return {
    block: header.block,
    source: header.source,
    year: header.year,
    subject,
    type: isChoice ? "single_choice" : "short_answer",
    stem: stemText,
    stem_image: image?.path ?? null,
    stem_image_alt: image?.alt || null,
    options: isChoice ? options : null,
    correct_index: isChoice ? correct[0] : null,
    accepted_answers: isChoice ? null : accepted,
    explanation: explanation.join("\n").trim() || null,
  };
}

/** Reads an import file. Questions with problems are left out and listed in `problems`. */
export function parseQuestionMarkdown(text: string): ParsedImport {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const problems: ImportProblem[] = [];
  const { header, body } = parseHeader(lines, problems);
  const questions: ImportQuestion[] = [];
  if (!header) return { header, questions, problems };

  const starts: number[] = [];
  for (let i = body; i < lines.length; i++) if (/^##\s/.test(lines[i])) starts.push(i);
  if (starts.length === 0) problems.push({ line: body + 1, message: "No questions: each one starts with a ## line." });
  const stray = lines.slice(body, starts[0] ?? lines.length).findIndex((l) => l.trim());
  if (stray >= 0 && starts.length) problems.push({ line: body + stray + 1, message: "Text before the first ## question." });

  starts.forEach((s, n) => {
    const q = parseQuestion(lines.slice(s + 1, starts[n + 1] ?? lines.length), s + 1, header, problems);
    if (q) questions.push(q);
  });
  return { header, questions, problems };
}

/** Writes questions back out in the same format (the parser reads it back unchanged). */
export function questionMarkdown(header: ImportHeader, questions: Omit<ImportQuestion, "block" | "source" | "year">[]): string {
  const head = ["---", `title: ${header.title}`, `block: ${header.block}`];
  if (header.source) head.push(`source: ${header.source}`);
  if (header.year) head.push(`year: ${header.year}`);
  if (header.subject) head.push(`subject: ${header.subject}`);
  head.push("---", "");
  const body = questions.map((q, i) => {
    const out = [`## ${i + 1}`];
    if (q.subject && q.subject !== header.subject) out.push(`Subject: ${q.subject}`);
    out.push(q.stem);
    if (q.stem_image) out.push("", `![${q.stem_image_alt ?? ""}](${q.stem_image})`);
    out.push("");
    if (q.type === "single_choice" && q.options) {
      q.options.forEach((o, oi) => {
        const text = o.image ? `![${o.text}](${o.image})` : o.text;
        out.push(`- [${oi === q.correct_index ? "x" : " "}] ${text}`);
      });
    } else {
      out.push(`Answer: ${(q.accepted_answers ?? []).join(" | ")}`);
    }
    if (q.explanation) out.push("", ...q.explanation.split("\n").map((l) => `> ${l}`.trimEnd()));
    return out.join("\n");
  });
  return `${head.join("\n")}\n${body.join("\n\n")}\n`;
}
