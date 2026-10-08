# 3D anatomy atlas

The `/atlas` page is a 3D model of the whole body. You can turn it, take it
apart by body system, click any structure to name it and read about it, and
see where each muscle attaches. The models come from
[Z-Anatomy](https://www.z-anatomy.com/), converted for the web by
`scripts/atlas/`.

## Licence

The atlas files in `public/atlas/` (the `.glb.gz` models, `atlas.json`,
`latin.json` and `descriptions.json`) are **not** under the app's MIT
licence. They are a derivative of Z-Anatomy and are shared under
**CC BY-SA 4.0**.

- Z-Anatomy is built on BodyParts3D (CC BY-SA 2.1 Japan).
- Its descriptions follow Wikipedia (CC BY-SA).
- A few parts it includes are non-commercial: the inner ear (CC BY-NC-SA 4.0)
  and the kidney (CC BY-NC 4.0). So the atlas must not be used commercially.

`public/atlas/LICENSE.txt` gives the full credits. The page shows a credit
line that links to it. Keep both whenever the files change.

## What's in it

| Layer | File | Size | Triangles | Structures |
| --- | --- | ---: | ---: | ---: |
| Skeleton | `skeletal.glb.gz` | 1.4 MB | 328k | 159 |
| Joints and ligaments | `joints.glb.gz` | 0.7 MB | 168k | 236 |
| Muscles (with fasciae, tendons, bursae) | `muscular.glb.gz` | 4.0 MB | 959k | 344 |
| Heart and vessels | `cardiovascular.glb.gz` | 2.6 MB | 692k | 420 |
| Nervous system | `nervous.glb.gz` | 2.9 MB | 832k | 317 |
| Organs | `visceral.glb.gz` | 1.4 MB | 410k | 101 |
| Lymphatic system | `lymphatic.glb.gz` | 0.2 MB | 89k | 110 |
| Skin and regions | `regions.glb.gz` | 0.4 MB | 73k | 129 |
| Planes and directions | `references.glb.gz` | 0.02 MB | 3k | 39 |
| Muscle attachment areas | `attachments.glb.gz` | 1.3 MB | 314k | 705 areas |

The structure counts treat left and right as one structure. On top of the
models:

- 786 bony landmarks (points on the bones, such as the "Greater trochanter");
- 705 muscle origin and insertion areas, drawn on the bones;
- descriptions of about 1,340 structures (about 72%).

It covers gross anatomy only. There is no histology and no embryology.

Each layer loads only when it is first switched on. The page opens with the
skeleton alone (1.4 MB); all of it is about 15 MB. The service worker keeps
each model once it has been downloaded (cache-first, versioned by file size),
so the atlas works offline after that.

### Download size

The models are gzipped files (`.glb.gz`). Vercel compresses only some file
types, and `.glb` isn't one of them, but meshopt's output shrinks by about a
third more with gzip. So the files are stored gzipped, and the viewer unzips
them with the browser's `DecompressionStream`. If a server unzips the file on
the way (as `vite preview` does, by sending `Content-Encoding: gzip`), the
viewer sees a plain glTF and uses it as it is. `vercel.json` gives the files a
year-long `immutable` cache, since their URLs change with every new model.

### Drawing

Each system is drawn as a few `THREE.BatchedMesh`es, one per colour, instead
of one mesh per structure. With everything on, that is roughly 150 draw calls
instead of about 5,000, so turning the body stays smooth on phones.

- A structure can be several pieces: a bone and its cartilage, for example,
  each with its own material. Hiding, isolating, the group chips and the
  highlight all act on every piece of a structure.
- The left side is the right side mirrored (a negative scale). three.js only
  corrects the lighting of mirrored objects, not of mirrored instances in a
  batch, so mirrored pieces go in batches of their own, with the mirror on the
  batch itself.
- The selected and hovered structures are drawn on their own, with a green
  glow, over a gap left in their batch. These overlays draw straight from the
  batch's buffers, so nothing is copied.
- Turning with the buttons, the arrow keys or the views swings the camera
  around the point it looks at (a slerp of its direction), so a turn to the
  back goes around the side rather than through the body. Taking hold of the
  model (a drag or the wheel) stops a glide under way.
- With **Turn around the part you click** on (the default; kept in the
  `atlas` setting with the recently opened structures), a click
  slides the view so the part becomes the point the camera turns around,
  without zooming.
- **Navigation** follows the knowledge map's 3D view (`Graph3D`), itself
  modelled on a 3D editor's viewport. OrbitControls handles the pointer:
  drag orbits, right-, middle- or Shift-drag pans, the wheel zooms toward
  the pointer, and touch is as before. The viewer adds W A S D Q E flying
  (`fly`, run each frame at 0.8 × the distance to the target per second,
  three times that with Shift; ignored while typing), perspective or
  orthographic drawing (`setOrthographic`: the perspective camera stays the
  rig the controls move, and an `OrthographicCamera` copies its direction
  each frame, standing 6 m back from the target so zooming in never cuts
  away what lies in front, with a frustum as tall as the perspective
  view's at the target; there the wheel zooms toward the pointer by the
  viewer's own `onOrthoWheel`, W and S zoom instead of moving along the
  view, and the selection outline is sized from the frustum),
  auto-rotate (`setAutoRotate`) and a floor grid (`setGrid`).
- **The axis gizmo** (`attachGizmo`) is a 2D canvas the viewer draws each
  frame from the camera's axes, like the knowledge map's, but its ends are
  named anatomically instead of X, Y and Z: Anterior and Posterior (blue),
  Superior and Inferior (green), Sinistra and Dextra (red). Clicking an end
  calls `view()` with that side. An end pointing at the viewer shrinks to a
  dot, and a gizmo under 120 px uses the short forms (Ant, Post, Sup, Inf,
  Sin, Dx).
- **Selecting**: each selected structure gets the tinted overlay, an outline
  (its back faces pushed out along their normals, a constant width on
  screen) and an x-ray copy drawn with `depthFunc = GreaterDepth`, so it
  shows only where something nearer covers it. `pickStack` returns every
  structure under the pointer, nearest opaque one first; clicking the same
  place again selects the next one down, and the page lists the stack as
  "At this spot". Ctrl/⌘/Shift+click adds to the selection (`select(primary,
  also)`), which "Only these" and "Hide these" act on.
- The models are unpacked in Web Workers (`MeshoptDecoder.useWorkers`), so
  the page doesn't stall while a system loads.

## Files

| Path | What it is |
| --- | --- |
| `public/atlas/*.glb.gz` | One model per layer: glTF with meshopt compression, gzipped. The node names are the structure names. |
| `public/atlas/atlas.json` | The index: layers, the group path of every structure, landmarks and attachments |
| `public/atlas/latin.json` | The Latin name of each structure, group and landmark (about 2,900 of 3,000), loaded with the index |
| `public/atlas/descriptions.json` | Short descriptions by structure name, loaded when the first structure is opened |
| `src/lib/atlas/model.ts` | The index types, name parsing, search, tissue colours, groups and attachments; tested in `model.test.ts` |
| `src/components/atlas/viewer.ts` | `AtlasViewer`: three.js scene, downloading and unzipping, batching, picking, highlighting and hover, camera tweening, hiding and isolating, landmark markers |
| `src/pages/Atlas.tsx` | The page, in the knowledge map's workspace (ribbon, explorer, 3D pane, note pane, status bar): layers, search, the note, the URL state |
| `src/styles/atlas.css` | Its styles, on top of the workspace's own in `map.css` |
| `scripts/atlas/` | The conversion (below) |

three.js is the page's only new dependency. Vite puts it in its own `three`
chunk (about 166 KB gzipped), which only `/atlas` loads.

### Names

The models' node names follow Z-Anatomy's own naming:

- `.r` and `.l` mark the right and left side: `Parietal bone.r`.
- A name in brackets, such as `(Accessory pancreas)`, is an optional or
  variant structure.
- In the skeleton's source file, `.o…` and `.e…` mark a muscle's origin
  ("origin") and insertion ("end") areas. The converter moves them to
  `attachments.glb` and lists them in `atlas.json`.

`parseNode` turns a node name into a display name and a side.
`descriptionKey` gives the key a structure's description is filed under.

### Anatomical names

The page writes names the way anatomy is taught, adding to the English and
never replacing it:

- **Sides** are *dextra* and *sinistra* (`sideLabel`), with the English in a
  tooltip; the short form in lists is "dx" or "sin".
- **Latin names** come from Z-Anatomy's translation table, built into
  `latin.json` by `scripts/atlas/latin.mjs`. Under a structure's English name
  the page shows its Latin name with the side agreeing with the head noun
  (`latinWithSide`): *ren dexter*, *scapula dextra*, *os femoris dextrum*,
  *musculi rotatores sinistri*. The gender comes from the noun's ending, with
  a list of exceptions (*ren*, *pulmo* and *tendo* are masculine; *cartilago*
  and *manus* feminine; *femur*, *caput* and *chiasma* neuter). Names that
  already carry a side, such as *atrium dextrum*, are left alone.
- **Greek roots** (`greekRoot`) follow the Latin for the organs and tissues
  whose clinical terms come from Greek: kidney *nephros* (nephritis), lung
  *pneumon*, heart *kardia*, joint *arthron*, vertebra *spondylos*, vein
  *phleps*, gland *aden*, and so on.
- **Views** are anterior, posterior, sinistra, dextra and superior, and the
  label on the model names the side facing you in the same terms.
- **Search** matches the Latin as well: "os femoris" or "ren" finds the femur
  or the kidney.

three.js changes some characters in node names when it loads a file. The
viewer therefore reads the original names from the glTF JSON (through
`parser.associations`).

### Colours

The source files carry no colours of their own. The viewer colours each mesh
from its material's name with `tissueColor`, for example:

- bone, cartilage, ligament, tendon;
- arteries red and veins blue, with the pulmonary vessels the other way round;
- nerves yellow;
- origin areas red and insertion areas blue.

Muscles get a slightly different red for each material group, so that
neighbouring muscles can be told apart.

### The page's URL

| Parameter | Meaning |
| --- | --- |
| `layers` | The layers on show, comma-separated (default `skeletal`) |
| `s` | The selected structure, as `layer/node name` |

A link to `/atlas?s=muscular/Deltoid%20muscle.r` opens on that muscle, with
the muscles shown.

## Rebuilding the models

`scripts/atlas/build.sh` repeats the whole conversion. It needs git, Node and
Python 3.11, downloads about 1 GB, and writes the results into
`public/atlas/`. Its work folder is `scripts/atlas/work/`, which git ignores.

```sh
scripts/atlas/build.sh
```

The steps:

1. **Fetch.** A blob-less, sparse clone of Z-Anatomy's `PC-Version` branch,
   with only `Resources/Models/FBX` and
   `Resources/Descriptions/OriginalDescriptions`.
2. **Convert** (`convert.py`), run once per FBX file with Blender 4.2 as a
   Python module (`bpy`). It sorts the objects into four kinds:
   - structures, which are kept;
   - label markers (`.j`, `.i`), which are dropped;
   - landmark empties (`.t`), which become points;
   - attachment areas (`.o…`, `.e…`), which go to their own file.

   It then bakes every structure's world transform and writes
   `raw/<layer>.glb` and `raw/<layer>.json`. The JSON holds the structures with
   their group paths, the landmarks and the attachments.
3. **Pack** (`pack.mjs`), with glTF-Transform and meshoptimizer:
   - removes duplicate accessors and meshes (not materials: their names are
     what the app colours by);
   - welds vertices;
   - simplifies to at most half the triangles (error 0.0005);
   - prunes;
   - quantizes positions to 14 bits and normals to 8;
   - compresses with `EXT_meshopt_compression`.
4. **Index** (`index.mjs`): gzips each packed model to `web/<layer>.glb.gz`
   and writes `web/atlas.json` from the metadata and the packed files. It
   lists the layers, their sizes and triangle counts. Group paths are stored
   once and referred to by number.
5. **Latin** (`latin.mjs`): writes `web/latin.json`, the Latin name of every
   structure, group and landmark the index lists, from Z-Anatomy's
   `Translations.txt`.
6. **Describe** (`descs.py`): writes `web/descriptions.json`, which holds the
   first paragraphs of each structure's description, cleaned of leftovers
   from Wikipedia.

To change the level of detail, change `0.5` (the ratio of triangles to keep)
in `build.sh`. A new model has a new size, so its URL (`?v=<bytes>`) changes
and devices download it again.

Afterwards, run `npx vitest run src/lib/atlas`. It checks that the shipped
index has a model file for every layer.

## Privacy and search

The atlas holds no personal data and no course material.
`src/prerender/site.ts` writes a static `/atlas` page listing the layers, and
`/atlas` is in the sitemap. The structures themselves are not added to the
app's search; the page has its own search. Its "Find in your notes" link opens
the app's search for the structure's name.
