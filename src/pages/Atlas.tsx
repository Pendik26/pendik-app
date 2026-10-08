import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlfondIcon } from "../components/icons";
import { AtlasViewer, OPPOSITE, type Picked, type SelectInfo, type ViewName, type ViewSide } from "../components/atlas/viewer";
import { BackIcon, BodyIcon, ForwardIcon, PivotIcon, TurnLeftIcon, TurnRightIcon } from "../components/atlas/AtlasIcons";
import {
  CloseIcon,
  DiceIcon,
  ExpandIcon,
  FileIcon,
  FitIcon,
  FolderIcon,
  HashIcon,
  MinusIcon,
  PlusIcon,
  ResetIcon,
  SearchIcon,
  ShrinkIcon,
  TagIcon,
} from "../components/map/ObsIcons";
import { useAccount } from "../hooks/useAccount";
import { isTyping } from "../lib/keys";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { STORAGE_KEYS } from "../lib/storage";
import { askAlfondAbout } from "../lib/alfond";
import {
  allStructures,
  ATLAS_BASE,
  ATTACHMENTS,
  attachmentsFor,
  defaultOpacity,
  describeStructure,
  formatMB,
  parseNode,
  searchAtlas,
  sideLabel,
  sideEnglish,
  sideShort,
  latinOf,
  latinWithSide,
  greekRoot,
  type LatinNames,
  atlasFiles,
  DEFAULT_HIDDEN_GROUPS,
  nodesOutside,
  topGroupOf,
  topGroups,
  type AtlasIndex,
} from "../lib/atlas/model";

// The 3D anatomy atlas: the whole body from Z-Anatomy, one system at a time or together. Click
// a part to name it, read what it is, see its landmarks and where a muscle attaches.

const DEFAULT_LAYERS = ["skeletal"];
const QUICK = ["Femur", "Heart", "Brain", "Deltoid muscle", "Kidney", "Scapula", "Liver", "Sciatic nerve"];

/** The same structure on the other side ("Femur.r" → "Femur.l"), if it has one. */
const otherSide = (node: string) => (/\.r$/.test(node) ? node.replace(/\.r$/, ".l") : /\.l$/.test(node) ? node.replace(/\.l$/, ".r") : null);

/** The controls, as the knowledge map's 3D view lists them: [how, what]. */
const CONTROLS: [string, string][] = [
  ["Drag", "Orbit around the point looked at"],
  ["Right- or Shift-drag", "Pan (two fingers on a touch screen)"],
  ["Scroll, pinch", "Zoom toward the pointer"],
  ["W A S D", "Fly forward, left, back, right"],
  ["Q E", "Fly down, up (hold Shift to go faster)"],
  ["Arrow keys", "Orbit (Shift: slide the view)"],
  ["Click", "Select; again in the same place for the one beneath"],
  ["Ctrl/⌘ + click", "Add to or take from the selection"],
  ["Double-click", "Fly to it"],
  ["Axis gizmo", "Click an end to look from that side"],
  ["1 3 7", "Anterior, dextra, superior (Ctrl: the opposite side)"],
  ["9", "Look from the opposite side"],
  ["5, R, G", "Perspective or orthographic, auto-rotate, grid"],
  ["F, 0", "Frame the selection, the whole body"],
  ["H, Shift + H, O", "Hide, show everything, only this"],
];

/** The views, named as anatomists name them: [view, label, plain English, key]. */
const VIEW_BUTTONS: [ViewName, string, string, string][] = [
  ["front", "Anterior", "Front", "1"],
  ["back", "Posterior", "Back", "Ctrl+1"],
  ["left", "Sinistra", "Left side", "Ctrl+3"],
  ["right", "Dextra", "Right side", "3"],
  ["top", "Superior", "Top", "7"],
  ["bottom", "Inferior", "Bottom", "Ctrl+7"],
];

/** Blender's (and the knowledge map's) view keys; with Ctrl, the opposite side. */
const VIEW_KEYS: Record<string, ViewName> = { "1": "front", "3": "right", "7": "top" };
/** One press of a turn button or arrow key: 20°. */
const TURN = Math.PI / 9;

interface AtlasPrefs {
  /** Drawn orthographically rather than in perspective. */
  ortho?: boolean;
  /** The floor grid shown (on unless switched off). */
  grid?: boolean;
  /** A clicked structure becomes what the view turns around. */
  follow: boolean;
  /** Recently opened structures, newest first, as "system/node". */
  recent: string[];
}
const DEFAULT_PREFS: AtlasPrefs = { follow: true, recent: [] };

