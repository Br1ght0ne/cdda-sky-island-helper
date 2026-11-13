<!-- markdownlint-disable MD013 -->
# AGENTS.md

Context for AI agents (and humans) working on **cdda-sky-island-helper** — a
tracker for the upgrades in the Cataclysm: DDA *Sky Island* mod.

## What this is

A dependency-free, single-page web app (vanilla HTML/CSS/JS, no build step, no
framework) that helps a player track the items needed to unlock the mod's
one-time upgrades (Island Rank Up, constructions, raid upgrades, start-location
& challenge unlocks — 91 mission upgrades, plus 3 optional Xedra Evolved upgrades).

**Hard constraint: it must run by opening `index.html` straight from a `file://`
path.** That rules out `fetch()` (blocked on `file://`) and any CDN/remote
assets. This is why the data ships as a JS file (`data.js` assigns a global),
not a JSON file loaded at runtime.

## Files

| File | Role |
| --- | --- |
| `index.html` | markup / layout |
| `style.css` | all styling (green-on-black terminal theme, with a light-mode complement) |
| `app.js` | all behaviour — one big IIFE, no framework |
| `data.json` | **canonical** generated data (pretty, diffable) |
| `data.js` | generated wrapper: `window.SKYISLAND_DATA = <same payload>` (minified). Loaded by the app. |
| `build/extract.py` | regenerates BOTH data files from the mod source |
| `build/smoke.js` | headless DOM-shim test for `app.js` |

**Never hand-edit `data.json` / `data.js`** — regenerate them. They are
byte-equivalent payloads; the `.js` exists only so the page works from `file://`.

## Data pipeline

`build/extract.py` reads the CDDA checkout from the **`CDDA_PATH`** env var
(this repo sets it in the gitignored `mise.local.toml`; `~` is expanded). It:

- joins each upgrade's three linked objects — `mission_definition` +
  upgrade-key `ITEM` + `recipe` — on the key item id
  (`mission.item == item.id == recipe.result`);
- resolves item / tool-quality display names (+ English-default plurals: `str +
  "s"` unless `str_pl`/`str_sp` given) from base data + the mod, following
  `copy-from`, falling back to a prettified id;
- expands `requirement` objects referenced via `LIST` recursively (counts
  multiply through nesting) → per-alternative `expand: [{id,label}]` used for
  the tooltips (e.g. `cordage` → "1 long string OR … OR 6 short leather laces");
- scans every item's `qualities`/`charged_qualities` (following `copy-from`) to
  find example tools satisfying each required quality at level ≥ needed →
  top-level `quality_items` map keyed `"QUALITY::level"` → `{examples:[{id,name}], total}`.

Regenerate + verify:

```bash
python3 build/extract.py
mise exec bun -- bun build/smoke.js
mise exec bun -- bun -e 'new Bun.Transpiler({loader:"js"}).transformSync(await Bun.file("app.js").text())'
```

### Payload shape (`window.SKYISLAND_DATA`)

- `upgrades[]`: `{id, key_item, key_name, name, group, category, effect,
  description, components, qualities, tools}`.
  - `components`: array of AND-groups; each group is an array of OR-alternatives
    `{id, count, name, list, tip?, expand?}`. `list:true` = a `LIST`/requirement
    pseudo-item (the only thing that carries `tip`/`expand`).
  - `qualities`: `{id, level, name}`. `tools`: `{id, name}`.
- `quality_items`: the `"QUALITY::level"` → examples/total map above.
- Tool/quality **descriptions were intentionally dropped** — tooltips exist only
  for `LIST` item-groups.

## State model (localStorage key `skyisland.tracker.v1`)

`{ done, plan, raid, have, qty, tools, open, groupsCollapsed, crafted, xedraEnabled }` — see
`blankState()`.

- `done[upgradeId]` — a one-shot upgrade marked complete.
- `plan[upgradeId]` — in the plan (feeds the Plan panel).
- `raid[upgradeId]` — selected for Next raid, a subset of planned incomplete
  upgrades. Included in exports/imports/reset; old saves default to `{}`.
  Completing/removing a goal clears its raid entry. Repeatable crafting retains
  plan and raid membership. Disabled Xedra entries are retained but hidden.
- Undo stores 20 progress snapshots in memory. `checkpoint()` precedes a user
  mutation and `finishChange()` records it at render only if progress changed.
  Open sections/cards and UI preferences are excluded. Imports normalize maps
  and remove unknown/completed plan IDs and orphaned raid IDs.
- `crafted[upgradeId]` — integer tally of how many times a **repeatable**
  craft's "Craft" button has been pressed (shown as a "Crafted: N" tag on the
  card; click the tag to reset it to 0). One-shot upgrades never touch this.
- `have[key]` — a component group manually ticked ("I have one of these"),
  keyed `${upgradeId}::comp::${groupIdx}`.
- `qty[key]` — per-alternative gathered count, keyed
  `${upgradeId}::comp::${groupIdx}::${altId}`.
