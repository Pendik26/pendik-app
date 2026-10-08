# One Z-Anatomy FBX → raw .glb (structures only, world transforms baked, names kept) + metadata.
import bpy, sys, re, json, os
args = sys.argv[sys.argv.index("--") + 1:]
src, system, out = args[0], args[1], args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
objs = list(bpy.context.scene.objects)

def clean(n):
    return re.sub(r"\.\d{3}$", "", n)
def kind(o):
    n = clean(o.name)
    if o.type == "EMPTY":
        m = re.search(r"\.([a-z])$", n)
        return "empty." + (m.group(1) if m else "-")
    if o.type != "MESH": return "other"
    if re.search(r"\.(o|e)\d*[rl]?$", n): return "attach"
    if re.search(r"\.[ji]$", n): return "marker"
    if re.search(r"\.[rl]$", n) or not re.search(r"\.[a-z0-9]+$", n): return "structure"
    return "other"
def display(n):
    n = clean(n)
    n = re.sub(r"\.(g|t|s|j|i)$", "", n)
    return re.sub(r"\.[rl]$", "", n)
def side(n):
    m = re.search(r"\.([rl])$", clean(n))
    return m.group(1) if m else None
def groups_of(o):
    out_ = []
    p = o.parent
    while p:
        if kind(p) == "empty.g": out_.append(display(p.name))
        p = p.parent
    return list(reversed(out_))
def yup(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]

structures, landmarks, attachments = [], [], []
for o in objs:
    k = kind(o)
    if k == "structure":
        mat = next((s.material.name for s in o.material_slots if s.material), "")
        structures.append({"node": o.name, "name": display(o.name), "side": side(o.name), "material": re.sub(r"\.\d{3}$", "", mat), "groups": groups_of(o)})
    elif k == "attach":
        mat = next((s.material.name for s in o.material_slots if s.material), "")
        m = re.match(r"(.*)\.(o|e)\d*([rl]?)$", clean(o.name))
        attachments.append({"node": o.name, "muscle": m.group(1), "type": "origin" if m.group(2) == "o" else "insertion", "side": m.group(3) or None, "material": re.sub(r"\.\d{3}$", "", mat)})
    elif k == "empty.t":
        par = o.parent
        while par and kind(par) not in ("structure",):
            par = par.parent
        landmarks.append({"name": display(o.name), "at": yup(o.matrix_world.translation), "on": par.name if par else None})

def export(names, path):
    bpy.ops.object.select_all(action="DESELECT")
    keep = set(names)
    for o in objs:
        if o.name in keep:
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False, export_normals=True, export_materials="EXPORT", export_vertex_color="NONE",
                              export_animations=False, export_skins=False, export_morph=False, export_extras=False, export_cameras=False, export_lights=False)

# Unparent so each node carries its world transform (the groups live in the metadata instead).
for o in objs:
    if o.parent:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
export([s["node"] for s in structures], f"{out}/{system}.glb")
if attachments:
    export([a["node"] for a in attachments], f"{out}/attachments.glb")
json.dump({"system": system, "structures": structures, "landmarks": landmarks, "attachments": attachments}, open(f"{out}/{system}.json", "w"))
print("DONE", system, len(structures), "structures", len(landmarks), "landmarks", len(attachments), "attachments")
