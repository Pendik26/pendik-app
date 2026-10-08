import { useCallback, useEffect, useMemo, useState } from "react";
import { getStudyLog } from "../lib/activity";
import { blockById } from "../lib/blocks";
import { DEFAULT_MINUTES, daysUntil, examDateFor, phaseFor, readExamPlan, writeExamPlan, type ExamPlanSettings } from "../lib/examPlan";
import { blockReadiness } from "../lib/readiness";
import { STORAGE_UPDATED_EVENT } from "../lib/sync";
import { planProgress, todayPlanFor } from "../lib/todayPlan";
import { useOcclusionIds } from "./useOcclusionIds";

/**
 * Everything the exam plan shows for one block: its settings, date and phase, readiness, and
 * today's plan with how much of it is done. Re-reads when synced progress arrives or the tab
 * comes back into view (progress made on another page or device).
 */
export function useExamPlan(blockId: string) {
  const occlusion = useOcclusionIds();
  const [settings, setSettings] = useState<ExamPlanSettings>(() => readExamPlan(blockId));
  const [version, setVersion] = useState(0);
  const [rebuildAt, setRebuildAt] = useState(0);

  const [trackedBlock, setTrackedBlock] = useState(blockId);
  if (trackedBlock !== blockId) {
    setTrackedBlock(blockId);
    setSettings(readExamPlan(blockId));
  }

  useEffect(() => {
    const refresh = () => { setVersion((v) => v + 1); };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const update = useCallback(
    (patch: ExamPlanSettings) => { setSettings(writeExamPlan(blockId, patch)); },
    [blockId],
  );

  const exam = examDateFor(blockId, settings);
  const daysLeft = exam.date ? daysUntil(exam.date) : null;
  const phase = phaseFor(daysLeft);
  const minutes = settings.minutes ?? DEFAULT_MINUTES;

  const readiness = useMemo(
    () => blockReadiness(blockId, occlusion.ids),
    // version: re-read storage after a sync or on return to the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockId, occlusion.ids, version],
  );

  // Today's plan waits for the image-occlusion totals so it's drawn up once, complete.
  const plan = useMemo(
    () => (occlusion.loaded ? todayPlanFor(readiness, phase, daysLeft, minutes, { rebuild: rebuildAt > 0 }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occlusion.loaded, readiness, phase, daysLeft, minutes, rebuildAt],
  );
  const progress = useMemo(
    () => (plan ? planProgress(plan, getStudyLog()) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, version],
  );

  return {
    block: blockById(blockId),
    settings,
    update,
    exam,
    daysLeft,
    phase,
    minutes,
    readiness,
    plan,
    progress,
    occlusion,
    rebuild: () => { setRebuildAt(Date.now()); },
  };
}
