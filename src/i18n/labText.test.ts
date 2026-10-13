import { describe, expect, it } from "vitest";
import { labExercises } from "../lib/labActivities";
import { MODES } from "../lib/labModes";
import { labText } from "./labText";
import { labTextId } from "./sections/labText";

/** Every English string the Virtual Lab shows from its data. */
function labStrings(): Set<string> {
  const out = new Set<string>();
  for (const e of labExercises) {
    out.add(e.title);
    out.add(e.description);
    out.add(e.guide.label);
    for (const a of e.activities) {
      out.add(a.title);
      out.add(a.summary);
      a.background.forEach((x) => out.add(x));
      a.steps.forEach((x) => out.add(x));
      out.add(a.expected);
      for (const q of a.questions) {
        out.add(q.question);
        q.options.forEach((x) => out.add(x));
        out.add(q.explanation);
      }
    }
  }
  for (const m of Object.values(MODES)) {
    out.add(m.xLabel);
    out.add(m.yLabel);
    out.add(m.speedNote);
    m.columns.forEach((c) => out.add(c.label));
    if (m.plot) {
      out.add(m.plot.xLabel);
      out.add(m.plot.yLabel);
      m.plot.series.forEach((s) => out.add(s.label));
    }
  }
  return out;
}

describe("Virtual Lab translation", () => {
  it("has an Indonesian text for every English string", () => {
    const missing = [...labStrings()].filter((s) => !labTextId[s]);
    expect(missing).toEqual([]);
  });

  it("has no entries for text that is gone", () => {
    const strings = labStrings();
    expect(Object.keys(labTextId).filter((k) => !strings.has(k))).toEqual([]);
  });

  it("keeps the PhysioEx button names in the steps", () => {
    const buttons = ["Stimulate", "Record Data", "Clear Tracings", "Plot Data", "Single Stimulus", "Multiple Stimulus", "Stop Stimulus"];
    for (const step of labExercises.flatMap((e) => e.activities.flatMap((a) => a.steps))) {
      for (const button of buttons) {
        if (step.includes(button)) expect(labTextId[step], step).toContain(button);
      }
    }
  });

  it("falls back to English", () => {
    expect(labText("en", "Force (g)")).toBe("Force (g)");
    expect(labText("id", "Force (g)")).toBe("Gaya (g)");
    expect(labText("id", "not in the table")).toBe("not in the table");
  });
});
