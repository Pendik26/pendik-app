import { useEffect, useState } from "react";

// A question's picture: a file in the repo under public/. SVG diagrams are drawn inline so they
// pick up the theme's colours (they're written with the app's CSS variables).

const svgCache = new Map<string, Promise<string>>();

function loadSvg(path: string): Promise<string> {
  let p = svgCache.get(path);
  if (!p) {
    p = fetch(`/${path}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
    svgCache.set(path, p);
  }
  return p;
}

/** Only an <svg> element from our own repo is drawn inline; anything else is shown as an image. */
const isSvgMarkup = (text: string) => /^\s*<svg[\s>]/.test(text) && !/<script|\son\w+=/i.test(text);

export function QuestionImage({ path, alt, small = false }: { path: string; alt: string | null; small?: boolean }) {
  const isSvg = path.endsWith(".svg");
  const [svg, setSvg] = useState<{ path: string; markup: string | null } | null>(null);

  useEffect(() => {
    if (!isSvg) return;
    let live = true;
    loadSvg(path).then(
      (text) => { if (live) setSvg({ path, markup: isSvgMarkup(text) ? text : null }); },
      () => { if (live) setSvg({ path, markup: null }); },
    );
    return () => { live = false; };
  }, [isSvg, path]);

  const cls = small ? "quiz-question-image quiz-question-image-small" : "quiz-question-image";
  if (isSvg && svg?.path === path && svg.markup) {
    return <div className={cls} role="img" aria-label={alt ?? undefined} dangerouslySetInnerHTML={{ __html: svg.markup }} />;
  }
  if (isSvg && svg?.path !== path) return <div className={cls} aria-busy="true" />;
  return (
    <div className={cls}>
      <img src={`/${path}`} alt={alt ?? ""} loading="lazy" />
    </div>
  );
}
