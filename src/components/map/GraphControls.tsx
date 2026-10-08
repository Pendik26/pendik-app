import { useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, RANGES, type ColorBy, type GraphSettings } from "../../lib/knowledgeGraph/graphSettings";
import type { ForceScale } from "../../lib/knowledgeGraph/layout";
import { ChevronIcon, CloseIcon, ResetIcon, SettingsIcon } from "./ObsIcons";

// The graph's settings panel, laid out like Obsidian's: collapsible Filters, Groups, Display and
// Forces sections over the top-right corner of the graph.

export interface FilterState {
  text: string;
  block: string | null;
  subject: string | null;
}

interface Props {
  settings: GraphSettings;
  onSettings: (next: GraphSettings) => void;
  filters: FilterState;
  onFilters: (next: FilterState) => void;
  blocks: string[];
  /** Subject ids with their label and color slot. */
  subjects: { id: string; label: string; slot: number }[];
  orphanCount: number;
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={open ? "obs-control-section is-open" : "obs-control-section"}>
      <button type="button" className="obs-control-head" aria-expanded={open} onClick={onToggle}>
        <ChevronIcon />
        {title}
      </button>
      {open && <div className="obs-control-body">{children}</div>}
    </div>
  );
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (on: boolean) => void; hint?: string }) {
  return (
    <div className="obs-control-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "obs-toggle is-on" : "obs-toggle"} onClick={() => { onChange(!on); }} />
    </div>
  );
}

function Slider({ label, value, range, onChange }: { label: string; value: number; range: readonly [number, number, number]; onChange: (v: number) => void }) {
  return (
    <label className="obs-control-slider">
      <span>{label}</span>
      <input type="range" min={range[0]} max={range[1]} step={range[2]} value={value} onChange={(e) => { onChange(Number(e.target.value)); }} />
    </label>
  );
}

export function GraphControls({ settings, onSettings, filters, onFilters, blocks, subjects, orphanCount }: Props) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Set<string>>(() => new Set(["Filters", "Groups"]));
  const toggleSection = (name: string) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const set = (patch: Partial<GraphSettings>) => { onSettings({ ...settings, ...patch }); };
  const setForce = (key: keyof ForceScale, v: number) => { onSettings({ ...settings, forces: { ...settings.forces, [key]: v } }); };

  if (!open) {
    return (
      <button type="button" className="obs-controls-toggle" onClick={() => { setOpen(true); }} aria-label="Graph settings" title="Graph settings">
        <SettingsIcon />
      </button>
    );
  }

  const colorChoices: [ColorBy, string][] = [
    ["subject", "Subject"],
    ["mastery", "Mastery"],
    ["none", "None"],
  ];

  return (
    <div className="obs-controls" role="region" aria-label="Graph settings">
      <div className="obs-controls-top">
        <button
          type="button"
          className="obs-icon-btn"
          onClick={() => {
            onSettings(DEFAULT_SETTINGS);
            onFilters({ text: "", block: null, subject: null });
          }}
          aria-label="Restore default settings"
          title="Restore default settings"
        >
          <ResetIcon />
        </button>
        <button type="button" className="obs-icon-btn" onClick={() => { setOpen(false); }} aria-label="Close graph settings" title="Close">
          <CloseIcon />
        </button>
      </div>

      <Section title="Filters" open={sections.has("Filters")} onToggle={() => { toggleSection("Filters"); }}>
        <input
          type="search"
          className="obs-input"
          placeholder="Search concepts…"
          aria-label="Show only concepts matching"
          value={filters.text}
          onChange={(e) => { onFilters({ ...filters, text: e.target.value }); }}
        />
        <div className="obs-chip-row" role="group" aria-label="Block">
          <button type="button" className={filters.block === null ? "obs-chip is-on" : "obs-chip"} aria-pressed={filters.block === null} onClick={() => { onFilters({ ...filters, block: null }); }}>
            All blocks
          </button>
          {blocks.map((b) => (
            <button key={b} type="button" className={filters.block === b ? "obs-chip is-on" : "obs-chip"} aria-pressed={filters.block === b} onClick={() => { onFilters({ ...filters, block: filters.block === b ? null : b }); }}>
              {b}
            </button>
          ))}
        </div>
        <div className="obs-chip-row" role="group" aria-label="Subject">
          {subjects.map((s) => (
            <button key={s.id} type="button" className={filters.subject === s.id ? "obs-chip is-on" : "obs-chip"} aria-pressed={filters.subject === s.id} onClick={() => { onFilters({ ...filters, subject: filters.subject === s.id ? null : s.id }); }}>
              <span className="obs-dot" style={{ background: `var(--map-${s.slot})` }} aria-hidden="true" />
              {s.label}
            </button>
          ))}
        </div>
        <Toggle label="Bridges only" hint="Concepts in more than one subject" on={settings.bridgesOnly} onChange={(v) => { set({ bridgesOnly: v }); }} />
        <Toggle label="Orphans" hint={`${orphanCount} with no links`} on={settings.orphans} onChange={(v) => { set({ orphans: v }); }} />
      </Section>

      <Section title="Groups" open={sections.has("Groups")} onToggle={() => { toggleSection("Groups"); }}>
        <div className="obs-segmented" role="radiogroup" aria-label="Color concepts by">
          {colorChoices.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={settings.colorBy === value} className={settings.colorBy === value ? "is-on" : undefined} onClick={() => { set({ colorBy: value }); }}>
              {label}
            </button>
          ))}
        </div>
        {settings.colorBy === "subject" && (
          <ul className="obs-groups">
            {subjects.map((s) => (
              <li key={s.id}>
                <span className="obs-dot" style={{ background: `var(--map-${s.slot})` }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        )}
        {settings.colorBy === "mastery" && (
          <ul className="obs-groups">
            <li>
              <span className="obs-ramp" aria-hidden="true" />
              Weaker → stronger
            </li>
            <li>
              <span className="obs-dot obs-dot-weak" aria-hidden="true" />
              Needs work (under 50%)
            </li>
            <li>
              <span className="obs-dot" style={{ background: "var(--map-unstudied)" }} aria-hidden="true" />
              Not studied yet
            </li>
          </ul>
        )}
      </Section>

      <Section title="Display" open={sections.has("Display")} onToggle={() => { toggleSection("Display"); }}>
        <Toggle label="3D effect" hint="Lit spheres with depth; off is lighter" on={settings.depthEffect} onChange={(v) => { set({ depthEffect: v }); }} />
        <Slider label="Text fade threshold" value={settings.textFade} range={RANGES.textFade} onChange={(v) => { set({ textFade: v }); }} />
        <Slider label="Node size" value={settings.nodeSize} range={RANGES.nodeSize} onChange={(v) => { set({ nodeSize: v }); }} />
        <Slider label="Link thickness" value={settings.linkThickness} range={RANGES.linkThickness} onChange={(v) => { set({ linkThickness: v }); }} />
      </Section>

      <Section title="Forces" open={sections.has("Forces")} onToggle={() => { toggleSection("Forces"); }}>
        <Slider label="Center force" value={settings.forces.center} range={RANGES.center} onChange={(v) => { setForce("center", v); }} />
        <Slider label="Repel force" value={settings.forces.repel} range={RANGES.repel} onChange={(v) => { setForce("repel", v); }} />
        <Slider label="Link force" value={settings.forces.link} range={RANGES.link} onChange={(v) => { setForce("link", v); }} />
        <Slider label="Link distance" value={settings.forces.distance} range={RANGES.distance} onChange={(v) => { setForce("distance", v); }} />
      </Section>
    </div>
  );
}
