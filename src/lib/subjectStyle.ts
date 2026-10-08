/**
 * Deterministic accent hue per subject id, so the same subject always gets the same color.
 * The hash is spread across the hue wheel with the golden-angle trick (multiply by the golden
 * ratio conjugate before wrapping) — plain `hash % 360` clusters short similar-length strings
 * like "biochem"/"histology"/"physiology" into the same narrow hue band.
 */
/**
 * Nudges a hue out of two bands reserved for semantic colors: ~345-25 (the incorrect/error red)
 * and ~135-185 (the correct/mastery teal-green) — a subject landing in either would make its
 * "brand" buttons and progress bars read as if something were right or wrong.
 */
function avoidSemanticHues(hue: number): number {
  const inRedBand = hue >= 345 || hue < 25;
  const inGreenBand = hue >= 135 && hue < 185;
  if (inRedBand || inGreenBand) return avoidSemanticHues((hue + 40) % 360);
  return hue;
}

export function subjectHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const golden = 0.6180339887498949;
  const rawHue = Math.floor(((Math.abs(hash) * golden) % 1) * 360);
  return avoidSemanticHues(rawHue);
}

export function subjectAccent(id: string): string {
  return `hsl(${subjectHue(id)}, 65%, 60%)`;
}

/** Inline style that sets --subject-hue — pair with the "subject-tinted" CSS class. */
export function subjectHueStyle(id: string): Record<string, string> {
  return { "--subject-hue": String(subjectHue(id)) };
}
