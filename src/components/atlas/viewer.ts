import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { ATLAS_BASE, defaultOpacity, tissueColor } from "../../lib/atlas/model";
import { isTyping } from "../../lib/keys";

// The 3D anatomy atlas's viewer: three.js, navigated like the knowledge map's 3D view and a 3D
// editor's viewport (orbit, pan, dolly, fly with W A S D Q E, an axis gizmo named in anatomical
// terms, perspective or orthographic, a floor grid). One glTF per body system is loaded the
// first time it's shown, structures coloured by tissue. Each system is drawn as a few
// BatchedMeshes (one per colour), so thousands of structures cost a handful of draw calls. It
// draws only when something changes (a camera move, a selection, a load), so an idle atlas
// costs nothing.

export interface Picked {
  system: string;
  node: string;
}

/** How a click selected: with Ctrl/⌘/Shift held (add to the selection), and everything under it. */
export interface SelectInfo {
  additive: boolean;
  /** The structures under the pointer, nearest first (the picked one included). */
  stack: Picked[];
}

export interface ViewerEvents {
  onSelect: (picked: Picked | null, info: SelectInfo) => void;
  onHover: (hover: (Picked & { x: number; y: number }) | null) => void;
  onProgress: (system: string, fraction: number | null) => void;
  onError: (system: string) => void;
  /** A structure was double-clicked (to fly to it). */
  onFocus?: (picked: Picked) => void;
  /** Which side of the body is facing you now ("Anterior", "Sinistra"…), when it changes. */
  onView?: (side: ViewSide) => void;
}

/** W A S D fly forward, left, back and right, Q E down and up. */
const FLY_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);


export type ViewSide = "Anterior" | "Posterior" | "Sinistra" | "Dextra" | "Superior" | "Inferior";

/** The side of the body seen from a direction (from the body to the camera; the body faces +Z). */
export function sideFacing(dir: { x: number; y: number; z: number }): ViewSide {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const y = dir.y / len;
  if (y > 0.75) return "Superior";
  if (y < -0.75) return "Inferior";
  if (Math.abs(dir.z) >= Math.abs(dir.x)) return dir.z >= 0 ? "Anterior" : "Posterior";
  // Seen from +X is the body's left side.
  return dir.x > 0 ? "Sinistra" : "Dextra";
}

export type ViewName = "front" | "back" | "left" | "right" | "top" | "bottom";

/** Where the camera looks from for each view (the body faces +Z; its left side is +X). */
const VIEW_DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

/** The view looking from the other side. */
export const OPPOSITE: Record<ViewName, ViewName> = { front: "back", back: "front", left: "right", right: "left", top: "bottom", bottom: "top" };

/**
 * The axis gizmo's six ends, named as anatomists name the directions, coloured by axis as 3D
 * editors colour X, Y and Z: lateral (sinistra, dextra) red, vertical (superior, inferior)
 * green, sagittal (anterior, posterior) blue.
 */
const GIZMO_ENDS: { view: ViewName; label: string; short: string; color: string }[] = [
  { view: "front", label: "Anterior", short: "Ant", color: "#3e7bf0" },
  { view: "back", label: "Posterior", short: "Post", color: "#3e7bf0" },
  { view: "top", label: "Superior", short: "Sup", color: "#46a758" },
  { view: "bottom", label: "Inferior", short: "Inf", color: "#46a758" },
  { view: "left", label: "Sinistra", short: "Sin", color: "#e5484d" },
  { view: "right", label: "Dextra", short: "Dx", color: "#e5484d" },
];

/** One piece of a structure: an instance in one of its system's batches. */
interface Instance {
  batch: THREE.BatchedMesh;
  id: number;
  geometryId: number;
}

/** A structure: a bone may be several pieces (bone, cartilage, a tooth's enamel…). */
interface Part {
  system: string;
  node: string;
  instances: Instance[];
}

/** Where a system's model is, and its size (for progress when the host doesn't say). */
export interface ModelFile {
  url: string;
  bytes: number;
}

const keyOf = (system: string, node: string) => `${system}/${node}`;
/** How far back the orthographic camera stands from the point looked at: clear of the whole body. */
const ORTHO_BACK = 6;
const BODY_CENTRE = new THREE.Vector3(0, 0.9, 0);
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const HIGHLIGHT = 0x2fd3a5;
const OUTLINE = 0x1fe0ae;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let decoderWorkers = false;

/** The selection outline: back faces pushed out along the normals by a width set each frame. */
function outlineMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  m.userData = { own: true, width: { value: 0.002 } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = m.userData.width as { value: number };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float outlineWidth;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;");
  };
  return m;
}

/** The x-ray tint: drawn only where something nearer covers the selected structure. */
function xrayMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0.3, depthWrite: false, depthFunc: THREE.GreaterDepth });
  m.userData = { own: true };
  return m;
}

