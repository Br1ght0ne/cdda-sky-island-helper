#!/usr/bin/env python3
"""
Extract Sky Island mod upgrade data into loadable data files for the web app.

Outputs (both regenerated from the mod source, never hand-edited):
  - data.json : canonical, pretty-printed, diffable extract (the source of truth)
  - data.js   : `window.SKYISLAND_DATA = <same JSON>;` so the app can load it
                straight from a file:// path (fetch() is blocked there).

An "upgrade" in the mod is three linked JSON objects, joined on the key item id
(mission.item == item.id == recipe.result):
  - mission_definition : the upgrade's name + flavour/effect description
  - ITEM (upgrade key) : the "Proof of..." style artifact you craft
  - recipe             : the components / qualities / tools you must gather

Names, plurals and descriptions are resolved from the base CDDA data plus the
mod's own definitions. `LIST` components reference `requirement` objects, which
are expanded recursively (counts multiply) so the UI can show a tooltip like
cordage -> "1 long string OR 1 long cordage piece OR ... OR 6 short strings".
Anything unresolved falls back to a prettified id.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
CDDA = os.environ.get("CDDA_PATH")
if not CDDA:
    sys.exit("CDDA_PATH is not set. Point it at your Cataclysm-DDA checkout "
             "(this repo defines it in the gitignored mise.local.toml).")
CDDA = os.path.expanduser(CDDA)
MOD = os.path.join(CDDA, "data/mods/Sky_Island")
BASE = os.path.join(CDDA, "data/json")

# Files that define upgrades, mapped to (group, category). Order matters for display.
UPGRADE_FILES = [
    ("missions/island_upgrades/rankup.json",      "Progression",         "Island Rank Up"),
    ("missions/island_upgrades/misc.json",        "Island Upgrades",     "Miscellaneous"),
    ("missions/security_container.json",          "Island Upgrades",     "Security"),
    ("missions/warped_harness.json",               "Island Upgrades",    "Warped Harness"),
    ("missions/island_upgrades/center_rooms.json","Island Construction", "Central Rooms"),
    ("missions/island_upgrades/greenhouse.json",  "Island Construction", "Greenhouse"),
    ("missions/island_upgrades/west_rooms.json",  "Island Construction", "West Wing"),
    ("missions/island_upgrades/north_rooms.json", "Island Construction", "North Wing"),
    ("missions/island_upgrades/east_rooms.json",  "Island Construction", "East Wing"),
    ("missions/island_upgrades/merchants.json",   "Island Construction", "Merchants"),
    ("missions/raid_upgrades/landing.json",       "Raid Upgrades",       "Landing"),
    ("missions/raid_upgrades/scouting.json",      "Raid Upgrades",       "Scouting"),
    ("missions/raid_upgrades/stability.json",     "Raid Upgrades",       "Stability"),
    ("missions/raid_upgrades/length.json",        "Raid Upgrades",       "Raid Length"),
    ("missions/raid_upgrades/missions.json",      "Raid Upgrades",       "Missions & Exits"),
    ("missions/raid_upgrades/exits.json",         "Raid Upgrades",       "Missions & Exits"),
    ("missions/raid_upgrades/starts.json",        "Raid Unlocks",        "Start Locations"),
    ("missions/raid_upgrades/challenge.json",     "Raid Unlocks",        "Challenge Mode"),
]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.loads(f.read())


def iter_json_objects(root):
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            try:
                data = load_json(os.path.join(dirpath, fn))
            except Exception:
                continue
            for o in (data if isinstance(data, list) else [data]):
                if isinstance(o, dict):
                    yield o


def norm_name(name):
    """Return (singular, plural). Mirrors CDDA: an explicit str_pl wins, str_sp
    means the plural is identical, otherwise the default plural is str + 's'."""
    if isinstance(name, str):
        return name, name + "s"
    if isinstance(name, dict):
        s = name.get("str") or name.get("str_sp") or name.get("str_pl")
        if name.get("str_pl"):
            p = name["str_pl"]
        elif name.get("str_sp"):
            p = name["str_sp"]
        elif s:
            p = s + "s"
        else:
            p = s
        return s, p
    return None, None


# ---------------------------------------------------------------------------
# Index: id -> {n: name, p: plural}, requirement bodies for LIST expansion,
# copy-from parents, per-id tool qualities, and the set of concrete item ids.
# ---------------------------------------------------------------------------
def build_index():
    idx = {"names": {}, "reqs": {}, "parents": {}, "own_qual": {}, "concrete": set()}
    for o in iter_json_objects(BASE):
        _register(o, idx)
    for o in iter_json_objects(MOD):
        _register(o, idx)
    # Resolve copy-from inheritance for entries still missing a name.
    names, parents = idx["names"], idx["parents"]
    for cid, parent in list(parents.items()):
        if cid in names:
            continue
        seen, p = set(), parent
        while p and p not in seen and p not in names:
            seen.add(p)
            p = parents.get(p)
        if p in names:
            names[cid] = names[p]
    return idx


def _register(o, idx):
    ids = []
    for key in ("id", "abstract", "result"):
        v = o.get(key)
        if isinstance(v, str):
            ids.append(v)
        elif isinstance(v, list):
            ids.extend(x for x in v if isinstance(x, str))
    if not ids:
        return
    if isinstance(o.get("id"), str):
        idx["concrete"].add(o["id"])
    if o.get("type") == "requirement" and isinstance(o.get("components"), list):
        for i in ids:
            idx["reqs"].setdefault(i, o["components"])
    n, p = norm_name(o.get("name"))
    cf = o.get("copy-from")
    for i in ids:
        if n and i not in idx["names"]:
            idx["names"][i] = {"n": n, "p": p}
        if isinstance(cf, str) and i not in idx["parents"]:
            idx["parents"][i] = cf
    # Tool qualities an item confers (static + charge-gated, incl. copy-from extend).
    quals = []
    for key in ("qualities", "charged_qualities"):
        v = o.get(key)
        if isinstance(v, list):
            quals += v
        ext = o.get("extend")
        if isinstance(ext, dict) and isinstance(ext.get(key), list):
            quals += ext[key]
    if quals:
        for i in ids:
            d = idx["own_qual"].setdefault(i, {})
            for pair in quals:
                if isinstance(pair, list) and len(pair) >= 2 and isinstance(pair[0], str):
                    d[pair[0]] = max(d.get(pair[0], 0), pair[1])


def prettify(item_id):
    return re.sub(r"[_-]+", " ", str(item_id)).strip().title()


def name_of(item_id, idx):
    e = idx["names"].get(item_id)
    return e["n"] if e else prettify(item_id)


def label_for(item_id, count, idx):
    """'<count> <singular|plural>' using the real plural form."""
    e = idx["names"].get(item_id)
    if e:
        word = e["n"] if count == 1 else e["p"]
    else:
        word = prettify(item_id)
    return f"{count} {word}"


def expand_requirement(req_id, mult, idx, seen=None):
    """Recursively flatten a `requirement` into leaf [id,count] items,
    multiplying counts through nested LIST references. Returns None if req_id
    is not a known requirement."""
    comps = idx["reqs"].get(req_id)
    if comps is None:
        return None
    seen = (seen or set()) | {req_id}
    leaves = []
    for group in comps:
        for alt in group:
            if not isinstance(alt, list) or len(alt) < 2:
                continue
            iid, cnt = alt[0], alt[1]
            is_list = len(alt) >= 3 and alt[2] == "LIST"
            if is_list and iid not in seen:
                sub = expand_requirement(iid, mult * cnt, idx, seen)
                if sub:
                    leaves.extend(sub)
                    continue
            leaves.append({"id": iid, "count": mult * cnt})
    return leaves


def list_expansion(req_id, idx):
    """Structured expansion for tooltips: [{id, label}], so the app can render
    each option as a link to the CDDA Guide."""
    exp = expand_requirement(req_id, 1, idx)
    if not exp:
        return None
    return [{"id": e["id"], "label": label_for(e["id"], e["count"], idx)} for e in exp]


def build_quality_index(idx, ql_pairs, sample=3):
    """For each required (quality, level), find every concrete item that confers
    that quality at >= the level (following copy-from), and return a few example
    names plus a total count. Keyed 'QUALITY::level'."""
    parents, own_qual, concrete, names = idx["parents"], idx["own_qual"], idx["concrete"], idx["names"]
    memo = {}

    def eff(i, stack=()):
        if i in memo:
            return memo[i]
        res = {}
        p = parents.get(i)
        if p and p not in stack:
            res.update(eff(p, stack + (i,)))
        for q, lvl in own_qual.get(i, {}).items():
            if lvl > res.get(q, -1):
                res[q] = lvl
        memo[i] = res
        return res

    qmap = {}  # quality -> [(level, name, id)]
    for i in concrete:
        if "fake" in i:
            continue
        e = eff(i)
        if not e:
            continue
        entry = names.get(i)
        if not entry:
            continue
        for q, lvl in e.items():
            qmap.setdefault(q, []).append((lvl, entry["n"], i))

    out = {}
    for q, level in ql_pairs:
        sat = sorted((t for t in qmap.get(q, []) if t[0] >= level), key=lambda t: (t[0], t[1].lower()))
        out[f"{q}::{level}"] = {
            "examples": [{"id": i, "name": nm} for (_lvl, nm, i) in sat[:sample]],
            "total": len(sat),
        }
    return out


def parse_components(comps, idx):
    out = []
    for group in comps or []:
        alts = []
        for alt in group:
            if not isinstance(alt, list) or len(alt) < 2:
                continue
            iid, count = alt[0], alt[1]
            is_list = len(alt) >= 3 and alt[2] == "LIST"
            entry = {
                "id": iid,
                "count": count,
                "name": name_of(iid, idx) + (" (any)" if is_list else ""),
                "list": is_list,
            }
            if is_list:  # only item-group / requirement pseudo-items get a tooltip
                exp = list_expansion(iid, idx)
                if exp:
                    entry["expand"] = exp                      # structured, for links
                    entry["tip"] = " OR ".join(e["label"] for e in exp)  # plain fallback
            alts.append(entry)
        if alts:
            out.append(alts)
    return out


def parse_qualities(quals, idx):
    out = []
    for q in quals or []:
        qid = q.get("id")
        out.append({"id": qid, "level": q.get("level", 1), "name": name_of(qid, idx)})
    return out


def parse_tools(tools, idx):
    out = []
    for group in tools or []:
        for alt in group:
            if not isinstance(alt, list):
                continue
            iid = alt[0]
            if iid == "fakeitem_statue":
                continue  # the Heart of the Island itself; always available
            out.append({"id": iid, "name": name_of(iid, idx)})
    return out


def extract_effect(desc):
    if not desc:
        return ""
    for marker in ("EFFECT:", "New Structure:"):
        idx = desc.find(marker)
        if idx != -1:
            return desc[idx:].replace("\n", " ").strip()
    return desc.split("\n")[-1].strip()


RECIPE_CATEGORY = {
    "CSC_WARP_TOOLS": "Warp Tools",
    "CSC_WARP_GEAR": "Warp Gear",
    "CSC_WARP_UPGRADES": "Warp Upgrades",
}


def parse_repeatable_crafts(idx):
    """Emit one upgrade-shaped object per Sky-Island recipe whose result has no
    mission_definition. Joined recipe.result == ITEM.id, same component/quality/
    tool parsers as mission upgrades. id is prefixed `craft:` so it can never
    collide with a mission upgrade id."""
    recipes_path = os.path.join(MOD, "recipes.json")
    if not os.path.exists(recipes_path):
        return []
    recipes = {}
    items = {}
    for o in load_json(recipes_path):
        if isinstance(o, dict) and o.get("type") == "recipe" and isinstance(o.get("result"), str):
            recipes[o["result"]] = o
    # Item definitions come from the mod's items.json (joined by id).
    items_path = os.path.join(MOD, "items.json")
    if os.path.exists(items_path):
        for o in load_json(items_path):
            if isinstance(o, dict) and isinstance(o.get("id"), str):
                items[o["id"]] = o
    out = []
    for result, r in recipes.items():
        it = items.get(result)
        if not it:
            continue  # not a Sky-Island ITEM (e.g. a base-game recipe result)
        desc = it.get("description", "")
        out.append({
            "id": "craft:" + result,
            "repeatable": True,
            "key_item": result,
            "name": norm_name(it.get("name"))[0] if it.get("name") else prettify(result),
            "key_name": norm_name(it.get("name"))[0] if it.get("name") else prettify(result),
            "group": "Repeatable Crafts",
            "category": RECIPE_CATEGORY.get(r.get("subcategory", ""), "Warp Items"),
            "effect": extract_effect(desc),
            "description": desc,
            "components": parse_components(r.get("components"), idx),
            "qualities": parse_qualities(r.get("qualities"), idx),
            "tools": parse_tools(r.get("tools"), idx),
        })
    return out


def main():
    idx = build_index()
    upgrades = []
    for rel, group, category in UPGRADE_FILES:
        data = load_json(os.path.join(MOD, rel))
        missions, items, recipes, order = {}, {}, {}, []
        for o in data:
            t = o.get("type")
            if t == "mission_definition":
                missions[o["item"]] = o
                order.append(o["item"])
            elif t == "recipe":
                recipes[o["result"]] = o
            elif t in ("ITEM", "GENERIC", "item"):
                items[o["id"]] = o
        for key in order:
            m = missions.get(key)
            if not m:
                continue
            r = recipes.get(key)
            it = items.get(key)
            upgrades.append({
                "id": m["id"],
                "repeatable": False,
                "key_item": key,
                "name": m.get("name", key),
                "key_name": norm_name(it.get("name"))[0] if it else prettify(key),
                "group": group,
                "category": category,
                "effect": extract_effect(m.get("description", "")),
                "description": m.get("description", ""),
                "components": parse_components(r.get("components"), idx) if r else [],
                "qualities": parse_qualities(r.get("qualities"), idx) if r else [],
                "tools": parse_tools(r.get("tools"), idx) if r else [],
            })

    upgrades.extend(parse_repeatable_crafts(idx))

    # Example items that satisfy each required tool quality, from the game source.
    ql_pairs = {(q["id"], q["level"]) for u in upgrades for q in u["qualities"]}
    quality_items = build_quality_index(idx, ql_pairs)

    payload = {
        "generated_from": "CleverRaven/cataclysm-dda data/mods/Sky_Island",
        "guide_base": "https://cdda-guide.nornagon.net",
        "count": len(upgrades),
        "upgrades": upgrades,
        "quality_items": quality_items,
    }

    json_path = os.path.join(PROJECT, "data.json")
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")
    except OSError as e:
        sys.exit(f"Could not write {json_path}: {e}")

    js_path = os.path.join(PROJECT, "data.js")
    try:
        with open(js_path, "w", encoding="utf-8") as f:
            f.write("// Auto-generated by build/extract.py from data.json -- do not edit by hand.\n")
            f.write("// Mirrors data.json so the app can load from a file:// path (fetch() is blocked there).\n")
            f.write("window.SKYISLAND_DATA = ")
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")
    except OSError as e:
        sys.exit(f"Could not write {js_path}: {e}")

    print(f"Wrote {len(upgrades)} upgrades to data.json ({os.path.getsize(json_path)//1024} KB) "
          f"and data.js ({os.path.getsize(js_path)//1024} KB)")
    unresolved = {a["id"] for u in upgrades for g in u["components"] for a in g
                  if not a["list"] and a["name"] == prettify(a["id"])}
    if unresolved:
        print(f"  ({len(unresolved)} component ids fell back to prettified names: "
              f"{', '.join(sorted(unresolved))})", file=sys.stderr)


if __name__ == "__main__":
    main()
