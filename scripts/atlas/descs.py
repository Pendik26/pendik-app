# Z-Anatomy's structure descriptions (after Wikipedia), cut to their first paragraphs, as
# web/descriptions.json: { "Deltoid muscle": "The deltoid muscle is…" }.
import json, os, re, glob
# Run from the work folder (see build.sh): zanat/ is the Z-Anatomy checkout, raw/ the converter's output.
D = "zanat/Resources/Descriptions/OriginalDescriptions"
files = {f[:-4]: f for f in os.listdir(D) if f.endswith(".txt") and not f.endswith("-labels.txt")}
lower = {k.lower(): k for k in files}
def summary(text, limit=700):
    lines = [l.strip() for l in text.replace("\r", "").split("\n")]
    paras, cur = [], []
    for l in lines:
        if not l:
            if cur: paras.append(" ".join(cur)); cur = []
            continue
        if re.match(r"^=+.*=+$", l): break          # stop at the first section heading
        if l.isupper() and len(paras) == 0 and not cur: continue   # the TITLE line
        if l.startswith("-") and cur:                  # a list item starts its own line
            paras.append(" ".join(cur)); cur = []
        cur.append(l)
    if cur: paras.append(" ".join(cur))
    paras = [re.sub(r"\s+", " ", p).strip() for p in paras if len(p) > 1]
    # Wikipedia leftovers: emptied brackets "( )", "(, pl. x)", spaces before commas.
    tidy = lambda p: re.sub(r"\s+([,.;:)])", r"\1", re.sub(r"\(\s*\)", "", re.sub(r"\(\s*[,;]\s*", "(", p))).replace("  ", " ").strip()
    paras = [tidy(p) for p in paras]
    out = ""
    for p in paras:
        p = re.sub(r"^-\s*", "• ", p)
        if out and len(out) + len(p) > limit: break
        out = (out + "\n\n" + p).strip()
    if len(out) > limit + 200:
        cut = out[: limit]
        out = cut[: cut.rfind(". ") + 1] if ". " in cut else cut + "…"
    return out
names = set()
for f in glob.glob("raw/*.json"):
    j = json.load(open(f))
    names |= {s["name"] for s in j["structures"]}
    names |= {g for s in j["structures"] for g in s["groups"]}
    names |= {l["name"] for l in j["landmarks"]}
hit = {}
for n in sorted(names):
    key = files.get(n) and n or lower.get(n.lower()) or lower.get(re.sub(r"^\(|\)$", "", n).lower())
    if key:
        txt = summary(open(os.path.join(D, files[key]), encoding="utf-8", errors="replace").read())
        if len(txt) > 30: hit[n] = txt
structs = set()
for f in glob.glob("raw/*.json"):
    structs |= {s["name"] for s in json.load(open(f))["structures"]}
print("names", len(names), "described", len(hit), "| structures", len(structs), "described", len(structs & set(hit)))
json.dump(hit, open("web/descriptions.json", "w"), ensure_ascii=False, separators=(",", ":"))
