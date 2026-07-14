# Repeatable Key-Item Crafts — Design

**Date:** 2026-07-15
**Status:** Approved (pending spec review)

## Goal

Track the Sky-Island mod's **repeatable key-item crafts** — non-mission recipes
that produce deployable/usable key items (the infinity sources, warp bags,
hauler's harness, autodoc enhancers, etc.) — with a per-craft tally instead of
the boolean "done" the 84 mission upgrades use.

A repeatable craft is never "complete." Each time you craft it, the tally ticks
up (`Crafted: N`) and its ingredient checkboxes/quantities reset so you can
immediately start gathering for the next one.

## Scope

**In:** all 26 Sky-Island recipes in `data/mods/Sky_Island/recipes.json` that
have **no** `mission_definition` (i.e. are not already extracted as a mission
upgrade). Concretely:

- `warp_grassbag`, `warp_wood_floor_tokens`, `warp_flagstone_floor_tokens`,
  `warp_sand_floor_tokens`, `warp_flesh_floor_tokens`
- `warp_waterwalking_stone`, `warp_vortex_token`, `warp_skyward_beacon`,
  `warpextender`, `warp_healing_salve`, `warphome`
- `warphaulbag`, `warphaulbag_tier2`, `warphaulbag_tier3`
- `warp_carrier`, `warp_autodoc_inert`
- `warp_labs_catalyst`, `item_merchant_attractor`
- `warp_folded_infinitree`, `warp_folded_infinitystone`,
  `warp_folded_infinityore`
- `warped_autodoc_upgrader_1`, `warped_autodoc_upgrader_2`
- `quickheal`, `warpmetalbag`, `warpdirtbag`

**Out of scope:** the 41 entries in `recipes_materials.json` (material-token →
vanilla-resource conversions such as `log`, `2x4`, `nail`); those are generic
resources, not key items. Per-craft decrement/undo, auto-remove-from-plan after
N crafts.

## State

`blankState()` gains one field:

```js
{ done, plan, have, qty, tools, open, groupsCollapsed, crafted }
//                                                          ^^^^^^^ new: { [id]: number }
```

- `crafted[upgradeId]` — integer count of times this repeatable craft has been
  crafted.
- Export/Import/Reset carry it automatically (they already
  `Object.assign(blankState(), …)` over the whole object).
- `state.done` is **never** set for repeatable crafts. The 84 mission upgrades
  keep their boolean-`done` behavior unchanged.

## State model decision

**Chosen: per-upgrade `crafted` counter + component-only reset.**
`crafted[id]` is a standalone integer; pressing Craft increments it and clears
`have`/`qty` for that upgrade's component groups only. Global tool qualities
(`state.tools`) survive — they are permanent island gear, per the AGENTS doc.

Rejected:
- **Reuse `done` as a stack** (let `done[id]` hold an integer for repeatables):
  overloads `done` (boolean-for-missions vs integer-for-crafts), forcing `hideDone`,
  `isFinished`, and "Remove finished" to branch per-type. Messy.
- **Full reset incl. tool qualities:** clears `state.tools` on each craft. Wrong:
  tool qualities are permanent island gear; re-gathering them each craft is the
  exact behavior the AGENTS doc warns against.

## Extraction (`build/extract.py`)

After the mission pass, add a second pass for non-mission Sky-Island recipes:

- Iterate `data/mods/Sky_Island/recipes.json` (single recipe file; if more
  non-mission Sky-Island recipe files exist later, generalize the same way).
- For each recipe whose `result` has **no** `mission_definition`, join
  `recipe.result == item.id` against the mod's `ITEM` definitions.
- Emit one upgrade-shaped object per such recipe with:
  - `repeatable: true`
  - `group: "Repeatable Crafts"`
  - `category`: mapped from `recipe.subcategory`:
    `CSC_WARP_TOOLS` → "Warp Tools", `CSC_WARP_GEAR` → "Warp Gear",
    `CSC_WARP_UPGRADES` → "Warp Upgrades",
    `CSC_WARP_ITEMS` or empty → "Warp Items".
  - `id`: a stable, unique id for the craft. Use the recipe `result` prefixed
    with `craft:` (e.g. `craft:warp_folded_infinitree`) so it never collides with
    a mission upgrade id (`m["id"]`), and so the web app can distinguish the two
    kinds by prefix without an extra field.
  - `name`: the ITEM's resolved name; `key_name`: same (these aren't "Craft: X"
    mission artifacts — the card title is the item name).
  - `effect`: `extract_effect(description)`; `description`: the ITEM description.
  - `components` / `qualities` / `tools`: reuse the existing parsers
    (`parse_components`, `parse_qualities`, `parse_tools`), so LIST tooltips,
    quality examples, and `fakeitem_statue` tool filtering all work unchanged.
  - `name`/`key_name` fall back to the item's resolved name for entries with a
    non-dict `name` or missing subcategory (`quickheal`, `warpmetalbag`,
    `warpdirtbag`).
