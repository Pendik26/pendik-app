import { useEffect } from "react";
import { pageMeta } from "../lib/routeMeta";
import { SITE_ORIGIN } from "../lib/site";

function setMeta(selector: string, attr: "name" | "property", key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Keeps the document head in step with the current route: title, description, canonical link,
 * social tags, and "noindex" on personal pages. Matches what the prerendered HTML for the route
 * says, so search engines see one consistent answer.
 */
export function usePageMeta(pathname: string): void {
  useEffect(() => {
    const meta = pageMeta(pathname);
    const url = `${SITE_ORIGIN}${pathname === "/" ? "/" : pathname.replace(/\/+$/, "")}`;
    document.title = meta.title;
    setMeta('meta[name="description"]', "name", "description", meta.description);
    setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
    setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
    setMeta('meta[name="robots"]', "name", "robots", meta.indexable ? null : "noindex");
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = url;
  }, [pathname]);
}
