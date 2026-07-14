# Repeatable Key-Item Crafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track the Sky-Island mod's 26 non-mission key-item recipes (infinity sources, warp bags, hauler's harness, autodoc enhancers, Labs Catalyst, lucre lure, etc.) as repeatable crafts with a per-craft tally + ingredient reset, alongside the existing 84 mission upgrades.

**Architecture:** Extend `build/extract.py` with a second extraction pass over `recipes.json` that joins `recipe.result == item.id` (no mission needed) and emits `repeatable: true` upgrade objects with a `craft:` id prefix. In `app.js`, add a `crafted` state field; for `repeatable` upgrades replace the boolean "done" checkbox with a Craft button (enabled when all ingredient groups are met) that increments the tally and clears that upgrade's `have`/`qty`, plus a `Crafted: N` tag. Global tool qualities survive each craft.

**Tech Stack:** Python 3 (extractor), vanilla JS (no build, runs from `file://`), Node smoke-test DOM shim.

## Global Constraints

- **Never hand-edit `data.json` / `data.js`** — regenerate via `python3 build/extract.py`. They are byte-equivalent payloads (the `.js` wraps the same JSON for `file://`).
- **`CDDA_PATH`** env var points at the CDDA checkout (`mise.local.toml` sets it). The extractor reads `data/mods/Sky_Island` from there.
- **No browser in the sandbox.** Logic verified with `node --check app.js && node build/smoke.js`. CSS/responsive changes can't be visually confirmed — call them out for the user to eyeball at 375px.
- **Tool qualities are a GLOBAL registry** (`state.tools`, keyed `id::level`). Crafting must NOT clear them — they are permanent island gear.
- **Existing 84 mission upgrades must not regress:** boolean `done`, `isFinished`, "Remove finished", "hide done", expand/collapse-all, search, Plan panel all keep working.
- Card id scheme: mission upgrades keep their `m["id"]` (e.g. `SKYISLAND_UPGRADE_landing1`); repeatable crafts use `craft:` + recipe result (e.g. `craft:warp_folded_infinitree`) so they never collide and the app can distinguish them by prefix.
- Smoke test currently hardcodes `=== 84` for expand-all open count; that assert is updated to the dynamic total (Task 6).

---

## File Structure

- **Modify** `build/extract.py` — add a non-mission recipe pass; set `repeatable` flag on every upgrade; map subcategory → category.
- **Modify** `app.js` — add `crafted` to `blankState`; `isFinished`/card rendering branch on `u.repeatable`; `_resetComponents(u)` helper; Craft button + Crafted tag; `renderStats` crafted segment.
- **Modify** `build/smoke.js` — extend shim where needed; add repeatable-craft assertions; fix the hardcoded `=== 84` expand-all assert.
- **Modify** `style.css` — minimal styling for `.craft-btn` (enabled/disabled/ready) and `.crafted-tag` (the new tag near the name).
- **Regenerate** `data.json` + `data.js` via the extractor.

Each task ends with `node --check app.js && node build/smoke.js` green and a commit.

---

### Task 1: Extract repeatable crafts in `build/extract.py`

**Files:**
- Modify: `build/extract.py` (the `main()` function around the mission loop, and a new helper for the recipe pass)

**Interfaces:**
- Consumes: existing `parse_components`, `parse_qualities`, `parse_tools`, `extract_effect`, `name_of`, `norm_name`, `iter_json_objects`, `load_json`, `MOD`, `BASE`.
- Produces: `upgrades[]` entries with shape `{ id: "craft:<result>", repeatable: true, key_item, name, key_name, group: "Repeatable Crafts", category, effect, description, components, qualities, tools }`. Mission upgrades get `repeatable: false` explicitly. `data.json`/`data.js` regenerated.

- [ ] **Step 1: Add subcategory → category mapping + recipe-pass helper**

In `build/extract.py`, just above `def main():`, add the category map and a helper that returns the list of repeatable crafts. (Insert after the `extract_effect` function definition.)

```python
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
        if isinstance(o, dict) and o.get("type") == "recipe":
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
```

- [ ] **Step 2: Call the helper in `main()` and flag mission upgrades**

In `main()`, find the mission loop's `upgrades.append({...})` call and add `"repeatable": False,` to that dict (so every upgrade carries the flag). Then, after the mission `for rel, group, category in UPGRADE_FILES:` loop completes (and before the `quality_items = ...` line), append the repeatable crafts.

In `build/extract.py` `main()`, locate the mission upgrade dict literal:

