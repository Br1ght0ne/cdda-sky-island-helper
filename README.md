# Sky Island Helper

A tiny, dependency-free web app for tracking the items you need to unlock
upgrades in the [Cataclysm: DDA](https://github.com/CleverRaven/cataclysm-dda)
**Sky Island** mod — Island Rank Ups, bunker constructions, raid upgrades, and
start-location / challenge unlocks.

Just open `index.html` in a browser. No server, no build step, no internet.

## Features

- **All 84 upgrades** grouped by Progression / Island Upgrades / Island
  Construction / Raid Upgrades / Raid Unlocks.
- **Collapsible cards** — a vertical list you can scan at a glance, with
  **Expand all / Collapse all**.
- **Per-item checkboxes** inside each upgrade: tick off each material, tool
  quality, and tool as you gather it. A progress bar and `met/total` badge
  update live.
- **Mark upgrades complete** with the big checkbox on the left.
- **Plan** button on each upgrade feeds a live **shopping list** in the sidebar
  that aggregates every still-missing material across your planned upgrades
  (warp shards get their own running total).
- **Every item is a link** to the [CDDA Guide](https://cdda-guide.nornagon.net)
  — materials/tools open `/item/<id>`, tool qualities open `/tool_quality/<id>`.
- **Hover tooltips** (guide-style): real items show their in-game description;
  `LIST`/requirement pseudo-items expand to their full option list, e.g.
  *cordage* → "1 long string OR … OR 6 short strings OR 6 short leather laces".
- **Search** by upgrade name, effect, or required item.
- **Filters**: hide completed, show only planned.
- **State is saved in your browser** (`localStorage`) and survives reloads even
  when opened from a `file://` path.
- **Export / Import** your whole progress as JSON via the clipboard, to back it
  up or move it between machines/browsers.

## Files

| File | Purpose |
|---|---|
| `index.html` | markup + layout |
| `style.css` | styling (dark, warp-themed) |
| `app.js` | all behaviour (vanilla JS, no framework) |
| `data.json` | **canonical** generated data — pretty, diffable, loadable |
| `data.js` | generated wrapper (`window.SKYISLAND_DATA = …`) mirroring `data.json`, loaded by the app so it works from `file://` |
| `build/extract.py` | regenerates `data.json` + `data.js` from the mod's JSON |
| `build/smoke.js` | headless DOM smoke test for `app.js` |

`data.json` is the source of truth (human-readable, easy to diff when the mod
updates); `data.js` is byte-for-byte the same payload wrapped in a global so the
page can load it without a web server (`fetch()` is blocked on `file://`). Both
are regenerated together — never edit them by hand.

## Rebuilding the data

`data.json` / `data.js` are generated from the mod source. If the mod updates,
regenerate them:

```bash
python3 build/extract.py     # reads data/mods/Sky_Island, writes data.json + data.js
node build/smoke.js          # optional: verify app.js still works end-to-end
```

The extractor:

- joins each upgrade's `mission_definition` + upgrade-key `ITEM` + `recipe`;
- resolves item / tool-quality display names (and English-default plurals) and
  in-game descriptions from the base CDDA data + the mod, falling back to a
  prettified id when a name can't be found;
- recursively expands `requirement` objects referenced via `LIST` (counts
  multiply through nesting) to build the hover tooltips.

The CDDA repo path is hard-coded near the top of `build/extract.py` — adjust
`CDDA` if yours differs.

## Not yet covered

Repeatable key-item crafts (things you make more than once — warped bags,
homeward motes, infinity sources, etc.) are out of scope for this first version;
it focuses on the one-time upgrade unlocks.