- `tools[key]` — **GLOBAL** tool-quality ownership, keyed `${qualityId}::${level}`
  (NOT per-upgrade — see below).
- `open[upgradeId]` — card expanded. `groupsCollapsed[groupName]` — section collapsed.
- `xedraEnabled` — optional Xedra Evolved content toggle, false by default.
  Upgrades tagged `mod: "xedra_evolved"` are excluded from cards, search,
  Plan aggregation, and counts when off, but their progress is retained.
  This choice is exported/imported/reset with tracker state; save-file import
  does not change it.

Export/Import copies this object as JSON via the clipboard; Reset = `blankState()`.
Import/export/reset live in the Data disclosure; Undo is a top-level toolbar button.
Settings contains **Display Xedra Evolved content** and **Use Vim j/k navigation**.
The Vim preference uses its own `skyisland.vim-keys` localStorage key, defaults
false, and is excluded from progress export/import/reset. Arrow/Enter navigation
is scoped to focused card disclosures and respects filtered/collapsed content;
Vim aliases are active only when enabled. Editable controls/modifiers are ignored.
Commands / Cmd-Ctrl-K opens a native dialog with combobox/listbox results for
upgrades and actions. Palette actions reuse tracker history and reveal helpers;
closing must not restore focus into a closed/inert Plan sheet. Getting-started guidance is
first-run only, with no Settings action to reopen it. Onboarding dismissal uses `skyisland.welcome-dismissed`,
a separate UI preference excluded from tracker exports/imports/reset.

**Theme preference** lives in its own key, `skyisland.theme` (`"light"` / `"dark"`,
absent = Auto) — deliberately separate from tracker state above so it's a UI
preference, not exported/imported/reset with the tracked progress. A tiny inline
`<script>` at the top of `index.html`'s `<head>` (before the stylesheet) reads it
and sets `documentElement.dataset.theme` before first paint, to avoid a flash of
the wrong theme. `style.css` gives `:root[data-theme]` higher specificity than
the `@media (prefers-color-scheme)` block, so an explicit choice always wins;
with no attribute set, the OS preference alone decides ("Auto").

## Key behaviours & decisions (don't regress these)

- **Terminology is centralized on "Plan"** — the sidebar/panel is the "Plan", not
  "shopping list". Internal code identifiers (`renderShopping`, `#shopping`) keep
  the old name; user-facing text says Plan.
- **Component tracking, two ways** (a group is *met* when either applies):
  1. the group checkbox ("I have one of these" — any alternative); or
  2. per-alternative **− / +** steppers (or typing a number). The whole line
     auto-checks the instant *any one* alternative reaches its required count.
  Tool qualities & tools use a plain checkbox (no steppers).
- **Tool qualities are a shared GLOBAL registry** (`state.tools`). The tools that
  provide them stay permanently on the island, so ticking e.g. "Hammering lvl 2"
  once marks it met in *every* upgrade that needs it. All 29 qualities appear at a
  single level, so exact `id::level` keying == "own this quality". Each quality
  row also shows a few example items from `quality_items`.
- **The Plan panel is interactive and linked**: ticking a material there updates
  the very same state the cards read (and vice-versa). This works because there
  is **one `state` object + a full `render()` after every mutation** — that is
  the entire binding mechanism.
  - **Do NOT add a state/binding library (htmx, Alpine, etc.).** htmx was
    explicitly rejected: it's for server-driven HTML over HTTP and needs a
    CDN/server, breaking the `file://` + offline constraint.
- **Plan quantities**: single-alternative rows sum remaining per-upgrade
  allocations; OR groups stay separate so independent choices are not merged.
  Same-ID alternatives can have different counts; never sum those counts together.
  Next raid scopes materials, tools and readiness to selected goals; qualities
  remain global. All planned retains gathered rows; Next raid hides them.
- **Navigation**: category/availability/search filters combine. Available now
  excludes done and tracked blockers; Missing one also requires exactly
  one unmet group/tool/quality. Prerequisite navigation clears hiding filters and
  expands/focuses the target. Batch prerequisite planning is recursive and undoable.
- **Completion**: completed upgrades cannot be silently reopened by planning.
  Mark incomplete first. `isReady()` is shared by cards, Plan and summary counts;
  blocked upgrades with gathered ingredients must not display Ready to craft.
- **Tooltips**: only `LIST` item-groups have them. They appear on hover; after
  500ms of hovering (or an immediate click on the group, which is not a link)
  they **freeze** — border turns from muted to vivid **accent green** (no other
  accent colors), become interactive/scrollable, and each option inside is a link to the
  CDDA Guide. `FREEZE_MS` / `BRIDGE_MS` constants in `app.js`.
  LIST triggers are native buttons. Clicking pins details, focuses Close, and
  Escape restores trigger focus; pinned details stay open until dismissed.
- **Links**: items → `cdda-guide.nornagon.net/item/<id>`, qualities →
  `/tool_quality/<id>` (base is `DATA.guide_base`). Clicking item text/links must
  never toggle a checkbox or the card.