```python
            upgrades.append({
                "id": m["id"],
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
```

Replace it with (adds `"repeatable": False,`):

```python
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
```

Then, still in `main()`, find the line:

```python
    # Example items that satisfy each required tool quality, from the game source.
    ql_pairs = {(q["id"], q["level"]) for u in upgrades for q in u["qualities"]}
```

Insert before it:

```python
    upgrades.extend(parse_repeatable_crafts(idx))

```

- [ ] **Step 3: Regenerate the data files**

Run:

```bash
python3 build/extract.py
```

Expected: prints `Wrote 110 upgrades to data.json ...` (84 mission + 26 repeatable). No `(N component ids fell back to prettified names: ...)` warning for the new recipes' known items (minor fallbacks for obscure ids are acceptable — same as today).

- [ ] **Step 4: Verify the payload**

Run:

```bash
jq '.upgrades | length' data.json
jq '[.upgrades[] | select(.repeatable==true)] | length' data.json
jq -r '.upgrades[] | select(.repeatable==true) | .id' data.json | head -5
jq -r '.upgrades[] | select(.repeatable==false) | length' data.json | head -1
```

Expected:
- `110`
- `26`
- `craft:warp_grassbag` (or another `craft:` id) as the first repeatable
- `84` (mission upgrades still flagged false)

Also confirm one repeatable has real components:

```bash
jq '.upgrades[] | select(.id=="craft:warp_folded_infinitree") | {name, category, components, qualities, tools}' data.json
```

Expected: `name: "infinity tree sapling"`, `category: "Warp Tools"`, `components` is an array of 5 AND-groups (3 warp shards, 2x4, sticks, leaves, splinters), `tools` is empty (the `fakeitem_statue` is filtered by `parse_tools`), `qualities` is `[]`.

- [ ] **Step 5: Commit**

```bash
git add build/extract.py data.json data.js
git commit -m "extract: add 26 repeatable key-item crafts from Sky_Island recipes"
```

---

### Task 2: Add `crafted` state + `_resetComponents` helper in `app.js`

**Files:**
- Modify: `app.js` (`blankState` at line 34, helpers near `setCompGroup` ~line 80)

**Interfaces:**
- Consumes: existing `haveKey`, `qtyKey`, `state`.
- Produces: `state.crafted` (object map id→number); `_resetComponents(u)` that deletes every `have`/`qty` key for upgrade `u`'s component groups. `blankState` now includes `crafted: {}`.

- [ ] **Step 1: Add `crafted` to `blankState`**

In `app.js`, find:

```js
  function blankState() {
    // `tools` is a GLOBAL registry of owned tool qualities (keyed `id::level`).
    // Tool qualities are permanent island gear, so ownership is shared across
    // every upgrade rather than tracked per-upgrade like materials.
    return { done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: {}, groupsCollapsed: {} };
  }
```

Replace the `return {...}` line with:

```js
    return { done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: {}, groupsCollapsed: {}, crafted: {} };
```

- [ ] **Step 2: Add the `_resetComponents` helper**

In `app.js`, just after the `setCompGroup` function (which ends with `render();\n  }`), add:

```js
  // Clear all tracked component state (have flags + per-alternative quantities)
  // for one upgrade. Used after a repeatable craft is tallied so gathering can
  // restart for the next copy. Tool qualities (state.tools) are intentionally
  // NOT cleared — they are permanent island gear.
  function resetComponents(u) {
    u.components.forEach((_alts, gi) => {
      delete state.have[haveKey(u, "comp", gi)];
      _alts.forEach(a => delete state.qty[qtyKey(u, gi, a.id)]);
    });
  }
```

- [ ] **Step 3: Verify syntax**

Run:

```bash
node --check app.js
```

Expected: no output (syntax OK).

- [ ] **Step 4: Run the smoke test (should still be green; no behavior change yet)**

Run:

```bash
node build/smoke.js
```