/** Downloads a model, reporting progress, and unzips it if it came gzipped. */
async function fetchModel(file: ModelFile, onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(file.url);
  if (!response.ok || !response.body) throw new Error(`${file.url}: ${response.status}`);
  const total = Number(response.headers.get("content-length")) || file.bytes;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total > 0) onProgress(Math.min(1, loaded / total));
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  // The files are gzipped; a server that marks them as such has already unzipped them.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export class AtlasViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly loader: GLTFLoader;
  private readonly host: HTMLElement;
  private readonly labels: HTMLDivElement;
  private readonly events: ViewerEvents;
  private readonly systems = new Map<string, THREE.Group>();
  private readonly loads = new Map<string, Promise<void>>();
  private readonly parts = new Map<string, Part>();
  /** Per system and colour: the base material, and its selected and hovered versions. */
  private readonly materials = new Map<string, { base: THREE.MeshStandardMaterial; selected: THREE.MeshStandardMaterial; hovered: THREE.MeshStandardMaterial }>();
  private readonly opacity = new Map<string, number>();
  /** Each system's model file, with a version so a changed model isn't served from the cache. */
  private files: Record<string, ModelFile> = {};
  private readonly hidden = new Set<string>();
  private isolated: Set<string> | null = null;
  /** Per system, the only structures to show (null: all of them). */
  private readonly filters = new Map<string, Set<string> | null>();
  /** The selection: the structure the panel shows first, and any added with Ctrl/⌘+click. */
  private selected: string | null = null;
  private readonly selection = new Map<string, THREE.Group>();
  private hovered: string | null = null;
  /** The hovered structure, drawn on its own over a hole in its batch (the selection likewise). */
  private hoverOverlay = new THREE.Group();
  /** Geometry views into a batch's buffers, one per piece, reused by the overlays. */
  private readonly views = new Map<string, THREE.BufferGeometry>();
  private markers = new THREE.Group();
  private markerLabels: { el: HTMLDivElement; at: THREE.Vector3 }[] = [];
  private tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; start: number; ms: number } | null = null;
  private side: ViewSide | null = null;
  private frame = 0;
  private running = false;
  private hoverTimer = 0;
  private down: { x: number; y: number } | null = null;
  private lastClick = { at: 0, key: "", x: 0, y: 0 };
  /** The W A S D Q E keys held, and whether Shift is (to fly faster). */
  private readonly keys = new Set<string>();
  private boost = false;
  private lastFrame = 0;
  /**
   * Orthographic drawing: the perspective camera stays the rig that the controls, tweens and
   * flying move, and this camera copies it each frame, with a frustum as tall as the
   * perspective view's at the point looked at.
   */
  private readonly orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, ORTHO_BACK * 2);
  private ortho = false;
  /** The floor: a grid at the feet, with the lateral and sagittal axes. */
  private readonly grid = new THREE.Group();
  private gizmo: HTMLCanvasElement | null = null;
  private gizmoHover: ViewName | null = null;
  /** Where each gizmo end was drawn (CSS pixels), the nearest last. */
  private gizmoHits: { view: ViewName; x: number; y: number; w: number; h: number }[] = [];
  private readonly resize: ResizeObserver;
  private disposed = false;

  constructor(host: HTMLElement, events: ViewerEvents) {
    this.host = host;
    this.events = events;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "atlas-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "3D model of the body. Drag to turn it, scroll to zoom, click a part to name it.");
    host.appendChild(this.renderer.domElement);
    this.labels = document.createElement("div");
    this.labels.className = "atlas-labels";
    host.appendChild(this.labels);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 30);
    this.camera.position.set(0, 1.05, 3.4);
    // The light comes from where you're looking, so whatever faces you is lit.
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1, 1.4);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.4));
    this.scene.add(this.markers);
    this.buildGrid();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(BODY_CENTRE);
    this.controls.enableDamping = !reducedMotion();
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 8;
    // As the knowledge map's 3D view: drag orbits, right- or middle-drag pans (Shift+drag too).
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.autoRotateSpeed = 1.2;
    this.controls.addEventListener("change", () => { this.request(); });

    // Unpacking the models runs in workers, so the page stays responsive while a system loads.
    if (!decoderWorkers && typeof Worker !== "undefined") {
      // oxlint-disable-next-line react-hooks/rules-of-hooks -- the decoder's own method, not a React hook
      MeshoptDecoder.useWorkers(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)));
      decoderWorkers = true;
    }
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    el.addEventListener("wheel", this.onWheel, { passive: true });
    // Orthographic zoom toward the pointer is the viewer's: OrbitControls aims for perspective.
    host.addEventListener("wheel", this.onOrthoWheel, { capture: true, passive: false });
    el.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resize = new ResizeObserver(() => { this.fit(); });
    this.resize.observe(host);
    this.fit();
  }

  /** Shows or hides a body system, loading its model the first time. */
  async show(system: string, on: boolean): Promise<void> {
    if (on) await this.load(system);
    const group = this.systems.get(system);
    if (group) group.visible = on;
    this.request();
  }

  /** Where each system's model is (from the atlas index). */
  setFiles(files: Record<string, ModelFile>): void {
    this.files = files;
  }

  isShown(system: string): boolean {
    return this.systems.get(system)?.visible === true;
  }

  private load(system: string): Promise<void> {
    let pending = this.loads.get(system);
    if (pending) return pending;
    const file = this.files[system] ?? { url: `${ATLAS_BASE}${system}.glb.gz`, bytes: 0 };
    this.events.onProgress(system, 0);
    pending = fetchModel(file, (f) => { this.events.onProgress(system, f * 0.9); })
      .then((buffer) => this.loader.parseAsync(buffer, ATLAS_BASE))
      .then((gltf) => {
        if (this.disposed) return;
        this.events.onProgress(system, 0.95);
        const group = this.build(system, gltf);
        group.visible = false;
        this.systems.set(system, group);
        this.scene.add(group);
        this.applyVisibility();
        this.events.onProgress(system, null);
      })
      .catch((err: unknown) => {
        console.error(`Loading ${system} failed`, err);
        this.loads.delete(system);
        this.events.onProgress(system, null);
        this.events.onError(system);
        throw err;
      });
    this.loads.set(system, pending);
    return pending;
  }

  /** A loaded model, regrouped into one batch per colour (and per handedness: see below). */
  private build(system: string, gltf: GLTF): THREE.Group {
    const group = new THREE.Group();
    group.name = system;
    const json = gltf.parser.json as { nodes?: { name?: string }[] };
    gltf.scene.updateMatrixWorld(true);

    interface Piece { key: string; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }
    const buckets = new Map<string, { material: THREE.MeshStandardMaterial; mirrored: boolean; pieces: Piece[] }>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // three.js tidies node names; the glTF's own name is the structure's. A node with several
      // materials is a group of meshes, one per material: all of them are the one structure.
      let owner: THREE.Object3D | null = mesh;
      let index: number | undefined;
      while (owner && index === undefined) {
        index = gltf.parser.associations.get(owner)?.nodes;
        owner = owner.parent;
      }
      const node = (index !== undefined ? json.nodes?.[index]?.name : undefined) ?? mesh.name;
      const source = mesh.material as THREE.Material;
      const material = this.material(system, source.name).base;
      source.dispose();
      // The left side is the right one mirrored. three.js flips which faces count as the front
      // for a mirrored object, but not for one instance in a batch, so those get a batch of
      // their own with the mirror on the batch itself.
      const matrix = mesh.matrixWorld.clone();
      const mirrored = matrix.determinant() < 0;
      const bucket = `${material.uuid}|${mirrored ? "m" : ""}`;
      let b = buckets.get(bucket);
      if (!b) buckets.set(bucket, (b = { material, mirrored, pieces: [] }));
      b.pieces.push({ key: keyOf(system, node), geometry: mesh.geometry, matrix: mirrored ? MIRROR.clone().multiply(matrix) : matrix });
      if (!this.parts.has(keyOf(system, node))) this.parts.set(keyOf(system, node), { system, node, instances: [] });
    });

    for (const { material, mirrored, pieces } of buckets.values()) {
      const unique = [...new Set(pieces.map((p) => p.geometry))];
      const vertices = unique.reduce((n, g) => n + g.getAttribute("position").count, 0);
      const indices = unique.reduce((n, g) => n + (g.getIndex()?.count ?? 0), 0);
      const batch = new THREE.BatchedMesh(pieces.length, vertices, indices, material);
      if (mirrored) batch.scale.x = -1;
      const ids = new Map<THREE.BufferGeometry, number>();
      const owners: string[] = [];
      for (const piece of pieces) {
        let geometryId = ids.get(piece.geometry);
        if (geometryId === undefined) {
          geometryId = batch.addGeometry(piece.geometry);
          ids.set(piece.geometry, geometryId);
        }
        const id = batch.addInstance(geometryId);
        batch.setMatrixAt(id, piece.matrix);
        owners[id] = piece.key;
        this.parts.get(piece.key)?.instances.push({ batch, id, geometryId });
      }
      batch.userData = { system, owners };
      group.add(batch);
    }
    // The batches hold their own copies; the loaded geometry was never drawn, so it just goes.
    gltf.scene.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); });
    group.updateMatrixWorld(true);
    return group;
  }

  private material(system: string, name: string) {
    const color = tissueColor(name, system);
    const id = `${system}|${color}`;
    let m = this.materials.get(id);
    if (!m) {
      const base = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
      const selected = base.clone();
      selected.emissive = new THREE.Color(HIGHLIGHT);
      selected.emissiveIntensity = 0.45;
      const hovered = base.clone();
      hovered.emissive = new THREE.Color(HIGHLIGHT);
      hovered.emissiveIntensity = 0.3;
      m = { base, selected, hovered };
      this.materials.set(id, m);
      for (const x of [base, selected, hovered]) this.applyOpacity(system, x);
    }
    return m;
  }

  setOpacity(system: string, value: number): void {
    this.opacity.set(system, value);
    for (const [id, m] of this.materials) if (id.startsWith(`${system}|`)) for (const x of [m.base, m.selected, m.hovered]) this.applyOpacity(system, x);
    this.request();
  }

  private applyOpacity(system: string, m: THREE.MeshStandardMaterial) {
    const value = this.opacity.get(system) ?? defaultOpacity(system);
    m.opacity = value;
    m.transparent = value < 1;
    m.depthWrite = value >= 1;
    m.needsUpdate = true;
  }

  /**
   * Highlights a structure (or none), and any others selected with it: each gets a glow, an
   * outline, and an x-ray tint where other structures hide it.
   */
  select(picked: Picked | null, also: Picked[] = []): void {
    this.selected = picked ? keyOf(picked.system, picked.node) : null;
    const want = new Set([...(picked ? [picked] : []), ...also].map((p) => keyOf(p.system, p.node)));
    for (const [key, group] of this.selection) {
      if (want.has(key)) continue;
      this.dropOverlay(group);
      this.selection.delete(key);
    }
    for (const key of want) {
      if (this.selection.has(key)) continue;
      const group = this.buildOverlay(key, "selected");
      if (group) this.selection.set(key, group);
    }
    if (this.hovered && want.has(this.hovered)) this.setHovered(null);
    this.applyVisibility();
  }

  private setHovered(key: string | null) {
    if (key === this.hovered) return;
    this.hovered = key;
    this.dropOverlay(this.hoverOverlay);
    this.hoverOverlay = (key && !this.selection.has(key) ? this.buildOverlay(key, "hovered") : null) ?? new THREE.Group();
    this.applyVisibility();
  }

  /** A geometry that draws one piece straight from its batch's buffers (nothing is copied). */
  private viewOf(inst: Instance): THREE.BufferGeometry {
    const id = `${inst.batch.uuid}|${inst.geometryId}`;
    let g = this.views.get(id);
    if (!g) {
      g = new THREE.BufferGeometry();
      const source = inst.batch.geometry;
      for (const [name, attribute] of Object.entries(source.attributes)) g.setAttribute(name, attribute);
      g.setIndex(source.getIndex());
      const range = inst.batch.getGeometryRangeAt(inst.geometryId);
      if (range) g.setDrawRange(range.start, range.count);
      g.boundingBox = inst.batch.getBoundingBoxAt(inst.geometryId, new THREE.Box3());
      g.boundingSphere = inst.batch.getBoundingSphereAt(inst.geometryId, new THREE.Sphere());
      this.views.set(id, g);
    }
    return g;
  }

  /** A structure drawn on its own: tinted, and for the selection outlined and x-rayed too. */
  private buildOverlay(key: string, kind: "selected" | "hovered"): THREE.Group | null {
    const part = this.parts.get(key);
    if (!part) return null;
    const overlay = new THREE.Group();
    overlay.userData = { key };
    for (const inst of part.instances) {
      const base = inst.batch.material as THREE.MeshStandardMaterial;
      const set = [...this.materials.values()].find((m) => m.base === base);
      const geometry = this.viewOf(inst);
      const matrix = new THREE.Matrix4();
      inst.batch.getMatrixAt(inst.id, matrix);
      matrix.premultiply(inst.batch.matrix);
      const add = (material: THREE.Material, order: number, pick: boolean) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix);
        mesh.userData = pick ? { system: part.system, node: part.node, pick: true } : {};
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        overlay.add(mesh);
        return mesh;
      };
      add(set ? set[kind] : base, 0, true);
      if (kind !== "selected") continue;
      // The outline: the back faces pushed out along their normals, a constant width on screen.
      const outline = add(outlineMaterial(), 1, false);
      const scale = matrix.getMaxScaleOnAxis() || 1;
      const centre = (geometry.boundingSphere?.center ?? new THREE.Vector3()).clone().applyMatrix4(matrix);
      outline.onBeforeRender = (_r, _s, camera) => {
        // About half a percent of the view's height, in either projection.
        const viewHeight = (camera as THREE.OrthographicCamera).isOrthographicCamera
          ? ((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom) * 0.5
          : camera.position.distanceTo(centre) * 0.63;
        (outline.material as THREE.MeshBasicMaterial).userData.width.value = (viewHeight * 0.0051) / scale;
      };
      // The x-ray: drawn only where something nearer hides it, so a nerve under a muscle shows.
      add(xrayMaterial(), 2, false);
    }
    // In its system's group, so it comes and goes with the system.
    this.systems.get(part.system)?.add(overlay);
    overlay.updateMatrixWorld(true);
    return overlay;
  }

  private dropOverlay(overlay: THREE.Group) {
    overlay.removeFromParent();
    // The geometry views share the batches' buffers, so only the overlay's own materials go.
    for (const mesh of overlay.children as THREE.Mesh[]) {
      const m = mesh.material as THREE.Material;
      if (m.userData.own) m.dispose();
    }
    overlay.clear();
  }

  /** Whether a structure is loaded (so it can be selected and focused). */
  has(picked: Picked): boolean {
    return this.parts.has(keyOf(picked.system, picked.node));
  }

  /** The box around some pieces, in the scene. */
  private boxOf(instances: Instance[]): THREE.Box3 {
    const box = new THREE.Box3();
    const piece = new THREE.Box3();
    const m = new THREE.Matrix4();
    for (const inst of instances) {
      if (!inst.batch.getBoundingBoxAt(inst.geometryId, piece)) continue;
      inst.batch.getMatrixAt(inst.id, m);
      box.union(piece.applyMatrix4(m.premultiply(inst.batch.matrixWorld)));
    }
    return box;
  }

  /** Flies the camera to a structure (or a point, for a landmark). */
  focus(target: Picked | THREE.Vector3, radius?: number): void {
    let centre: THREE.Vector3;
    let r: number;
    if (target instanceof THREE.Vector3) {
      centre = target.clone();
      r = radius ?? 0.04;
    } else {
      const part = this.parts.get(keyOf(target.system, target.node));
      if (!part) return;
      const box = this.boxOf(part.instances);
      centre = box.getCenter(new THREE.Vector3());
      r = Math.max(0.03, box.getSize(new THREE.Vector3()).length() / 2);
    }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25;
    this.flyTo(centre, centre.clone().add(dir.multiplyScalar(dist)));
  }

  /** Flies to a point on the body (a landmark). */
  focusPoint(at: [number, number, number], radius = 0.035): void {
    this.focus(new THREE.Vector3(...at), radius);
  }

  /** Everything on show in view. */
  frameAll(): void {
    const shown: Instance[] = [];
    for (const part of this.parts.values()) if (this.systems.get(part.system)?.visible && this.visible(part)) shown.push(...part.instances);
    const box = shown.length ? this.boxOf(shown) : new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.15), new THREE.Vector3(0.35, 1.75, 0.15));
    const centre = box.getCenter(new THREE.Vector3());
    const r = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(centre, centre.clone().add(dir.multiplyScalar((r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05)));
  }

  /** Looks from the front, back, either side, above or below, at the same distance. */
  view(name: ViewName): void {
    const [t, position] = this.goal();
    const d = position.distanceTo(t);
    // Straight down or up, nudged so "up" on screen stays the body's front.
    const dir = new THREE.Vector3(...VIEW_DIRS[name]).add(new THREE.Vector3(0, 0, name === "top" || name === "bottom" ? 0.0001 : 0)).normalize();
    this.flyTo(t, t.clone().add(dir.multiplyScalar(d)));
  }

  /** The view the camera looks most nearly from (for "the opposite side"). */
  nearestView(): ViewName {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    let best: ViewName = "front";
    let bestDot = -Infinity;
    for (const [name, v] of Object.entries(VIEW_DIRS) as [ViewName, [number, number, number]][]) {
      const dot = dir.dot(new THREE.Vector3(...v));
      if (dot > bestDot) {
        best = name;
        bestDot = dot;
      }
    }
    return best;
  }

  private flyTo(target: THREE.Vector3, position: THREE.Vector3, ms = 550) {
    if (reducedMotion()) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      this.request();
      return;
    }
    this.tween = { from: [this.controls.target.clone(), this.camera.position.clone()], to: [target, position], start: performance.now(), ms };
    this.request();
  }

  /** Where the camera is headed: the end of the glide under way, or where it is. */
  private goal(): [THREE.Vector3, THREE.Vector3] {
    return this.tween ? [this.tween.to[0].clone(), this.tween.to[1].clone()] : [this.controls.target.clone(), this.camera.position.clone()];
  }

  /**
   * Turns the body around the point looked at, in radians: across > 0 turns it to the left (as
   * dragging left does), up > 0 raises the camera to look from higher.
   */
  orbit(across: number, up = 0): void {
    const [target, position] = this.goal();
    const s = new THREE.Spherical().setFromVector3(position.clone().sub(target));
    s.theta += across;
    s.phi = THREE.MathUtils.clamp(s.phi - up, 0.05, Math.PI - 0.05);
    this.flyTo(target, target.clone().add(new THREE.Vector3().setFromSpherical(s)), 320);
  }

  /** Moves closer (factor below 1) or further away. */
  zoom(factor: number): void {
    const [target, position] = this.goal();
    const offset = position.clone().sub(target);
    const d = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.flyTo(target, target.clone().add(offset.setLength(d)), 260);
  }

  /** Slides the view sideways and up or down, by a share of the view's width. */
  pan(across: number, up: number): void {
    const [target, position] = this.goal();
    const d = position.distanceTo(target);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const upward = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const step = right.multiplyScalar(across * d).add(upward.multiplyScalar(up * d));
    this.flyTo(target.add(step), position.add(step), 260);
  }

  /** Turns around a structure from now on: the view slides to it, without zooming. */
  centreOn(picked: Picked): void {
    const part = this.parts.get(keyOf(picked.system, picked.node));
    if (!part) return;
    const centre = this.boxOf(part.instances).getCenter(new THREE.Vector3());
    const [target, position] = this.goal();
    const step = centre.sub(target);
    this.flyTo(target.add(step), position.add(step), 450);
  }

  hide(picked: Picked): void {
    this.hidden.add(keyOf(picked.system, picked.node));
    this.applyVisibility();
  }

  /** Shows only these structures (or everything again, with null). */
  isolate(only: Picked[] | null): void {
    this.isolated = only ? new Set(only.map((p) => keyOf(p.system, p.node))) : null;
    this.applyVisibility();
  }

  get isolating(): boolean {
    return this.isolated !== null;
  }

  /** Un-hides and un-isolates everything. */
  showAll(): void {
    this.hidden.clear();
    this.isolated = null;
    this.applyVisibility();
  }

  get hiddenCount(): number {
    return this.hidden.size;
  }

  /**
   * In a system, shows only some of its structures (some regions, or one muscle's attachment
   * areas), or all of them with null. Kept for systems that haven't loaded yet.
   */
  filterSystem(system: string, nodes: string[] | null): void {
    this.filters.set(system, nodes ? new Set(nodes) : null);
    this.applyVisibility();
  }

  private visible(part: Part): boolean {
    const key = keyOf(part.system, part.node);
    const keep = this.filters.get(part.system);
    return !this.hidden.has(key) && (!keep || keep.has(part.node)) && (!this.isolated || this.isolated.has(key));
  }

  private applyVisibility() {
    for (const [key, part] of this.parts) {
      const on = this.visible(part);
      // The selected and hovered structures are drawn by their overlays instead.
      const overlay = this.selection.get(key) ?? (key === this.hovered ? this.hoverOverlay : undefined);
      const inBatch = on && !overlay;
      for (const inst of part.instances) if (inst.batch.getVisibleAt(inst.id) !== inBatch) inst.batch.setVisibleAt(inst.id, inBatch);
      if (overlay) overlay.visible = on;
    }
    this.request();
  }

  /** Marks points on the model (a structure's landmarks); only the active one is labelled. */
  setMarkers(points: { name: string; at: [number, number, number] }[], active: string | null = null): void {
    this.clearMarkers();
    this.labels.replaceChildren();
    this.markerLabels = [];
    const geometry = new THREE.SphereGeometry(0.0035, 12, 8);
    const material = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, depthTest: false });
    const activeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    for (const p of points) {
      const dot = new THREE.Mesh(geometry, p.name === active ? activeMaterial : material);
      dot.position.set(...p.at);
      if (p.name === active) dot.scale.setScalar(1.6);
      dot.renderOrder = 10;
      this.markers.add(dot);
      if (p.name !== active) continue;
      const el = document.createElement("div");
      el.className = "atlas-marker-label";
      el.textContent = p.name;
      this.labels.appendChild(el);
      this.markerLabels.push({ el, at: dot.position.clone() });
    }
    this.request();
  }

  private clearMarkers() {
    for (const dot of this.markers.children as THREE.Mesh[]) {
      dot.geometry.dispose();
      (dot.material as THREE.Material).dispose();
    }
    this.markers.clear();
  }

  private placeLabels() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const { el, at } of this.markerLabels) {
      v.copy(at).project(this.drawn());
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.display = visible ? "" : "none";
      if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * w + 8}px, ${((1 - v.y) / 2) * h - 10}px)`;
    }
  }

  /** The structure under a point of the canvas: nearest opaque one, else nearest at all. */
  private pick(clientX: number, clientY: number): Picked | null {
    return this.pickStack(clientX, clientY)[0] ?? null;
  }

  /**
   * Every structure under a point of the canvas, nearest first, each once; the nearest opaque
   * one leads, so a see-through skin doesn't get in the way.
   */
  private pickStack(clientX: number, clientY: number): Picked[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.drawn());
    const targets: THREE.Object3D[] = [];
    for (const g of this.systems.values()) {
      if (!g.visible) continue;
      for (const c of g.children) {
        if ((c as THREE.BatchedMesh).isBatchedMesh) targets.push(c);
        else if (c.visible) targets.push(...c.children.filter((m) => (m.userData as { pick?: boolean }).pick));
      }
    }
    const hits = ray.intersectObjects(targets, false);
    const keyAt = (h: THREE.Intersection): string | undefined => {
      const batch = h.object as THREE.BatchedMesh;
      if (batch.isBatchedMesh) return (batch.userData as { owners: string[] }).owners[h.batchId ?? -1];
      const { system, node } = h.object.userData as Picked;
      return keyOf(system, node);
    };
    const solid = hits.find((h) => ((h.object as THREE.Mesh).material as THREE.Material).opacity >= 0.6) ?? hits[0];
    const keys = [...new Set([solid, ...hits].filter((h) => h !== undefined).map(keyAt).filter((k) => k !== undefined))];
    return keys.flatMap((k) => {
      const part = this.parts.get(k);
      return part ? [{ system: part.system, node: part.node }] : [];
    }).slice(0, 12);
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    this.tween = null;
    window.clearTimeout(this.hoverTimer);
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.button !== 0) return;
    const stack = this.pickStack(e.clientX, e.clientY);
    let hit = stack[0] ?? null;
    const now = performance.now();
    const samePlace = Math.hypot(e.clientX - this.lastClick.x, e.clientY - this.lastClick.y) < 6;
    // Clicking the selected structure's place again (not a double-click) goes one deeper.
    if (hit && samePlace && now - this.lastClick.at >= 350 && this.selected) {
      const at = stack.findIndex((p) => keyOf(p.system, p.node) === this.selected);
      if (at >= 0) hit = stack[(at + 1) % stack.length] ?? hit;
    }
    const key = hit ? keyOf(hit.system, hit.node) : "";
    const double = hit !== null && samePlace && key === this.lastClick.key && now - this.lastClick.at < 350;
    this.lastClick = { at: now, key, x: e.clientX, y: e.clientY };
    this.events.onSelect(hit, { additive: e.ctrlKey || e.metaKey || e.shiftKey, stack });
    // A second click on the same part flies to it.
    if (double) {
      this.focus(hit);
      this.events.onFocus?.(hit);
    }
  };

  private onMove = (e: PointerEvent) => {
    window.clearTimeout(this.hoverTimer);
    if (e.pointerType !== "mouse" || e.buttons) {
      this.setHovered(null);
      this.events.onHover(null);
      return;
    }
    // Named once the pointer rests, so moving across the body stays smooth.
    this.hoverTimer = window.setTimeout(() => {
      const hit = this.pick(e.clientX, e.clientY);
      const rect = this.host.getBoundingClientRect();
      this.setHovered(hit ? keyOf(hit.system, hit.node) : null);
      this.events.onHover(hit ? { ...hit, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    }, 120);
  };

  private onWheel = () => {
    this.tween = null;
  };

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  /** W A S D Q E fly, as in the knowledge map, wherever the page isn't taking typing. */
  private onKeyDown = (e: KeyboardEvent) => {
    this.boost = e.shiftKey;
    if (!FLY_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    e.preventDefault();
    this.keys.add(e.code);
    this.tween = null;
    this.request();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.boost = e.shiftKey;
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  /** Draws orthographically (true) or in perspective. */
  setOrthographic(on: boolean): void {
    this.ortho = on;
    // Pinching zooms to the middle in orthographic; the wheel is handled below.
    this.controls.zoomToCursor = !on;
    this.request();
  }

  /** The view's height at the point looked at (the orthographic frustum is this tall). */
  private viewHalfHeight(): number {
    return this.camera.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  /**
   * The wheel in orthographic: zooms by changing the distance (which sets the frustum's size)
   * and slides the view so the point under the pointer stays under it.
   */
  private onOrthoWheel = (e: WheelEvent) => {
    if (!this.ortho || !this.controls.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    this.tween = null;
    const target = this.controls.target;
    const offset = this.camera.position.clone().sub(target);
    const distance = offset.length();
    const next = THREE.MathUtils.clamp(distance * Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0016), this.controls.minDistance, this.controls.maxDistance);
    const f = next / distance;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const half = this.viewHalfHeight();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const shift = right.multiplyScalar(nx * half * this.camera.aspect).add(up.multiplyScalar(ny * half)).multiplyScalar(1 - f);
    target.add(shift);
    this.camera.position.copy(target).add(offset.multiplyScalar(f));
    this.controls.update();
    this.request();
  };

  /** Turns slowly around the point looked at. */
  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on && !reducedMotion();
    this.request();
  }

  /** Shows the floor grid. */
  setGrid(on: boolean): void {
    this.grid.visible = on;
    this.request();
  }

  /**
   * The camera the scene is drawn with. The orthographic one looks the same way as the rig but
   * stands well back, so zooming in shrinks the view without cutting away what lies in front.
   */
  private drawn(): THREE.Camera {
    if (!this.ortho) return this.camera;
    const o = this.orthoCamera;
    const half = this.viewHalfHeight();
    o.top = half;
    o.bottom = -half;
    o.left = -half * this.camera.aspect;
    o.right = half * this.camera.aspect;
    const back = this.camera.position.clone().sub(this.controls.target).normalize();
    o.position.copy(this.controls.target).addScaledVector(back, ORTHO_BACK);
    o.quaternion.copy(this.camera.quaternion);
    o.updateProjectionMatrix();
    o.updateMatrixWorld();
    return o;
  }

  /** A grid on the floor at the feet, 10 cm squares, with the lateral and sagittal axes drawn in. */
  private buildGrid() {
    const lines = new THREE.GridHelper(4, 40, 0x8a8f98, 0x8a8f98);
    const material = lines.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.18;
    material.depthWrite = false;
    this.grid.add(lines);
    const axis = (color: string, from: [number, number, number], to: [number, number, number]) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
      this.grid.add(new THREE.Line(g, m));
    };
    axis(GIZMO_ENDS[4].color, [-2, 0.001, 0], [2, 0.001, 0]);
    axis(GIZMO_ENDS[0].color, [0, 0.001, -2], [0, 0.001, 2]);
    this.grid.renderOrder = -1;
    this.scene.add(this.grid);
  }

  /** The axis gizmo: a canvas the viewer draws the camera's axes on; click an end to look from it. */
  attachGizmo(canvas: HTMLCanvasElement | null): void {
    if (this.gizmo) {
      this.gizmo.removeEventListener("pointerdown", this.onGizmoDown);
      this.gizmo.removeEventListener("pointermove", this.onGizmoMove);
      this.gizmo.removeEventListener("pointerleave", this.onGizmoLeave);
    }
    this.gizmo = canvas;
    if (!canvas) return;
    canvas.addEventListener("pointerdown", this.onGizmoDown);
    canvas.addEventListener("pointermove", this.onGizmoMove);
    canvas.addEventListener("pointerleave", this.onGizmoLeave);
    this.drawGizmo();
  }

  private gizmoAt(e: PointerEvent): ViewName | null {
    const box = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    // The nearest end is drawn last, so it wins where two overlap.
    for (let i = this.gizmoHits.length - 1; i >= 0; i--) {
      const h = this.gizmoHits[i];
      if (Math.abs(x - h.x) <= h.w / 2 + 2 && Math.abs(y - h.y) <= h.h / 2 + 2) return h.view;
    }
    return null;
  }

  private onGizmoDown = (e: PointerEvent) => {
    const v = this.gizmoAt(e);
    if (v) this.view(v);
  };

  private onGizmoMove = (e: PointerEvent) => {
    const v = this.gizmoAt(e);
    const canvas = e.currentTarget as HTMLCanvasElement;
    canvas.style.cursor = v ? "pointer" : "default";
    canvas.title = v ? `Look from ${GIZMO_ENDS.find((g) => g.view === v)?.label.toLowerCase() ?? v}` : "";
    if (v !== this.gizmoHover) {
      this.gizmoHover = v;
      this.drawGizmo();
    }
  };

  private onGizmoLeave = () => {
    this.gizmoHover = null;
    this.drawGizmo();
  };

  private drawGizmo() {
    const canvas = this.gizmo;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = canvas.clientWidth || 140;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const css = getComputedStyle(canvas);
    const bg = css.getPropertyValue("--gizmo-bg").trim() || "rgb(0 0 0 / 0.35)";
    const ink = css.getPropertyValue("--gizmo-ink").trim() || "#fff";
    const c = size / 2;
    const reach = c - 30;
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.globalAlpha = 1;
    // The camera's right, up and toward-the-viewer directions.
    const m = this.camera.matrixWorld.elements;
    const right = [m[0], m[1], m[2]];
    const up = [m[4], m[5], m[6]];
    const back = [m[8], m[9], m[10]];
    const dot = (a: number[], b: [number, number, number]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const ends = GIZMO_ENDS.map((g) => {
      const v = VIEW_DIRS[g.view];
      return { ...g, x: c + dot(right, v) * reach, y: c - dot(up, v) * reach, depth: dot(back, v) };
    }).sort((p, q) => p.depth - q.depth);
    ctx.font = "600 10px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.gizmoHits = [];
    for (const e of ends) {
      const front = e.depth > -0.05;
      const hot = e.view === this.gizmoHover;
      ctx.globalAlpha = front || hot ? 1 : 0.55;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(e.x, e.y);
      ctx.lineWidth = front ? 2 : 1.25;
      ctx.strokeStyle = e.color;
      ctx.stroke();
      // An end pointing at you or away sits near the middle: a dot there (the tab names the
      // view), so it doesn't cover the others. A small gizmo uses the short names.
      const near = Math.hypot(e.x - c, e.y - c) < reach * 0.55;
      const text = near ? "" : size < 120 ? e.short : e.label;
      const w = near ? 12 : ctx.measureText(text).width + 12;
      const h = near ? 12 : 17;
      ctx.beginPath();
      ctx.roundRect(e.x - w / 2, e.y - h / 2, w, h, h / 2);
      ctx.fillStyle = front || hot ? e.color : bg;
      ctx.fill();
      ctx.lineWidth = hot ? 2 : 1;
      ctx.strokeStyle = hot ? ink : e.color;
      ctx.stroke();
      ctx.fillStyle = front || hot ? "#fff" : e.color;
      ctx.fillText(text, e.x, e.y + 0.5);
      this.gizmoHits.push({ view: e.view, x: e.x, y: e.y, w, h });
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(c, c, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }

  /** W A S D Q E: along the view, sideways, and straight down or up, faster further out. */
  private fly(seconds: number): boolean {
    if (this.keys.size === 0) return false;
    const toTarget = this.controls.target.clone().sub(this.camera.position);
    const distance = toTarget.length();
    const forward = toTarget.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const has = (code: string) => (this.keys.has(code) ? 1 : 0);
    const boost = this.boost ? 3 : 1;
    const ahead = has("KeyW") - has("KeyS");
    // In orthographic, moving along the view changes nothing on screen, so W and S zoom.
    if (this.ortho && ahead) {
      const d = THREE.MathUtils.clamp(distance * Math.exp(-ahead * 0.8 * boost * seconds), this.controls.minDistance, this.controls.maxDistance);
      this.camera.position.copy(this.controls.target).addScaledVector(forward, -d);
    }
    const move = right.multiplyScalar(has("KeyD") - has("KeyA")).add(new THREE.Vector3(0, has("KeyE") - has("KeyQ"), 0));
    if (!this.ortho) move.addScaledVector(forward, ahead);
    if (move.lengthSq() === 0) return true;
    move.normalize().multiplyScalar(Math.max(0.15, distance * 0.8) * boost * seconds);
    this.camera.position.add(move);
    this.controls.target.add(move);
    return true;
  }

  private onLeave = () => {
    window.clearTimeout(this.hoverTimer);
    this.setHovered(null);
    this.events.onHover(null);
  };

  private fit() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  /** Draws the next frame, and keeps drawing while the camera glides. */
  request(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    let busy = false;
    const seconds = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    if (this.fly(seconds)) busy = true;
    const tw = this.tween;
    if (tw) {
      const t = Math.min(1, (now - tw.start) / tw.ms);
      const e = 1 - (1 - t) ** 3;
      this.controls.target.lerpVectors(tw.from[0], tw.to[0], e);
      // The camera swings around what it looks at (a turn to the back goes round the side,
      // not through the body), and moves closer or further on the way.
      const a = tw.from[1].clone().sub(tw.from[0]);
      const b = tw.to[1].clone().sub(tw.to[0]);
      const ua = a.clone().normalize();
      const ub = b.clone().normalize();
      const turn = ua.dot(ub) < -0.999
        ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
        : new THREE.Quaternion().setFromUnitVectors(ua, ub);
      const dir = ua.applyQuaternion(new THREE.Quaternion().slerp(turn, e));
      this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(THREE.MathUtils.lerp(a.length(), b.length(), e)));
      if (t >= 1) this.tween = null;
      busy = true;
    }
    // update() reports whether damping is still moving the camera.
    if (this.controls.update()) busy = true;
    this.renderer.render(this.scene, this.drawn());
    this.placeLabels();
    this.drawGizmo();
    const side = sideFacing(this.camera.position.clone().sub(this.controls.target));
    if (side !== this.side) {
      this.side = side;
      this.events.onView?.(side);
    }
    if (busy) this.frame = requestAnimationFrame(this.tick);
    else {
      this.running = false;
      this.lastFrame = 0;
    }
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.hoverTimer);
    this.resize.disconnect();
    this.controls.dispose();
    this.attachGizmo(null);
    this.host.removeEventListener("wheel", this.onOrthoWheel, true);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    for (const group of this.selection.values()) this.dropOverlay(group);
    this.dropOverlay(this.hoverOverlay);
    for (const g of this.systems.values()) for (const c of g.children) if ((c as THREE.BatchedMesh).isBatchedMesh) (c as THREE.BatchedMesh).dispose();
    for (const m of this.materials.values()) for (const x of [m.base, m.selected, m.hovered]) x.dispose();
    this.clearMarkers();
    for (const line of this.grid.children as THREE.Line[]) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}
