import { useEffect, useState } from "react";
import { loadOcclusionNotes, occlusionKeys } from "../lib/content";
import { occlusionCards } from "../lib/occlusion";
import type { OcclusionIds } from "../lib/readiness";
import { setOwn } from "../lib/records";

let cache: { ids: OcclusionIds; labels: Record<string, string> } | null = null;

/**
 * Every image-occlusion label id per subject (and each id's label text), loaded on first use:
 * readiness needs the totals, weak spots the names. Empty until loaded.
 */
export function useOcclusionIds(): { ids: OcclusionIds; labels: Record<string, string>; loaded: boolean } {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    Promise.all(occlusionKeys.map(async (key) => [key, (await loadOcclusionNotes(key)) ?? []] as const)).then((entries) => {
      const ids: OcclusionIds = {};
      const labels: Record<string, string> = {};
      for (const [key, notes] of entries) {
        const cards = occlusionCards(notes);
        setOwn(ids, key, cards.map((c) => c.id));
        for (const c of cards) setOwn(labels, c.id, c.mask.label);
      }
      cache = { ids, labels };
      if (live) setData(cache);
    });
    return () => {
      live = false;
    };
  }, []);
  return { ids: data?.ids ?? {}, labels: data?.labels ?? {}, loaded: data !== null };
}