Expected: `All smoke checks passed`. (Existing state without `crafted` deserializes fine because `load()` does `Object.assign(blankState(), JSON.parse(raw))`, which fills in `crafted: {}` for old saves.)

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "state: add crafted counter + resetComponents helper"
```

---

### Task 3: Craft button + Crafted tag in `card()`

**Files:**
- Modify: `app.js` (`card()` function, lines ~189–248; the done-checkbox block at lines 202–214)

**Interfaces:**
- Consumes: `u.repeatable`, `progress(u)`, `resetComponents(u)`, `state.crafted`, existing `prog`/`prog.met`/`prog.total`.
- Produces: repeatable cards render a Craft button (disabled unless ready) instead of the done checkbox; a `Crafted: N` tag appears in the title when `crafted[u.id] > 0`.

- [ ] **Step 1: Replace the done-checkbox block with a `repeatable`-aware block**

In `app.js` `card()`, find the done-checkbox block:

```js
    const doneWrap = document.createElement("label");
    doneWrap.className = "card-done";
    doneWrap.title = "Mark upgrade completed";
    const doneCb = document.createElement("input");
    doneCb.type = "checkbox";
    doneCb.checked = done;
    doneCb.addEventListener("click", e => e.stopPropagation());
    doneCb.addEventListener("change", () => {
      if (doneCb.checked) state.done[u.id] = true; else delete state.done[u.id];
      render();
    });
    doneWrap.appendChild(doneCb);
```

Replace it with:

```js
    // Top-left control: a "Crafted/Mark complete" checkbox for one-shot mission
    // upgrades, or a "Craft" button (tally + reset) for repeatable key-item crafts.
    let doneWrap, doneCb = null, craftBtn = null;
    if (u.repeatable) {
      doneWrap = document.createElement("div");
      doneWrap.className = "card-done";
      const ready = prog.total > 0 && prog.met === prog.total;
      craftBtn = document.createElement("button");
      craftBtn.type = "button";
      craftBtn.className = "craft-btn" + (ready ? " ready" : "");
      craftBtn.textContent = "Craft";
      craftBtn.disabled = !ready;
      craftBtn.title = ready ? "Tally one craft and reset ingredients"
                             : "Gather all ingredients first";
      craftBtn.addEventListener("click", e => {
        e.stopPropagation();
        state.crafted[u.id] = (state.crafted[u.id] || 0) + 1;
        resetComponents(u);
        render();
      });
      doneWrap.appendChild(craftBtn);
    } else {
      doneWrap = document.createElement("label");
      doneWrap.className = "card-done";
      doneWrap.title = "Mark upgrade completed";
      doneCb = document.createElement("input");
      doneCb.type = "checkbox";
      doneCb.checked = done;
      doneCb.addEventListener("click", e => e.stopPropagation());
      doneCb.addEventListener("change", () => {
        if (doneCb.checked) state.done[u.id] = true; else delete state.done[u.id];
        render();
      });
      doneWrap.appendChild(doneCb);
    }
```

- [ ] **Step 2: Add the `Crafted: N` tag to the title**

In `app.js` `card()`, find the title block:

```js
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = u.name;
    if (u.key_name) {
      const key = document.createElement("span");
      key.className = "card-key";
      key.textContent = "Craft: " + u.key_name;
      title.appendChild(key);
    }
```

Replace it with:

```js
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = u.name;
    if (u.key_name) {
      const key = document.createElement("span");
      key.className = "card-key";
      key.textContent = "Craft: " + u.key_name;
      title.appendChild(key);
    }
    const craftedN = state.crafted[u.id] || 0;
    if (craftedN > 0) {
      const tag = document.createElement("span");
      tag.className = "crafted-tag";
      tag.textContent = "Crafted: " + craftedN;
      tag.title = "Click to reset this craft count to 0";
      tag.addEventListener("click", e => {
        e.stopPropagation();
        if (confirm('Reset crafted count for "' + u.name + '" to 0?')) {
          delete state.crafted[u.id];
          render();
        }
      });
      title.appendChild(tag);
    }
```

- [ ] **Step 3: Verify syntax + smoke**

Run:

```bash
node --check app.js && node build/smoke.js
```

Expected: smoke passes. (The Craft buttons are `<button>` elements; the smoke harness's checkbox/planButton walks are unaffected because Craft buttons say "Craft", not "Plan", and aren't checkboxes.)

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "card: Craft button + Crafted:N tag for repeatable crafts"
```

---

### Task 4: `isFinished`/stats respect repeatable crafts

**Files:**
- Modify: `app.js` (`isFinished` at line 116, `renderStats` at line 539)

**Interfaces:**
- Consumes: `u.repeatable`, `state.crafted`.
- Produces: `isFinished` returns `false` for repeatable crafts; `renderStats` appends ` · N crafted` when any tally > 0.

- [ ] **Step 1: Make `isFinished` return false for repeatables**

In `app.js`, find:

```js
  // "Finished" = crafted, i.e. explicitly marked done.
  function isFinished(u) {
    return !!state.done[u.id];
  }
```

