#!/usr/bin/env bash
# Rebuilds the 3D anatomy atlas (public/atlas/) from Z-Anatomy. See docs/atlas-3d.md.
# Needs git, Node, and Python 3.11 (for bpy, Blender as a Python module). Downloads about 1 GB.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$here/work"
mkdir -p "$work/raw" "$work/web"
cd "$work"

# 1. Z-Anatomy's FBX models and descriptions (blob-less, only the folders we use).
if [ ! -d zanat ]; then
  git clone --filter=blob:none --no-checkout --depth 1 -b PC-Version https://github.com/LluisV/Z-Anatomy zanat
  git -C zanat sparse-checkout set --no-cone Resources/Models/FBX Resources/Descriptions/OriginalDescriptions
  git -C zanat checkout PC-Version
fi

# 2. Blender as a Python module.
if [ ! -x bpyenv/bin/python ]; then
  python3.11 -m venv bpyenv
  bpyenv/bin/pip install -q bpy==4.2.0
fi
(cd "$here" && npm install --no-audit --no-fund --silent)

# 3. FBX → raw glb + metadata, one per body system (the skeleton also gives attachments.glb).
fbx=zanat/Resources/Models/FBX
for pair in SkeletalSystem100:skeletal Joints100:joints MuscularSystem100:muscular \
  CardioVascular41:cardiovascular NervousSystem100:nervous VisceralSystem100:visceral \
  LymphoidOrgans100:lymphatic "Regions of human body100:regions" References100:references; do
  bpyenv/bin/python "$here/convert.py" -- "$fbx/${pair%%:*}.fbx" "${pair##*:}" raw
done

# 4. Simplify and compress, then the index and descriptions.
for f in raw/*.glb; do node "$here/pack.mjs" "$f" "web/$(basename "$f")" 0.5 0.0005; done
node "$here/index.mjs"
node "$here/latin.mjs"
python3 "$here/descs.py"

cp web/*.glb.gz web/atlas.json web/latin.json web/descriptions.json "$here/../../public/atlas/"
echo "public/atlas/ updated"