- Mission upgrades keep `repeatable: false` (set explicitly, default false) so
  the app can branch on a single boolean.
- A craft is excluded only if its `result` already has a `mission_definition`
  (defensive; none of the 26 do today).

Both `data.json` and `data.js` are regenerated, byte-equivalent payloads as
today. The `count` field becomes mission-upgrades-only (unchanged); the total
`upgrades.length` grows by ~26.

## Card UI (`app.js`)

For `u.repeatable` crafts, the top-left "done" checkbox is **replaced** by a
**Craft** button:

- **Not ready:** disabled, labelled `Craft`, `title="Gather all ingredients first"`.
- **Ready** (`prog.met === prog.total`): enabled, highlighted (e.g.
  `.craft-btn.ready`), labelled `Craft`. The existing progress badge still shows
  `✓ ready`.
- **On press:** `state.crafted[u.id] = (state.crafted[u.id]||0)+1`, then call
  `_resetComponents(u)` (deletes every `state.have[u.id + "::comp::*"]` and
  every `state.qty[u.id + "::comp::*::*"]`), then `render()`.
- No `lock` for repeatable crafts — steppers/checkboxes stay enabled after a
  craft so you can keep gathering. (`state.done` is never set for them, so the
  existing `locked = !!state.done[u.id]` guards already evaluate false.)

A **crafted tag** appears near the name when `crafted[u.id] > 0`:
`Crafted: N`. Clicking it prompts `Reset crafted count for "<name>" to 0?`;
confirming deletes `state.crafted[u.id]` and re-renders (mis-click / recount
safety; does **not** touch ingredients).

The non-repeatable path (84 mission upgrades) is unchanged: boolean done
checkbox, no Craft button, no crafted tag.

## Plan panel & stats

- Repeatable crafts are plan-able like any upgrade; the Plan panel aggregates
  their materials identically (it already keys by alternative-id signature and
  mutates the same `have`/`qty` state).
- `isFinished()` returns `false` for repeatable crafts (they are never "done"),
  so **"Remove finished"** never auto-removes them and the **"hide done"** filter
  never hides them.
- `renderStats()` gains a ` · Z crafted` segment shown only when
  `Σ crafted[*] > 0`, appended after the existing `completed/planned` text.

## Search / filters

`matches()` already searches names, effects, component names, qualities and
tools; repeatable crafts flow through unchanged. Collapsible-section and
"only in plan" behavior is identical.

## Testing (`build/smoke.js`)

Extend the smoke harness to load at least one repeatable craft and assert:

1. The Craft button is disabled until all ingredient groups are met.
2. Pressing the enabled Craft button increments `state.crafted` by 1 and clears
   all `have`/`qty` keys for that upgrade's component groups.
3. The `Crafted: N` tag appears after a craft and is absent before.
4. A global tool-quality entry in `state.tools` survives a Craft (not cleared).
5. Toggling a material in the Plan panel still drives the same `have`/`qty`
   state the card reads (existing invariant, re-asserted for a repeatable craft).

When the shim lacks a DOM API the new code uses, extend it (`mkEl`,
`global.document`) per the AGENTS doc.

Verification commands:

```bash
python3 build/extract.py
node --check app.js && node build/smoke.js
```

## Layout / responsive

The Craft button replaces the done checkbox in the same `.card-done` slot, so
desktop layout is unaffected. On mobile (≤375px) a disabled+enabled button is
wider than a checkbox; flag for the user to eyeball at 375px — the
`overflow-wrap: anywhere` / `overflow-x: hidden` guardrails should absorb it,
but it cannot be visually confirmed in the headless sandbox.

## Out of scope (YAGNI)

- Per-craft decrement / undo.
- Auto-remove a craft from the plan after N crafts.
- The 41 `recipes_materials.json` resource conversions.
- A batch "craft N at once" control.