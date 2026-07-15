# Sky Island Helper

A tiny, dependency-free web app for tracking the items you need to unlock
upgrades in the [Cataclysm: DDA](https://github.com/CleverRaven/cataclysm-dda)
**Sky Island** mod — Island Rank Ups, bunker constructions, raid upgrades, and
start-location / challenge unlocks.

Just open `index.html` in a browser. No server, no build step, no internet.

## Features

- Collapsible, searchable, filterable list of upgrades and repeatable crafts,
  grouped by category, each with live progress toward its materials.
- Flexible material tracking — mark a requirement as gathered as a whole, or
  count individual alternatives toward it.
- Tool qualities are tracked globally: own a tool once, and it's satisfied
  everywhere it's needed, with example items shown for each.
- A linked Plan panel aggregates missing materials across everything you've
  queued up, and stays in sync with the per-upgrade cards.
- Every item and tool quality links out to the [CDDA Guide](https://cdda-guide.nornagon.net),
  with expandable tooltips for grouped/alternative requirements.
- Import your save file to auto-mark completed upgrades, or export/import your
  tracked progress as JSON.
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
`main` runs `.github/workflows/deploy.yml`, which bundles the four site files
(`index.html`, `style.css`, `app.js`, `data.js`) and publishes them to
GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**. After the first successful run the site is live at
`https://br1ght0ne.github.io/cdda-sky-island-helper/`.

## Rebuilding the data

`data.json` / `data.js` are generated from the mod source. The extractor reads
the CDDA checkout from the **`CDDA_PATH`** env var (this repo sets it in the
gitignored `mise.local.toml`). If the mod updates, regenerate them:

```bash
python3 build/extract.py     # reads $CDDA_PATH/data/mods/Sky_Island, writes data.json + data.js
node build/smoke.js          # optional: verify app.js still works end-to-end
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