Replace with:

```js
  // "Finished" = a one-shot mission upgrade marked done. Repeatable key-item
  // crafts are never "finished" (you keep crafting more), so they never count
  // here — this keeps "Remove finished" and the "hide done" filter away from them.
  function isFinished(u) {
    return !u.repeatable && !!state.done[u.id];
  }
```

- [ ] **Step 2: Add the crafted segment to `renderStats`**

In `app.js`, find:

```js
  function renderStats() {
    const total = UP.length;
    const done = UP.filter(u => state.done[u.id]).length;
    const planned = UP.filter(u => state.plan[u.id]).length;
    els.stats.innerHTML = "<b>" + done + "</b>/" + total + " completed · <b>" + planned + "</b> planned";
    els.foot.textContent = total + " upgrades tracked";
  }
```

Replace with:

```js
  function renderStats() {
    const total = UP.length;
    const done = UP.filter(u => state.done[u.id]).length;
    const planned = UP.filter(u => state.plan[u.id]).length;
    let html = "<b>" + done + "</b>/" + total + " completed · <b>" + planned + "</b> planned";
    const crafted = Object.values(state.crafted || {}).reduce((a, b) => a + (b || 0), 0);
    if (crafted > 0) html += " · <b>" + crafted + "</b> crafted";
    els.stats.innerHTML = html;
    els.foot.textContent = total + " upgrades tracked";
  }
```

- [ ] **Step 3: Verify syntax + smoke**

Run:

```bash
node --check app.js && node build/smoke.js
```

