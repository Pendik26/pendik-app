// Fails when a tracked file looks like it holds a real student's or lecturer's details. The repo
// is public, so a roster, a phone list or a student id must never be committed.
//   npm run check:student-data
// It looks for student ids (NIM: 14 digits) and Indonesian mobile numbers. Obviously made-up
// numbers (the same digit repeated, or 1234567890 in a row) are fine in tests. A line that really
// needs a match can end with "student-data-ok" and a reason.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKIP = /(^|\/)(package-lock\.json|.*\.(png|jpe?g|gif|webp|ico|pdf|woff2?|glb|gltf|bin|zip))$/i;
const NIM = /(?<![\d.])\d{14}(?![\d.])/g;
const PHONE = /(?<![\d.])(?:\+62|62|0)8\d{8,11}(?![\d.])/g;

// The digits after the "08" / "+628" start; made up when one digit repeats or they count up.
const madeUp = (number) => {
  const rest = number.replace(/^(\+62|62|0)8/, "");
  return /^(\d)\1+$/.test(rest) || "01234567890123456789".includes(rest);
};

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter((f) => f && !SKIP.test(f));
const problems = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  text.split("\n").forEach((line, i) => {
    if (line.includes("student-data-ok")) return;
    for (const m of line.matchAll(NIM)) problems.push(`${file}:${i + 1}: looks like a student id (${m[0].slice(0, 4)}…)`);
    for (const m of line.matchAll(PHONE)) {
      if (!madeUp(m[0])) problems.push(`${file}:${i + 1}: looks like a phone number (${m[0].slice(0, 5)}…)`);
    }
  });
}
if (problems.length) {
  console.error(`Found what may be real student or lecturer details in tracked files:\n${problems.join("\n")}`);
  console.error('\nRemove them, use made-up values, or end the line with "student-data-ok <why>" if it is not personal data.');
  process.exit(1);
}
console.log(`No student ids or phone numbers in ${files.length} tracked files.`);
