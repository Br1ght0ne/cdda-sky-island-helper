# Sky Island Helper

A tiny, dependency-free web app for tracking the items you need to unlock
upgrades in the [Cataclysm: DDA](https://github.com/CleverRaven/cataclysm-dda)
**Sky Island** mod — Island Rank Ups, bunker constructions, raid upgrades, and
start-location / challenge unlocks.

Just open `index.html` in a browser. No server, no build step, no internet.

## Features

- Collapsible, searchable, filterable list of upgrades and repeatable crafts,
  grouped by category, each with live progress toward its materials.
- Three optional Xedra Evolved one-time upgrades under Mod Upgrades, with
  tier 5 vampirism and blood-gift research unlocked after tier 4 vampirism.
  Enable them with the **Display Xedra Evolved content** checkbox (off by default). Turning
  it off hides their cards and Plan requirements while preserving progress;
  the choice is saved and included in progress exports.
- Flexible material tracking — mark a requirement as gathered as a whole, or
  count individual alternatives toward it.
- Tool qualities are tracked globally: own a tool once, and it's satisfied
  everywhere it's needed, with example items shown for each.
- A linked Plan panel shows remaining materials after partial gathering, with
  independent alternative choices kept separate, and stays in sync with cards.
- Select **Next raid** on planned upgrades to focus the Plan on this trip's goals.
  This focus is saved and included in progress exports; completed upgrades leave
  both the Plan and Next raid. Repeatable crafts stay selected for another craft.
- Filter by category, **Available now** (no tracked prerequisite blockers), or
  **Missing one**. Availability does not model every in-game condition.
- Read upgrade benefits on collapsed cards, follow prerequisite links, or add a
  goal and all its missing prerequisites to the Plan in one action.
- Recover the last 20 progress changes with **Undo**, including crafts,
  imports, resets, and clearing the Plan. Undo history lasts for this page session;
  it does not change theme, filters, or expanded sections.
- First-run guidance offers save import or a first upgrade. Data contains Export
  data, Import data, Import game save, and Reset. Settings contains the optional
  **Display Xedra Evolved content** toggle.
- Every item and tool quality links out to the [CDDA Guide](https://cdda-guide.nornagon.net),
  with expandable tooltips for grouped/alternative requirements.
- Import your save file to auto-mark completed upgrades, or export/import your
  tracked progress as JSON.
- **Commands** or **Cmd/Ctrl+K** searches upgrades and actions. Use Up/Down to
  select, Enter to run, Escape to close. Open from a card to plan it or its
  prerequisites. Hidden Xedra content stays excluded. Data and Settings actions
  are available with prefixes such as **Data - Import data**. **Category** and
  **Availability** open searchable option lists; Enter applies a value, while
  Back/Escape returns to the parent palette with its search restored. Backspace
  on an empty option search also returns to the parent.
- On focused card titles, **Up/Down** moves between visible cards and **Enter**
  expands/collapses. **Settings → Use Vim j/k navigation** optionally enables
  j/k aliases; typing fields and other controls keep their normal keys.
- Keyboard-operable cards, sections and item details; larger mobile touch targets.
- Responsive layout with a mobile-friendly Plan sheet; works fully offline,
  even from a `file://` path, with progress saved in your browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | markup + layout |
| `style.css` | styling (dark/light themes) |
| `app.js` | all behaviour (vanilla JS, no framework) |
| `data.json` | **canonical** generated data — pretty, diffable, loadable |
| `data.js` | generated wrapper (`window.SKYISLAND_DATA = …`) mirroring `data.json`, loaded by the app so it works from `file://` |
| `build/extract.py` | regenerates `data.json` + `data.js` from the mod's JSON |
| `build/smoke.js` | headless DOM smoke test for `app.js` |

`data.json` is the source of truth (human-readable, easy to diff when the mod
updates); `data.js` is byte-for-byte the same payload wrapped in a global so the
page can load it without a web server (`fetch()` is blocked on `file://`). Both
are regenerated together — never edit them by hand.

## Deploying (GitHub Pages)

The site is served straight from the repo root — no build step. Pushing to
`main` runs `.github/workflows/deploy.yml`, which bundles the site files
(`index.html`, `style.css`, `app.js`, `data.js`, `favicon.svg`) and publishes
them to GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**. After the first successful run the site is live at
`https://br1ght0ne.github.io/cdda-sky-island-helper/`.

## Rebuilding the data

`data.json` / `data.js` are generated from the mod source. The extractor reads
the CDDA checkout from the **`CDDA_PATH`** env var (this repo sets it in the
gitignored `mise.local.toml`). If the mod updates, regenerate them:

```bash
python3 build/extract.py     # reads $CDDA_PATH/data/mods/Sky_Island, writes data.json + data.js
mise exec bun -- bun build/smoke.js          # optional: verify app.js still works end-to-end
```

The extractor:

- joins each upgrade's `mission_definition` + upgrade-key `ITEM` + `recipe`;
- resolves item / tool-quality display names (and English-default plurals) and
  in-game descriptions from the base CDDA data + the mod, falling back to a
  prettified id when a name can't be found;
- recursively expands `requirement` objects referenced via `LIST` (counts
  multiply through nesting) to build the hover tooltips;
- scans every item's `qualities`/`charged_qualities` (following `copy-from`) to
  find example tools that satisfy each required tool quality at level ≥ needed,
  emitted as `quality_items` in the data.

Point `CDDA_PATH` at your own Cataclysm-DDA checkout (e.g. in `mise.local.toml`
or `export CDDA_PATH=…`); the script errors out if it isn't set.
For sparse checkouts, include `data/json`, `data/mods/Sky_Island`, and
`data/mods/Xedra_Evolved` so optional upgrade ingredients resolve correctly.

## Checking changes

With Bun installed through mise:

```bash
mise exec bun -- bun build/smoke.js
mise exec bun -- bun -e 'new Bun.Transpiler({loader:"js"}).transformSync(await Bun.file("app.js").text())'
```

The DOM shim covers tracking behavior and keyboard/focus state, not browser
layout. For UI changes, also open `index.html` directly in a browser and inspect
desktop and 375px layouts, including the open Plan sheet. Completed one-time
upgrades must be explicitly marked incomplete before they can be planned again.