const toKey = (p: Picked) => `${p.system}/${p.node}`;
const fromKey = (key: string): Picked | null => {
  const at = key.indexOf("/");
  return at > 0 ? { system: key.slice(0, at), node: key.slice(at + 1) } : null;
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Atlas() {
  const { config } = useAccount();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const infoPanel = useRef<HTMLElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const resultsList = useRef<HTMLUListElement>(null);
  const viewer = useRef<AtlasViewer | null>(null);
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [latin, setLatin] = useState<LatinNames | null>(null);
  const [failed, setFailed] = useState(false);
  const [webgl] = useState(hasWebGL);
  const [descriptions, setDescriptions] = useState<Record<string, string> | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<(Picked & { x: number; y: number }) | null>(null);
  const [query, setQuery] = useState("");
  const [isolating, setIsolating] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const [landmark, setLandmark] = useState<string | null>(null);
  // Per system, the top-level groups (regions, the fasciae…) left out of the view.
  const [hiddenGroups, setHiddenGroups] = useState<Record<string, string[]>>(DEFAULT_HIDDEN_GROUPS);

  const rawLayers = params.get("layers");
  const layers = useMemo(() => (rawLayers === null ? DEFAULT_LAYERS : rawLayers.split(",").filter(Boolean)), [rawLayers]);
  // Kept by its text, so changing other parts of the URL (layers) doesn't count as a new selection.
  const rawSelected = params.get("s");
  const selected = useMemo((): Picked | null => (rawSelected ? fromKey(rawSelected) : null), [rawSelected]);
  const selectedKey = selected ? toKey(selected) : "";

  const [storedPrefs, setPrefs] = useLocalStorage<AtlasPrefs>(STORAGE_KEYS.atlasPrefs, DEFAULT_PREFS);
  const prefs: AtlasPrefs = { ...DEFAULT_PREFS, ...storedPrefs };
  const followRef = useRef(prefs.follow);
  useEffect(() => {
    followRef.current = prefs.follow;
  }, [prefs.follow]);
  const [side, setSide] = useState<ViewSide>("Anterior");
  const ortho = prefs.ortho === true;
  const grid = prefs.grid !== false;
  const [autoRotate, setAutoRotate] = useState(false);
  const gizmo = useRef<HTMLCanvasElement>(null);
  // The body systems and search, as the knowledge map's explorer: open on wider screens.
  const [explorerOpen, setExplorerOpen] = useState(() => window.matchMedia("(min-width: 1080px)").matches);
  // Structures added to the selection with Ctrl/⌘+click, and everything under the last click.
  const [also, setAlso] = useState<Picked[]>([]);
  const [stack, setStack] = useState<Picked[]>([]);
  // Kept in a ref too, for the selection effect.
  const alsoRef = useRef<Picked[]>([]);
  const [showControls, setShowControls] = useState(false);

  // The structures opened on this visit, to step back and forward through.
  const [trail, setTrail] = useState<{ keys: string[]; at: number }>({ keys: [], at: -1 });
  const stepping = useRef(false);

  const setUrl = useCallback(
    (change: { layers?: string[]; selected?: Picked | null }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (change.layers) next.set("layers", change.layers.join(","));
          if (change.selected !== undefined) {
            if (change.selected) next.set("s", `${change.selected.system}/${change.selected.node}`);
            else next.delete("s");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    let live = true;
    fetch(`${ATLAS_BASE}atlas.json`)
      .then((r) => (r.ok ? (r.json() as Promise<AtlasIndex>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (live) setIndex(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    // The Latin names come alongside; the atlas works without them.
    fetch(`${ATLAS_BASE}latin.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LatinNames>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (live) setLatin(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // The viewer lives as long as the page.
  const selectRef = useRef<(p: Picked | null, info?: SelectInfo) => void>(() => {});
  useEffect(() => {
    if (!webgl || !host.current) return;
    const v = new AtlasViewer(host.current, {
      onSelect: (p, info) => { selectRef.current(p, info); },
      onHover: setHover,
      onProgress: (system, fraction) => {
        setProgress((prev) => {
          const next = { ...prev };
          if (fraction === null) delete next[system];
          else next[system] = fraction;
          return next;
        });
      },
      onError: (system) => { setErrors((prev) => [...new Set([...prev, system])]); },
      onView: setSide,
    });
    viewer.current = v;
    v.attachGizmo(gizmo.current);
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [webgl]);

  // A link to a structure opens on it; otherwise the page opens on the whole body.
  const openedOn = useRef(rawSelected);
  const focusOnce = useRef(Boolean(rawSelected));

  // Layers on and off, loading each model the first time it's shown.
  const shownBefore = useRef<Set<string>>(new Set());
  useEffect(() => {
    const v = viewer.current;
    if (!v || !index) return;
    v.setFiles(atlasFiles(index));
    const want = new Set(layers);
    const first = shownBefore.current.size === 0;
    for (const s of [...index.systems.map((x) => x.id), ATTACHMENTS]) {
      const on = want.has(s);
      if (on || shownBefore.current.has(s)) {
        void v.show(s, on).then(() => {
          if (first && on && !openedOn.current) v.frameAll();
        });
      }
      if (on) shownBefore.current.add(s);
    }
  }, [layers, index]);

  // Groups left out, applied to each system (now, or when it loads).
  useEffect(() => {
    const v = viewer.current;
    if (!v || !index) return;
    for (const s of index.systems) v.filterSystem(s.id, nodesOutside(index, s.id, hiddenGroups[s.id] ?? []));
  }, [index, hiddenGroups]);

  // The selection: highlighted, and its system shown.
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (!selected) {
      v.select(null, alsoRef.current);
      v.setMarkers([]);
      return;
    }
    if (!layers.includes(selected.system)) setUrl({ layers: [...layers, selected.system] });
    // A structure in a group that's left out brings its group back.
    const group = index ? topGroupOf(index, selected.system, selected.node) : null;
    if (group && hiddenGroups[selected.system]?.includes(group)) {
      setHiddenGroups((prev) => ({ ...prev, [selected.system]: (prev[selected.system] ?? []).filter((g) => g !== group) }));
    }
    let live = true;
    const apply = () => {
      if (!live) return;
      v.select(selected, alsoRef.current);
      if (focusOnce.current) {
        focusOnce.current = false;
        v.focus(selected);
      }
      const marks = (index?.landmarks[selected.system] ?? []).filter((l) => l[4] === selected.node);
      v.setMarkers(
        marks.map(([name, x, y, z]) => ({ name, at: [x, y, z] })),
        landmark,
      );
    };
    if (v.has(selected)) apply();
    else void v.show(selected.system, true).then(apply).catch(() => {});
    return () => {
      live = false;
    };
    // layers only matters for adding the selection's system once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, index, landmark]);

  // A new selection starts with no landmark picked.
  useEffect(() => {
    setLandmark(null);
  }, [selectedKey]);

  // Descriptions: fetched the first time something is selected.
  useEffect(() => {
    if (!selected || descriptions) return;
    fetch(`${ATLAS_BASE}descriptions.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : Promise.reject(new Error(String(r.status)))))
      .then(setDescriptions)
      .catch(() => { setDescriptions({}); });
  }, [selected, descriptions]);

  const select = useCallback(
    (p: Picked | null, focus = false) => {
      setUrl({ selected: p });
      if (p && focus) {
        const v = viewer.current;
        const go = () => v?.focus(p);
        if (v?.has(p)) go();
        else void v?.show(p.system, true).then(go).catch(() => {});
      }
    },
    [setUrl],
  );
  useEffect(() => {
    selectRef.current = (p, info) => {
      // Ctrl/⌘/Shift+click adds to (or takes away from) the selection, as in 3D editors.
      // Ctrl/⌘+click on empty space leaves the selection alone.
      if (info?.additive && !p) return;
      if (info?.additive && p && selected) {
        const key = toKey(p);
        if (key === toKey(selected)) return;
        setAlso((prev) => (prev.some((x) => toKey(x) === key) ? prev.filter((x) => toKey(x) !== key) : [...prev, p]));
        return;
      }
      setAlso([]);
      if (info) setStack(p ? info.stack : []);
      select(p);
      // A clicked part becomes what the view turns around (the orbit camera slides to it).
      if (p && followRef.current) viewer.current?.centreOn(p);
    };
  }, [select, selected]);

  // The extra selection lives in the viewer too.
  useEffect(() => {
    alsoRef.current = also;
    viewer.current?.select(selected, also);
    // selected is applied by the selection effect; this only follows the extras.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [also]);

  // The view settings follow the toolbar.
  useEffect(() => {
    viewer.current?.setOrthographic(ortho);
  }, [ortho, webgl]);
  useEffect(() => {
    viewer.current?.setGrid(grid);
  }, [grid, webgl]);
  useEffect(() => {
    viewer.current?.setAutoRotate(autoRotate);
  }, [autoRotate, webgl]);
  const patchPrefs = (patch: Partial<AtlasPrefs>) => { setPrefs((prev) => ({ ...DEFAULT_PREFS, ...prev, ...patch })); };

  // Each newly opened structure joins the trail (unless it was reached by stepping along it)
  // and the recent list.
  useEffect(() => {
    if (!selectedKey) return;
    const key = selectedKey;
    if (stepping.current) {
      stepping.current = false;
      return;
    }
    setTrail((t) => {
      if (t.keys[t.at] === key) return t;
      const keys = [...t.keys.slice(0, t.at + 1), key].slice(-30);
      return { keys, at: keys.length - 1 };
    });
    setPrefs((prev) => {
      const p = { ...DEFAULT_PREFS, ...prev };
      return { ...p, recent: [key, ...p.recent.filter((k) => k !== key)].slice(0, 8) };
    });
  }, [selectedKey, setPrefs]);
  const step = (by: number) => {
    const at = trail.at + by;
    const key = trail.keys[at];
    const p = key ? fromKey(key) : null;
    if (!p) return;
    stepping.current = true;
    setTrail((t) => ({ ...t, at }));
    select(p, true);
  };
  const backTo = trail.keys[trail.at - 1];
  const forwardTo = trail.keys[trail.at + 1];
  const nameOf = (key: string | undefined) => (key ? parseNode(fromKey(key)?.node ?? "").name : "");

  const toggleLayer = (id: string) => {
    const on = layers.includes(id);
    setUrl({ layers: on ? layers.filter((l) => l !== id) : [...layers, id] });
    if (id === ATTACHMENTS && on) {
      setAttachFor(null);
      viewer.current?.filterSystem(ATTACHMENTS, null);
    }
  };

  const all = useMemo(() => (index ? allStructures(index, latin) : []), [index, latin]);
  const recent = useMemo(
    () => prefs.recent.flatMap((k) => {
      const p = fromKey(k);
      return p && index?.nodes[p.system]?.some(([n]) => n === p.node) ? [p] : [];
    }),
    [prefs.recent, index],
  );
  const quick = useMemo(() => QUICK.flatMap((name) => searchAtlas(all, name, 1).slice(0, 1)), [all]);
  const structureCount = useMemo(() => new Set(all.map((h) => h.name)).size, [all]);
  const results = useMemo(() => (query.trim().length >= 2 ? searchAtlas(all, query) : []), [all, query]);
  const labelOf = (system: string) => (system === ATTACHMENTS ? "Muscle attachments" : (index?.systems.find((s) => s.id === system)?.label ?? system));

  const sel = selected ? parseNode(selected.node) : null;
  // The Latin name with its side ("Ren dexter"), and the Greek root where clinical terms use it.
  const selName = selected ? (selected.system === ATTACHMENTS ? null : sel?.name ?? null) : null;
  const selLatinBase = selName ? latinOf(latin, selName) : null;
  const selLatin = selLatinBase && sel ? latinWithSide(selLatinBase, sel.side) : null;
  const selGreek = selName ? greekRoot(selName) : null;
  const selPath = selected && index ? (index.nodes[selected.system]?.find(([n]) => n === selected.node)?.[1] ?? -1) : -1;
  const attachment = selected?.system === ATTACHMENTS ? index?.attachments.find(([n]) => n === selected.node) : undefined;
  const muscleAttachments = selected && index && selected.system === "muscular" ? attachmentsFor(index, selected.node) : [];
  const description = selected ? describeStructure(descriptions, attachment ? attachment[1] : selected.node) : null;
  const landmarks = selected ? (index?.landmarks[selected.system] ?? []).filter((l) => l[4] === selected.node) : [];

  const showAttachments = () => {
    if (!selected || !index) return;
    const nodes = muscleAttachments.map((a) => a.node);
    setAttachFor(sel?.name ?? null);
    const want = new Set([...layers, "skeletal", ATTACHMENTS]);
    setUrl({ layers: [...want] });
    // The muscles turn see-through, so their origin and insertion show on the bone beneath.
    setOpacity((prev) => ({ ...prev, muscular: 0.3 }));
    viewer.current?.setOpacity("muscular", 0.3);
    viewer.current?.focus(selected);
    void viewer.current?.show(ATTACHMENTS, true).then(() => { viewer.current?.filterSystem(ATTACHMENTS, nodes); });
  };

  const view = (name: ViewName) => { viewer.current?.view(name); };
  const refreshCounts = () => {
    setIsolating(viewer.current?.isolating ?? false);
    setHiddenCount(viewer.current?.hiddenCount ?? 0);
  };

  // Full screen: the browser's own where it has one for an element, else (iPhone) the atlas
  // covering the page.
  const [nativeFull, setNativeFull] = useState(false);
  const [pageFull, setPageFull] = useState(false);
  const fullScreen = nativeFull || pageFull;
  useEffect(() => {
    const onChange = () => { setNativeFull(document.fullscreenElement !== null && document.fullscreenElement === frame.current); };
    document.addEventListener("fullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); };
  }, []);
  useEffect(() => {
    if (!pageFull) return;
    document.documentElement.classList.add("atlas-page-full");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPageFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("atlas-page-full");
      window.removeEventListener("keydown", onKey);
    };
  }, [pageFull]);
  const toggleFullScreen = () => {
    const el = frame.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (pageFull) {
      setPageFull(false);
      return;
    }
    if (typeof el.requestFullscreen === "function" && document.fullscreenEnabled) el.requestFullscreen().catch(() => { setPageFull(true); });
    else setPageFull(true);
  };

  const toggleIsolate = () => {
    if (!selected) return;
    viewer.current?.isolate(viewer.current.isolating ? null : [selected, ...also]);
    refreshCounts();
  };
  const hideSelected = () => {
    if (!selected) return;
    for (const p of [selected, ...also]) viewer.current?.hide(p);
    refreshCounts();
    setAlso([]);
    select(null);
  };
  const showEverything = () => {
    viewer.current?.showAll();
    refreshCounts();
  };
  // The explorer opens with its search box ready, at once, so the next keys type into it.
  const findStructure = () => {
    if (!searchBox.current) flushSync(() => { setExplorerOpen(true); });
    searchBox.current?.focus();
  };
  const openRandom = () => {
    const pool = all.filter((h) => h.system !== ATTACHMENTS);
    const hit = pool[Math.floor(Math.random() * pool.length)];
    if (hit) select({ system: hit.system, node: hit.node }, true);
  };
  // Choosing from the explorer closes it where it covers the model.
  const openFromExplorer = (p: Picked) => {
    setQuery("");
    if (!window.matchMedia("(min-width: 1080px)").matches) setExplorerOpen(false);
    select(p, true);
  };
  const other = selected ? otherSide(selected.node) : null;
  const otherPicked = selected && other && index?.nodes[selected.system]?.some(([n]) => n === other) ? { system: selected.system, node: other } : null;

  // Keys, as the knowledge map's 3D view: / to search, Esc to let go, F focus, H hide, Shift+H
  // show everything, O only this, 1 3 7 views (Ctrl: the opposite side), 9 the opposite side,
  // 5 orthographic, R auto-rotate, G grid, 0 whole body. W A S D Q E fly (in the viewer).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      // The number pad's keys, whether Num Lock is on or not.
      const digit = e.code.startsWith("Numpad") && /^Numpad\d$/.test(e.code) ? e.code.slice(6) : k;
      if (e.ctrlKey) {
        const v = VIEW_KEYS[digit];
        if (!v) return;
        view(OPPOSITE[v]);
        e.preventDefault();
        return;
      }
      if (k === "/") findStructure();
      else if (k === "escape" && also.length > 0) setAlso([]);
      else if (k === "escape" && selected) select(null);
      else if (k === "f" && selected) viewer.current?.focus(selected);
      else if (k === "h" && e.shiftKey) showEverything();
      else if (k === "h" && selected) hideSelected();
      else if (k === "o" && selected) toggleIsolate();
      else if (digit === "0" || k === "home") viewer.current?.frameAll();
      else if (VIEW_KEYS[digit]) view(VIEW_KEYS[digit]);
      else if (digit === "9" && viewer.current) view(OPPOSITE[viewer.current.nearestView()]);
      else if (digit === "5") patchPrefs({ ortho: !ortho });
      else if (k === "r") setAutoRotate((on) => !on);
      else if (k === "g") patchPrefs({ grid: !grid });
      else if (k === "arrowleft" || k === "arrowright" || k === "arrowup" || k === "arrowdown") {
        const x = k === "arrowleft" ? 1 : k === "arrowright" ? -1 : 0;
        const y = k === "arrowup" ? 1 : k === "arrowdown" ? -1 : 0;
        // Shift slides the view instead of turning it.
        if (e.shiftKey) viewer.current?.pan(-x * 0.12, y * 0.12);
        else viewer.current?.orbit(x * TURN, y * TURN);
      } else if (k === "+" || k === "=") viewer.current?.zoom(0.75);
      else if (k === "-" || k === "_") viewer.current?.zoom(1 / 0.75);
      else if (k === "backspace") step(e.shiftKey ? 1 : -1);
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { keys.current(e); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  }, []);

  const systems = index ? [...index.systems, ...(index.attachmentsFile ? [{ id: ATTACHMENTS, label: "Muscle attachments", bytes: index.attachmentsFile.bytes, structures: index.attachments.length }] : [])] : [];
  const shownCount = systems.filter((s) => layers.includes(s.id) && s.id !== ATTACHMENTS).reduce((n, s) => n + s.structures, 0);
  const sideText = side === "Sinistra" || side === "Dextra" ? `Lateralis ${side.toLowerCase()}` : side;

  // The body systems, as the knowledge map's settings rows: a switch, its opacity, its parts.
  const systemsPanel = index && (
    <div className="atlas-systems" role="group" aria-label="Body systems">
      {systems.map((s) => {
        const on = layers.includes(s.id);
        const loading = progress[s.id];
        return (
          <div key={s.id} className={on ? "atlas-system is-on" : "atlas-system"}>
            <div className="obs-control-row">
              <span>
                {s.label}
                <small>
                  {loading !== undefined ? `Loading ${Math.round(loading * 100)}%` : errors.includes(s.id) ? "Failed to load" : `${s.structures.toLocaleString()} · ${formatMB(s.bytes)}`}
                </small>
              </span>
              <button type="button" role="switch" aria-checked={on} aria-label={s.label} className={on ? "obs-toggle is-on" : "obs-toggle"} onClick={() => { toggleLayer(s.id); }} />
            </div>
            {loading !== undefined && <progress className="atlas-progress" max={1} value={loading} aria-label={`Loading ${s.label}`} />}
            {on && s.id !== ATTACHMENTS && (
              <label className="obs-control-slider atlas-opacity">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity[s.id] ?? defaultOpacity(s.id)}
                  aria-label={`${s.label} opacity`}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOpacity((prev) => ({ ...prev, [s.id]: value }));
                    viewer.current?.setOpacity(s.id, value);
                  }}
                />
              </label>
            )}
            {on && s.id !== ATTACHMENTS && topGroups(index, s.id).length > 1 && (
              <div className="obs-chip-row" role="group" aria-label={`${s.label}: parts shown`}>
                {topGroups(index, s.id).map((g) => {
                  const off = hiddenGroups[s.id]?.includes(g.name) ?? false;
                  return (
                    <button
                      key={g.name}
                      type="button"
                      className={off ? "obs-chip" : "obs-chip is-on"}
                      aria-pressed={!off}
                      title={`${latinOf(latin, g.name) ? `${latinOf(latin, g.name)} · ` : ""}${g.count} structures`}
                      onClick={() => {
                        setHiddenGroups((prev) => {
                          const list = prev[s.id] ?? [];
                          return { ...prev, [s.id]: off ? list.filter((x) => x !== g.name) : [...list, g.name] };
                        });
                      }}
                    >
                      {g.name.replace(/ (of|part of) (the )?(muscular system|human body)$/i, "").replace(/^(Muscular system|Regions|Joints) of /i, "")}
                    </button>
                  );
                })}
                {(hiddenGroups[s.id]?.length ?? 0) > 0 && (
                  <button type="button" className="obs-chip atlas-group-reset" onClick={() => { setHiddenGroups((prev) => ({ ...prev, [s.id]: [] })); }}>
                    Show all parts
                  </button>
                )}
              </div>
            )}
            {s.id === ATTACHMENTS && on && (
              <p className="atlas-legend">
                <span className="atlas-swatch origin" /> origin <span className="atlas-swatch insertion" /> insertion{attachFor ? ` · ${attachFor}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  const selTitle = selected && sel ? (attachment ? `${attachment[2] === "o" ? "Origin" : "Insertion"} of ${parseNode(attachment[1]).name}` : sel.name) : "";

  return (
    <section className="page map-page atlas-page">
      <h1>3D anatomy</h1>
      <p className="subtitle">
        The whole body in 3D, named in English and Latin. Switch systems on, click any part to open it, press <kbd>?</kbd> for the controls.
      </p>

      {!webgl ? (
        <p className="atlas-note">This browser can't show 3D graphics (WebGL is off or not supported). Try Chrome, Edge, Firefox or Safari.</p>
      ) : failed ? (
        <p className="atlas-note">The atlas couldn't be loaded. Check your connection and reload.</p>
      ) : null}

      <div className={pageFull ? "obs-frame atlas-frame is-page-full" : "obs-frame atlas-frame"} ref={frame}>
        <div className={explorerOpen ? "obs atlas-obs explorer-open" : "obs atlas-obs"}>
          <nav className="obs-ribbon" aria-label="Atlas tools">
            <button type="button" className={explorerOpen ? "obs-ribbon-btn is-on" : "obs-ribbon-btn"} aria-pressed={explorerOpen} onClick={() => { setExplorerOpen((o) => !o); }} title="Body systems" aria-label="Show the body systems">
              <FolderIcon />
            </button>
            <button type="button" className="obs-ribbon-btn" onClick={findStructure} title="Find a structure (/)" aria-label="Find a structure">
              <SearchIcon />
            </button>
            <button type="button" className="obs-ribbon-btn" onClick={() => viewer.current?.frameAll()} title="Whole body (0)" aria-label="Show the whole body">
              <BodyIcon />
            </button>
            <button
              type="button"
              className={prefs.follow ? "obs-ribbon-btn is-on" : "obs-ribbon-btn"}
              aria-pressed={prefs.follow}
              onClick={() => { patchPrefs({ follow: !prefs.follow }); }}
              title={prefs.follow ? "Turning around the part you click (click to stop)" : "Turn around the part you click"}
              aria-label="Turn around the part you click"
            >
              <PivotIcon />
            </button>
            <button type="button" className="obs-ribbon-btn" disabled={!isolating && hiddenCount === 0} onClick={showEverything} title="Show everything you hid (Shift+H)" aria-label="Show everything you hid">
              <ResetIcon />
            </button>
            <button type="button" className="obs-ribbon-btn" onClick={openRandom} disabled={all.length === 0} title="Open a random structure" aria-label="Open a random structure">
              <DiceIcon />
            </button>
          </nav>

          {explorerOpen && (
            <aside className="obs-explorer atlas-explorer" aria-label="Body systems and search">
              <div className="obs-explorer-head">
                <span>{query.trim().length >= 2 ? "Search" : "Body systems"}</span>
                <button type="button" className="obs-icon-btn obs-explorer-close" onClick={() => { setExplorerOpen(false); }} aria-label="Close" title="Close">
                  <CloseIcon />
                </button>
              </div>
              <label className="obs-explorer-search">
                <SearchIcon />
                <span className="sr-only">Find a structure</span>
                <input
                  ref={searchBox}
                  type="search"
                  placeholder="Find a structure"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); }}
                  onKeyDown={(e) => {
                    const first = results[0];
                    if (e.key === "Enter" && first) {
                      // Back to the model, so its keys (arrows, Backspace…) work straight away.
                      e.currentTarget.blur();
                      openFromExplorer({ system: first.system, node: first.node });
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      resultsList.current?.querySelector("button")?.focus();
                    } else if (e.key === "Escape") {
                      setQuery("");
                    }
                  }}
                />
                <kbd className="atlas-key" aria-hidden="true">/</kbd>
              </label>
              <div className="obs-explorer-body">
                {results.length > 0 ? (
                  <ul
                    className="obs-tree"
                    aria-label="Matches"
                    ref={resultsList}
                    onKeyDown={(e) => {
                      // Up and down move between matches; up from the first goes back to the box.
                      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                      e.preventDefault();
                      const buttons = [...(resultsList.current?.querySelectorAll("button") ?? [])];
                      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      const next = e.key === "ArrowDown" ? buttons[at + 1] : at <= 0 ? searchBox.current : buttons[at - 1];
                      next?.focus();
                    }}
                  >
                    {results.map((r) => (
                      <li key={`${r.system}/${r.node}`}>
                        <button type="button" className={selectedKey === `${r.system}/${r.node}` ? "obs-file is-active" : "obs-file"} onClick={() => { openFromExplorer({ system: r.system, node: r.node }); }}>
                          <span className="obs-file-name">{r.name}</span>
                          {r.latin && r.latin.toLowerCase() !== r.name.toLowerCase() && (
                            <em className="atlas-latin-small" lang="la">
                              {r.latin}
                            </em>
                          )}
                          <small>
                            {labelOf(r.system)}
                            {r.path.length ? ` · ${r.path.at(-1)}` : ""}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 ? (
                  <p className="obs-explorer-empty">Nothing called “{query.trim()}”.</p>
                ) : (
                  systemsPanel
                )}
              </div>
            </aside>
          )}

          <div className="obs-graph-pane">
            <div className="obs-tabbar">
              <span className="obs-tab is-active">
                <BodyIcon />
                <span className="obs-tab-title">
                  3D atlas · <span aria-live="polite">{sideText}</span>
                </span>
              </span>
              <div className="obs-view-switch" role="radiogroup" aria-label="Projection">
                {([false, true] as const).map((o) => (
                  <button key={String(o)} type="button" role="radio" aria-checked={ortho === o} className={ortho === o ? "is-on" : undefined} onClick={() => { patchPrefs({ ortho: o }); }} title={o ? "Orthographic (5)" : "Perspective (5)"}>
                    {o ? "Ortho" : "Persp"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={fullScreen ? "obs-icon-btn obs-full-btn is-on" : "obs-icon-btn obs-full-btn"}
                aria-pressed={fullScreen}
                onClick={toggleFullScreen}
                title={fullScreen ? "Exit full screen (Esc)" : "Full screen"}
                aria-label={fullScreen ? "Exit full screen" : "Show the atlas full screen"}
              >
                {fullScreen ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
            </div>
            <div className="obs-graph atlas-stage">
              <div className="atlas-viewport" ref={host}>
                {hover && (
                  <div className="map-hover-card atlas-hover" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 10}px)` }} aria-hidden="true">
                    <strong>
                      {parseNode(hover.node).name}
                      {parseNode(hover.node).side && <small> {sideLabel(parseNode(hover.node).side).toLowerCase()}</small>}
                    </strong>
                    {latinOf(latin, parseNode(hover.node).name) && (
                      <span className="atlas-hover-latin" lang="la">
                        {latinWithSide(latinOf(latin, parseNode(hover.node).name) ?? "", parseNode(hover.node).side)}
                      </span>
                    )}
                  </div>
                )}
                {Object.keys(progress).length > 0 && (
                  <div className="atlas-loading" role="status">
                    <span className="atlas-spinner" aria-hidden="true" />
                    Loading {Object.entries(progress).map(([id, f]) => `${labelOf(id).toLowerCase()} ${Math.round(f * 100)}%`).join(", ")}
                  </div>
                )}
              </div>
              <div className="map-3d-tools atlas-3d-tools">
                <canvas ref={gizmo} className="map-gizmo atlas-gizmo" role="img" aria-label="Axis gizmo: click anterior, posterior, superior, inferior, sinistra or dextra to look from that side" />
                <div className="map-3d-buttons" role="group" aria-label="3D view">
                  <button type="button" className={autoRotate ? "obs-chip is-on" : "obs-chip"} aria-pressed={autoRotate} onClick={() => { setAutoRotate((on) => !on); }} title="Turn slowly around the body (R)">
                    Auto-rotate
                  </button>
                  <button type="button" className={grid ? "obs-chip is-on" : "obs-chip"} aria-pressed={grid} onClick={() => { patchPrefs({ grid: !grid }); }} title="Floor grid (G)">
                    Grid
                  </button>
                  <button type="button" className={showControls ? "obs-chip is-on" : "obs-chip"} aria-expanded={showControls} onClick={() => { setShowControls((v) => !v); }}>
                    Controls
                  </button>
                </div>
                {showControls && (
                  <dl className="map-3d-help">
                    {CONTROLS.map(([how, what]) => (
                      <div key={how} className="atlas-help-row">
                        <dt>{how}</dt>
                        <dd>{what}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              {selected && sel && (
                // On a phone the panel is further down: the name shows on the model, and leads there.
                <button type="button" className="atlas-picked" onClick={() => { infoPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                  <strong>{selTitle}</strong>
                  {sel.side && <small> {sideLabel(sel.side)}</small>}
                  <span aria-hidden="true"> ↓</span>
                </button>
              )}
              <div className="atlas-tools" role="toolbar" aria-label="Anatomical views">
                {VIEW_BUTTONS.map(([v, label, english, key]) => (
                  <button key={v} type="button" className="obs-chip" title={`${english} view (${key})`} onClick={() => { view(v); }}>
                    {label}
                  </button>
                ))}
                {(isolating || hiddenCount > 0) && (
                  <button type="button" className="obs-chip is-on" onClick={showEverything}>
                    Show all{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
                  </button>
                )}
              </div>
              <div className="obs-zoom atlas-zoom">
                <button type="button" className="obs-icon-btn" onClick={() => viewer.current?.orbit(TURN)} title="Turn left (←)" aria-label="Turn left">
                  <TurnLeftIcon />
                </button>
                <button type="button" className="obs-icon-btn" onClick={() => viewer.current?.orbit(-TURN)} title="Turn right (→)" aria-label="Turn right">
                  <TurnRightIcon />
                </button>
                <button type="button" className="obs-icon-btn" onClick={() => viewer.current?.zoom(0.75)} title="Zoom in (+)" aria-label="Zoom in">
                  <PlusIcon />
                </button>
                <button type="button" className="obs-icon-btn" onClick={() => viewer.current?.zoom(1 / 0.75)} title="Zoom out (−)" aria-label="Zoom out">
                  <MinusIcon />
                </button>
                <button type="button" className="obs-icon-btn" onClick={() => viewer.current?.frameAll()} title="Whole body (0)" aria-label="Whole body">
                  <FitIcon />
                </button>
              </div>
            </div>
          </div>

          <aside className="obs-note-pane atlas-note-pane" aria-live="polite" ref={infoPanel}>
            <div className="obs-tabbar">
              <span className="obs-tab is-active">
                <FileIcon />
                <span className="obs-tab-title">{selected && sel ? selTitle : "New tab"}</span>
                {selected && (
                  <button type="button" className="obs-tab-close" onClick={() => { setAlso([]); select(null); }} aria-label="Close this structure" title="Close (Esc)">
                    <CloseIcon />
                  </button>
                )}
              </span>
            </div>
            {selected && sel ? (
              <div className="obs-note">
                <div className="obs-view-header">
                  <nav className="obs-breadcrumb" aria-label="Where this structure is">
                    <span>{labelOf(selected.system)}</span>
                    {sel.side && (
                      <>
                        <span aria-hidden="true">/</span>
                        <span title={sideEnglish(sel.side)}>{sideLabel(sel.side)}</span>
                      </>
                    )}
                  </nav>
                  <div className="obs-view-actions">
                    <button type="button" className="obs-icon-btn" disabled={!backTo} onClick={() => { step(-1); }} title={backTo ? `Back to ${nameOf(backTo)} (Backspace)` : "Back"} aria-label={backTo ? `Back to ${nameOf(backTo)}` : "Back"}>
                      <BackIcon />
                    </button>
                    <button type="button" className="obs-icon-btn" disabled={!forwardTo} onClick={() => { step(1); }} title={forwardTo ? `Forward to ${nameOf(forwardTo)}` : "Forward"} aria-label={forwardTo ? `Forward to ${nameOf(forwardTo)}` : "Forward"}>
                      <ForwardIcon />
                    </button>
                  </div>
                </div>

                <article className="obs-note-body">
                  <h2 className="obs-inline-title">{selTitle}</h2>
                  {(selLatin || selGreek) && (
                    <p className="atlas-latin" lang="la">
                      {selLatin && <em>{selLatin}</em>}
                      {selGreek && (
                        <span className="atlas-greek" lang="grc-Latn" title="The Greek root behind the clinical terms">
                          {selLatin ? " · " : ""}Gr. {selGreek}
                        </span>
                      )}
                    </p>
                  )}
                  {config?.ai === true && (
                    <button
                      type="button"
                      className="obs-ask"
                      onClick={() => {
                        askAlfondAbout(`Explain the ${sel.name.toLowerCase()}${selLatin ? ` (${selLatin})` : ""}: what it is, where it is, what it does and what it relates to. Keep it short and exam-focused.`, () => {
                          navigate("/alfond");
                        });
                      }}
                    >
                      <span className="obs-ask-icon" aria-hidden="true">
                        <AlfondIcon />
                      </span>
                      <span className="obs-ask-text">
                        <strong>Ask Alfond about {sel.name}</strong>
                        <small>{selLatin ? `${selLatin}: where it is, what it does` : "Explained short and exam-focused"}</small>
                      </span>
                      <span className="obs-ask-go" aria-hidden="true">
                        →
                      </span>
                    </button>
                  )}
                  {description ? (
                    <div className="obs-callout">
                      <p className="obs-callout-title">What it is</p>
                      {description.split("\n\n").map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                      <p className="atlas-source">From Z-Anatomy, after Wikipedia (CC BY-SA).</p>
                    </div>
                  ) : (
                    <p className="obs-faint">{descriptions ? "No description for this one yet." : "Loading the description…"}</p>
                  )}

                  <div className="obs-properties" aria-label="Properties">
                    <div className="obs-prop">
                      <span className="obs-prop-key">
                        <TagIcon />
                        systema
                      </span>
                      <span className="obs-prop-value">
                        <span className="obs-tag">#{labelOf(selected.system).toLowerCase().replace(/\s+/g, "-")}</span>
                        {sel.side && <span className="obs-tag" title={sideEnglish(sel.side)}>#{sideLabel(sel.side).toLowerCase()}</span>}
                      </span>
                    </div>
                    {selLatin && (
                      <div className="obs-prop">
                        <span className="obs-prop-key">
                          <HashIcon />
                          nomen
                        </span>
                        <span className="obs-prop-value" lang="la">
                          <em>{selLatin}</em>
                        </span>
                      </div>
                    )}
                    {selGreek && (
                      <div className="obs-prop">
                        <span className="obs-prop-key">
                          <HashIcon />
                          Greek
                        </span>
                        <span className="obs-prop-value" lang="grc-Latn">
                          {selGreek}
                        </span>
                      </div>
                    )}
                    {selPath >= 0 && index && (index.paths[selPath]?.length ?? 0) > 0 && (
                      <div className="obs-prop">
                        <span className="obs-prop-key">
                          <FolderIcon />
                          group
                        </span>
                        <span className="obs-prop-value atlas-path">
                          {index.paths[selPath]?.map((g, i) => (
                            <span key={g}>
                              {i > 0 && <span className="obs-faint"> › </span>}
                              <button
                                type="button"
                                className="obs-internal-link"
                                title={`${latinOf(latin, g) ? `${latinOf(latin, g)}: ` : ""}everything in ${g}`}
                                onClick={() => {
                                  setQuery(g);
                                  findStructure();
                                }}
                              >
                                {g}
                              </button>
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="obs-chip-row atlas-actions">
                    <button type="button" className="obs-chip" onClick={() => viewer.current?.focus(selected)} aria-keyshortcuts="F">
                      Focus
                    </button>
                    <button type="button" className={isolating ? "obs-chip is-on" : "obs-chip"} onClick={toggleIsolate} aria-keyshortcuts="O">
                      {isolating ? "Show the rest" : also.length > 0 ? "Only these" : "Only this"}
                    </button>
                    <button type="button" className="obs-chip" onClick={hideSelected} aria-keyshortcuts="H">
                      {also.length > 0 ? "Hide these" : "Hide"}
                    </button>
                    {otherPicked && (
                      <button type="button" className="obs-chip" onClick={() => { select(otherPicked, true); }}>
                        {sel.side === "r" ? "Sinistra" : "Dextra"}
                      </button>
                    )}
                    {muscleAttachments.length > 0 && (
                      <button type="button" className="obs-chip" onClick={showAttachments}>
                        Where it attaches
                      </button>
                    )}
                  </div>

                  {stack.length > 1 && stack.some((p) => toKey(p) === toKey(selected)) && (
                    <>
                      <h3>At this spot, front to back</h3>
                      <div className="obs-chip-row">
                        {stack.map((p) => {
                          const parsed = parseNode(p.node);
                          const on = toKey(p) === toKey(selected);
                          return (
                            <button
                              key={toKey(p)}
                              type="button"
                              className={on ? "obs-chip is-on" : "obs-chip"}
                              aria-pressed={on}
                              title={latinOf(latin, parsed.name) ? latinWithSide(latinOf(latin, parsed.name) ?? "", parsed.side) : parsed.name}
                              onClick={() => { setAlso([]); select(p); }}
                            >
                              {parsed.name}
                              {parsed.side ? <small> {sideShort(parsed.side)}</small> : null}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {also.length > 0 && (
                    <>
                      <h3>Also selected ({also.length})</h3>
                      <div className="obs-chip-row">
                        {also.map((p) => {
                          const parsed = parseNode(p.node);
                          return (
                            <span key={toKey(p)} className="obs-chip atlas-also-item">
                              <button type="button" className="atlas-also-name" onClick={() => { setAlso((prev) => [selected, ...prev.filter((x) => toKey(x) !== toKey(p))]); select(p); }}>
                                {parsed.name}
                                {parsed.side ? <small> {sideShort(parsed.side)}</small> : null}
                              </button>
                              <button type="button" className="atlas-also-remove" aria-label={`Take ${parsed.name} out of the selection`} onClick={() => { setAlso((prev) => prev.filter((x) => toKey(x) !== toKey(p))); }}>
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {landmarks.length > 0 && (
                    <>
                      <h3>
                        Landmarks <span className="obs-count">{landmarks.length}</span>
                      </h3>
                      <ul className="obs-bridges atlas-landmarks">
                        {landmarks.map(([name, x, y, z]) => {
                          const la = latinOf(latin, parseNode(name).name);
                          return (
                            <li key={name}>
                              <button
                                type="button"
                                aria-pressed={landmark === name}
                                className={landmark === name ? "obs-internal-link is-on" : "obs-internal-link"}
                                onClick={() => {
                                  setLandmark(name);
                                  viewer.current?.focusPoint([x, y, z]);
                                }}
                              >
                                {name}
                              </button>
                              {la && la.toLowerCase() !== parseNode(name).name.toLowerCase() && (
                                <small lang="la">
                                  <em>{la}</em>
                                </small>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  <Link to={`/search?q=${encodeURIComponent(sel.name)}`} className="obs-callout-more">
                    Find “{sel.name}” in your notes →
                  </Link>
                </article>
              </div>
            ) : (
              <div className="obs-empty">
                <p className="obs-empty-title">No structure is open</p>
                <button type="button" className="obs-empty-action" onClick={findStructure}>
                  Find a structure <kbd>/</kbd>
                </button>
                <button type="button" className="obs-empty-action" onClick={openRandom}>
                  Open a random structure
                </button>
                <p className="obs-empty-hint">
                  Or click any part of the body. Drag to orbit, right-drag to pan, scroll to zoom, <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to fly; click
                  an end of the axis gizmo to look from anterior, posterior, superior, inferior, sinistra or dextra. Search finds any of the{" "}
                  {structureCount ? structureCount.toLocaleString() : "1,800"} structures, in English or Latin.
                </p>
                <h3 className="obs-empty-head">Start with</h3>
                <ul className="obs-bridges">
                  {quick.map((hit) => (
                    <li key={hit.name}>
                      <button type="button" className="obs-internal-link" onClick={() => { select({ system: hit.system, node: hit.node }, true); }}>
                        {hit.name}
                      </button>
                      {hit.latin && hit.latin.toLowerCase() !== hit.name.toLowerCase() && (
                        <small lang="la">
                          <em>{hit.latin}</em>
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
                {recent.length > 0 && (
                  <>
                    <h3 className="obs-empty-head">Recently opened</h3>
                    <ul className="obs-bridges">
                      {recent.map((p) => (
                        <li key={toKey(p)}>
                          <button type="button" className="obs-internal-link" onClick={() => { select(p, true); }}>
                            {parseNode(p.node).name}
                            {parseNode(p.node).side ? ` (${sideShort(parseNode(p.node).side)})` : ""}
                          </button>
                          <small>{labelOf(p.system)}</small>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </aside>

          <footer className="obs-status">
            <span>{sideText}</span>
            {(isolating || hiddenCount > 0) && <span>{isolating ? "Showing only the selection" : `${hiddenCount} hidden`}</span>}
            <span>
              {layers.filter((l) => l !== ATTACHMENTS).length} systems · {shownCount.toLocaleString()} structures
            </span>
          </footer>
        </div>
      </div>

      <p className="atlas-credit">
        Models and descriptions: <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener noreferrer">Z-Anatomy</a> (CC BY-SA 4.0), based
        on BodyParts3D, © The Database Center for Life Science (CC BY-SA 2.1 JP). <a href={`${ATLAS_BASE}LICENSE.txt`}>Licence and credits</a>.
      </p>
    </section>
  );
}