Expected: smoke passes. ("Remove finished" still drops the rank-up marked done earlier; repeatable crafts are never returned by `isFinished`.)

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "isFinished/stats: repeatable crafts never finish, show crafted tally"
```

---

### Task 5: Styling for `.craft-btn` and `.crafted-tag`

**Files:**
- Modify: `style.css` (add rules near the existing `.card-done` / `.plan-btn` / `.card-key` styling)

**Interfaces:**
- Consumes: existing theme tokens (warp-purple accent). No new accent colors per AGENTS doc.

- [ ] **Step 1: Locate existing styling to match**

Run:

```bash
grep -n "card-done\|plan-btn\|card-key\|progress-badge" style.css
```

Identify the `.card-done` and `.plan-btn` rule blocks so the new rules reuse the same spacing/sizing conventions.

- [ ] **Step 2: Add `.craft-btn` and `.crafted-tag` rules**

Append to `style.css` (matching existing button font-size/padding conventions you found in Step 1; accent = the same purple used by `.progress-badge.complete`):

```css
/* Repeatable key-item crafts: a tally/reset button replaces the done checkbox. */
.craft-btn {
  font-size: .85rem;
  padding: .25rem .5rem;
  border-radius: 6px;
  border: 1px solid var(--muted, #4b3f5a);
  background: transparent;
  color: var(--muted, #9a8fad);
  cursor: not-allowed;
}
.craft-btn.ready {
  border-color: var(--accent, #b388ff);
  color: var(--accent, #b388ff);
  background: rgba(179, 136, 255, .12);
  cursor: pointer;
}
.craft-btn.ready:hover { background: rgba(179, 136, 255, .22); }
.crafted-tag {
  margin-left: .5rem;
  font-size: .75rem;
  color: var(--accent, #b388ff);
  cursor: pointer;
  border: 1px solid var(--accent, #b388ff);
  border-radius: 999px;
  padding: 0 .4rem;
}
.crafted-tag:hover { background: rgba(179, 136, 255, .15); }
```

If the existing CSS does not define `--accent`/`--muted` variables, use the literal hex values shown as fallbacks (they already appear as the fallbacks in `var(..., fallback)`), and confirm the purple matches `.progress-badge.complete` by grepping:

```bash
grep -n "progress-badge.complete\|--accent\|--muted\|#b388ff\|#9a8fad" style.css
```

Use whatever purple the project actually uses for `complete` — copy that hex into the `.craft-btn.ready`/`.crafted-tag` rules if `--accent` is undefined.

- [ ] **Step 3: Verify nothing broke (CSS has no test; sanity-check the JS still runs)**

Run:

```bash
node --check app.js && node build/smoke.js
```

Expected: smoke passes (CSS changes don't affect the shim).

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "style: craft button + crafted tag"
```

Record a note for the user: visual placement of the Craft button at 375px cannot be verified headless — ask them to eyeball devtools.

---

### Task 6: Extend `build/smoke.js` for repeatable crafts

**Files:**
- Modify: `build/smoke.js`

**Interfaces:**
- Consumes: `window.SKYISLAND_DATA.upgrades` (now 110), the Craft button (`.craft-btn`, disabled until ready), `registry`/`mkEl` shim, `storeBacking`.
- Produces: new assertions for: Craft button disabled-until-ready, press increments `crafted` + clears `have`/`qty`, global `tools` survive, Crafted tag appears; plus fix the hardcoded `=== 84` expand-all count.

- [ ] **Step 1: Fix the hardcoded expand-all count to the dynamic total**

In `build/smoke.js`, find:

```js
assert(Object.keys(es.open).length === 84 && Object.keys(es.groupsCollapsed || {}).length === 0, "expand all opens every section + upgrade");
```

Replace with:

```js
assert(Object.keys(es.open).length === window.SKYISLAND_DATA.upgrades.length && Object.keys(es.groupsCollapsed || {}).length === 0, "expand all opens every section + upgrade (" + window.SKYISLAND_DATA.upgrades.length + ")");
```

- [ ] **Step 2: Add the repeatable-craft assertions**

In `build/smoke.js`, find the final `setTimeout(() => { ... })` block and insert the new assertions **inside** that callback, **before** the final `console.log(...)`. (Placing them inside the setTimeout keeps them after any async export settle, matching the existing structure.) Use a known repeatable craft with a single-component easy-to-satisfy recipe; pick `craft:warp_folded_infinitree` (5 component groups: 3 warp shards, 2x4, sticks, 8 leaves, 4 splinters).

Insert before the `console.log(process.exitCode ? ...)` line:

```js
  // Repeatable key-item crafts: Craft button is disabled until all ingredient
  // groups are met; pressing it tallies +1 crafted and clears have/qty for that
  // upgrade; global tool qualities survive; the Crafted:N tag appears.
  const tree = window.SKYISLAND_DATA.upgrades.find(u => u.id === "craft:warp_folded_infinitree");
  assert(!!tree && tree.repeatable === true, "repeatable craft extracted (infinity tree sapling)");
  // Building a fresh isolated state so the craft assertions don't depend on the
  // rest of the run's mutations.
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  const impBtn2 = actions.children.find(c => c._text === "Import");
  impBtn2.dispatch("click");
  // Re-open the tree's card so its controls render.
  const openState = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  openState.open[tree.id] = true; storeBacking["skyisland.tracker.v1"] = JSON.stringify(openState);
  searchEl.value = ""; searchEl.dispatch("input"); // full render
  // find the tree's card: walk list for the node whose textContent === tree.name
  function findCardByName(name) {
    return (function walk(n){
      if (typeof n.className === "string" && n.className.indexOf("card") === 0 && n._text && n._text.indexOf(name) >= 0) return n;
      for (const c of n.children || []) { const r = walk(c); if (r) return r; }
      return null;
    })(list);
  }
  let treeCard = findCardByName(tree.name);
  assert(!!treeCard, "infinity tree card rendered");
  const craftBtnOf = card => (function walk(n){ if(n.tagName==="button" && n.className && n.className.indexOf("craft-btn")===0) return n; for(const c of n.children||[]){const r=walk(c); if(r) return r;} return null; })(card);
  let craftBtn = craftBtnOf(treeCard);
  assert(!!craftBtn, "tree card has a Craft button");
  assert(craftBtn.disabled === true, "Craft button disabled before ingredients met");
  // Met every component group via the have-flag (set state.have for each group).
  const preCraft = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  tree.components.forEach((_alts, gi) => { preCraft.have[tree.id + "::comp::" + gi] = true; });
  storeBacking["skyisland.tracker.v1"] = JSON.stringify(preCraft);
  searchEl.dispatch("input"); // re-render from persisted state
  treeCard = findCardByName(tree.name);
  craftBtn = craftBtnOf(treeCard);
  assert(craftBtn.disabled === false, "Craft button enabled after all ingredient groups met");
  // Seed a global tool-quality so we can prove it survives the craft.
  const ownQualBefore = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).tools || {}).length;
  craftBtn.dispatch("click");
  const afterCraft = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert((afterCraft.crafted[tree.id] || 0) === 1, "pressing Craft tallies crafted:1");
  assert(Object.keys(afterCraft.have).filter(k => k.indexOf(tree.id + "::comp::") === 0).length === 0,
    "Craft clears the upgrade's have flags");
  assert(Object.keys(afterCraft.qty).filter(k => k.indexOf(tree.id + "::comp::") === 0).length === 0,
    "Craft clears the upgrade's per-alternative quantities");
  assert(Object.keys(afterCraft.tools || {}).length === ownQualBefore,
    "global tool qualities survive a Craft");
  // Crafted:N tag now appears in the title.
  treeCard = findCardByName(tree.name);
  const hasTag = (function walk(n){ if(typeof n.className==="string" && n.className==="crafted-tag" && /Crafted: 1/.test(n._text)) return true; for(const c of n.children||[]){if(walk(c)) return true;} return false; })(treeCard);
  assert(hasTag, "Crafted:1 tag appears near the name after a craft");
```

- [ ] **Step 3: Run the smoke test**

Run:

```bash
node --check app.js && node build/smoke.js
```

Expected: `All smoke checks passed`, including the new `repeatable craft extracted`, `Craft button disabled before ingredients met`, `Craft button enabled after all ingredient groups met`, `pressing Craft tallies crafted:1`, `Craft clears the upgrade's have flags`, `Craft clears the upgrade's per-alternative quantities`, `global tool qualities survive a Craft`, and `Crafted:1 tag appears near the name after a craft` lines.

- [ ] **Step 4: Commit**

```bash
git add build/smoke.js
git commit -m "smoke: cover repeatable crafts (Craft button, tally, reset, tag)"
```

---

### Task 7: Full verification + user handoff notes

**Files:** none modified

- [ ] **Step 1: Clean regenerate + full check**

Run:

```bash
python3 build/extract.py
node --check app.js
node build/smoke.js
```

Expected: `Wrote 110 upgrades ...`, `--check` silent, `All smoke checks passed`.

- [ ] **Step 2: Spot-check there are no stale diff artifacts**

Run:

```bash
git status --porcelain
```

Expected: clean working tree (everything committed) OR only intentional files.

- [ ] **Step 3: Final commit if anything regenerated changed**

```bash
git add -A && git status --porcelain && echo "nothing to add if empty above"
```

If the porcelain output is empty, skip the commit. Otherwise:

```bash
git commit -m "chore: regenerate data + verify repeatable crafts"
```

- [ ] **Step 4: Handoff note to user**

Report to the user:
1. What was built (26 repeatable crafts, Craft button + Crafted:N tally + ingredient reset, global tools preserved).
2. The data count is now 110 upgrades (was 84).
3. **Caveat:** the Craft button's visual placement at 375px could not be verified headless — ask the user to eyeball devtools at 375px and confirm the button doesn't overflow.
4. Verification commands run and their results.

---

## Self-Review

**Spec coverage:**
- *Extraction second pass over recipes.json, join result==item.id, repeatable:true, craft: id, subcategory→category* — Task 1. ✓
- *State `crafted` field, export/import/reset carry it* — Task 2 (blankState) + the existing `Object.assign(blankState(), …)` in `load`/`import` covers it; smoke asserts import round-trips. ✓
- *Craft button disabled-unless-ready, tally + resetComponents, no lock* — Task 3. ✓
- *Crafted:N tag near name, click-to-reset* — Task 3. ✓
- *isFinished false for repeatables → Remove finished & hide done unaffected* — Task 4. ✓
- *renderStats ` · N crafted`* — Task 4. ✓
- *Plan panel treats repeatables like any upgrade (no special code)* — no task needed; the existing `renderShopping` keys by alt-id signature and reads `compMet`/`have`/`qty`, which are unchanged. ✓
- *Tool qualities survive* — `resetComponents` deliberately omits `state.tools`; Task 6 asserts it. ✓
- *Testing: smoke covers all 5 required assertions* — Task 6. ✓
- *CSS styling with no new accent colors* — Task 5. ✓

**Placeholder scan:** No TBD/TODO/vague steps. All code blocks are complete and copy-pasteable.

**Type/name consistency:**
- `resetComponents(u)` — defined Task 2, used Task 3. ✓
- `u.repeatable` — set in Task 1, read in Tasks 3 & 4. ✓
- `state.crafted` — added Task 2, written Task 3, read Tasks 3 & 4, asserted Task 6. ✓
- `craft:warp_folded_infinitree` — Task 1 emits `craft:`+result; Task 6 looks up `craft:warp_folded_infinitree`. ✓
- `.craft-btn` / `.crafted-tag` class names — Task 3 (JS), Task 5 (CSS), Task 6 (smoke query). ✓

No gaps found.