- **"Ready to craft" list** in the Plan panel: any planned upgrade whose every
  requirement (components, qualities, tools) is met **and** that is not
  chain-locked appears there, completable straight from the sidebar. Marking a
  planned upgrade done auto-drops it from the plan, so there is no separate
  "remove finished" step — the old button was dropped when this section
  arrived. For repeatable crafts the same row tallies a craft and resets
  ingredients.
- **Sections (groups) are collapsible**; "Collapse all" collapses sections too
  (leaving only section names); search bypasses collapse so matches show. Search
  matches names, effects, component names, **and tool qualities/tools**.

## Layout / responsive

- Top controls are two rows: search on row 1; filter buttons (Hide done / Only in plan, with pressed accent borders) and category/availability + Expand/Collapse-all +
  Data/Settings disclosures on row 2. The only plan-management button ("Clear") lives
  in the Plan panel header; the "Ready to craft" list below it replaces the old
  "Remove finished" button.
- Desktop: Plan is a sticky right sidebar (grid `1fr 420px`).
- `≤900px`: single column; the Plan becomes a **fixed bottom sheet** — a handle
  with a live summary; tap it or the backdrop to slide up/down (`open` class,
  ephemeral, not persisted). The All planned/Next raid view is also ephemeral.
  Closed sheet content is inert; opening makes the background inert, traps focus,
  and Escape closes it. Desktop breakpoint changes release modal restrictions.
- Must not horizontally scroll down to **375px** (iPhone SE). Guardrails:
  `overflow-wrap: anywhere` on text; viewport-capped tooltip; a `≤480px` block;
  `overflow-x:hidden` on mobile as a safety net.
- Two subtle mobile bugs already fixed — keep them fixed:
  - `#plan-panel` needs `top: auto` on mobile, or the leftover `.sticky`
    `top:16px` fights `bottom:0` and leaves a gap under the open sheet.
  - `touch-action: manipulation` on tappable elements removes the ~300ms touch
    tap delay.

## Testing

The dev sandbox has no bundled browser automation dependencies
(Chrome/puppeteer/playwright/jsdom). A host-native browser may be available through
computer-use tools; verify tool availability rather than assuming it.
`build/smoke.js` is a hand-rolled DOM shim that loads `data.js` + `app.js` and
drives the UI (planning, checkboxes, steppers, quality sync, collapse, tooltips,
sheet toggle, export/import/reset). Run it after any `app.js`/`data` change:

```bash
mise exec bun -- bun build/smoke.js
mise exec bun -- bun -e 'new Bun.Transpiler({loader:"js"}).transformSync(await Bun.file("app.js").text())'
```

Caveat: the shim verifies **logic**, not visual layout. Inspect CSS/responsive changes in an available browser (including 375px).
If none is available, call out that limitation and ask the user to check devtools. When adding a DOM API in
`app.js` that the shim lacks, extend the shim (`mkEl`, `global.document`).

## Idiomatic patterns (enforced by the linter — don't regress)

### DOM manipulation

- **`el.append(child)`** instead of `el.appendChild(child)`. (`append` accepts
  multiple args and strings; `appendChild` is legacy.)
- **`el.replaceChildren()`** (no args) to clear an element instead of
  `el.innerHTML = ""`.
- **`document.querySelector("#id")`** instead of `document.getElementById("id")`.
- When adding a new DOM method to `app.js`, add the corresponding stub to
  `mkEl` / `global.document` in `build/smoke.js` at the same time.
  The shim also models parentage, selectors, focus, document listeners and media
  changes. Keep new API stubs aligned with the behaviors the application uses.

### User notifications

- **`notify(msg)`** for all user-facing status messages — renders a brief
  auto-dismissing toast (`#toast`). **Never use `alert()`.**
- When the clipboard API is unavailable during export, call
  **`showExportFallback(json)`** instead — shows an overlay with a selectable
  `<textarea>` the user can copy from manually.
- `confirm()` is still acceptable for destructive-action guards (e.g. reset,
  import-save confirmation) because those block intentionally.

### Code style

- **No nested ternaries.** Extract the inner condition to a `const` first:

  ```js
  // ✗  a ? (b ? x : y) : z
  const val = b ? x : y;
  // ✓  a ? val : z
  ```

- **`str.startsWith(prefix)`** / **`str.endsWith(suffix)`** instead of
  `str.indexOf(prefix) === 0` / similar.
- **`arr.includes(item)`** instead of `arr.indexOf(item) >= 0` for existence
  checks.
- **`arr.at(-1)`** instead of `arr[arr.length - 1]` for last-element access.
- Wrap `JSON.parse` in a try/catch (or delegate to a helper that does) whenever
  it could receive untrusted input. In `build/smoke.js` the `getState()` helper
  centralises this for `localStorage` reads.
- In Node scripts (`build/smoke.js`) use **`process.stdout.write()`** for
  informational output — `console.log/debug/warn` is reserved for actual
  errors or is banned outright by the linter rule `no-console-except-error-js`.
