// Minimal DOM shim to smoke-test app.js under node (no jsdom).
const fs = require("fs");
const path = require("path");
const ROOT = path.dirname(__dirname);

function mkEl(tag) {
  return {
    tagName: tag, children: [], _listeners: {}, style: {}, dataset: {}, _attrs: {},
    className: "", _text: "", _html: "",
    set textContent(v) { this._text = v; this.children = []; },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e || { stopPropagation() {} })); },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    querySelector() { return null; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; },
    select() {},
    click() { this.dispatch("click"); },
  };
}

// Fake File objects carry their content in `_text`; readAsText hands it back
// synchronously via onload, matching how app.js consumes it.
global.FileReader = function () {
  this.readAsText = file => { this.result = file._text; if (this.onload) this.onload(); };
};

const registry = {};
function getEl(id) { return registry[id] || (registry[id] = mkEl("div")); }

// Pre-create the elements index.html references by id.
["list","search","hide-done","only-plan","clear-plan","shopping","plan-hint","stats","foot"]
  .forEach(id => { registry[id] = mkEl(id === "search" ? "input" : "div"); registry[id].value = ""; registry[id].checked = false; });
const toolbar = mkEl("div");

global.document = {
  getElementById: getEl,
  querySelector: sel => sel === ".toolbar" ? toolbar : null,
  createElement: mkEl,
  createTextNode: t => ({ nodeType: 3, textContent: t, _text: t }),
  body: mkEl("body"),
  documentElement: { clientWidth: 1000 },
  addEventListener: () => {},
  execCommand: () => true,
};
const storeBacking = {};
global.localStorage = {
  getItem: k => (k in storeBacking ? storeBacking[k] : null),
  setItem: (k, v) => { storeBacking[k] = String(v); },
};
let clipboard = "";
// Node 21+ ships a read-only `navigator` global; override it forcibly.
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: t => { clipboard = t; return Promise.resolve(); } } },
  configurable: true, writable: true,
});
global.alert = () => {};
global.confirm = () => true;
let promptReturn = null;
global.prompt = () => promptReturn;
global.window = { scrollX: 0, scrollY: 0 };

require(path.join(ROOT, "data.js"));
require(path.join(ROOT, "app.js"));

// ---- assertions ----
function assert(c, m) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  -", m); }

const list = registry["list"];
const actions = registry["toolbar-actions"]; // Expand/Collapse/Export/Import/Reset live here now
assert(list.children.length > 0, "list rendered group/category/card nodes");

// find first upgrade card's plan button and click it (Island Rank Up 1)
// locate a card by walking children
function findByText(node, text) {
  if (node._text === text) return node;
  for (const c of node.children || []) { const r = findByText(c, text); if (r) return r; }
  return null;
}
const planButtons = [];
(function walk(n){ if(n.tagName==="button" && /Plan/.test(n._text)) planButtons.push(n); (n.children||[]).forEach(walk); })(list);
assert(planButtons.length > 0, "plan buttons exist (" + planButtons.length + ")");

// Plan the first two rank-ups (warp-shard only) plus a component-rich upgrade
// (index 2 = "Construct: Climate Control") so the shopping list has real lines.
planButtons[0].dispatch("click");
planButtons[1] && planButtons[1].dispatch("click");
planButtons[2] && planButtons[2].dispatch("click");
assert(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan && Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length >= 1, "planning persists to localStorage");

// Expand all / Collapse all — now also affects collapsible sections
const expandAll = actions.children.find(c => c._text === "Expand all");
const collapseAll = actions.children.find(c => c._text === "Collapse all");
assert(!!expandAll && !!collapseAll, "Expand all / Collapse all buttons present");
const countCards = () => { let n=0; (function w(x){ if(typeof x.className==="string" && (x.className==="card"||x.className.indexOf("card ")===0)) n++; (x.children||[]).forEach(w); })(list); return n; };
const countHeads = () => { let n=0; (function w(x){ if(typeof x.className==="string" && x.className.indexOf("group-head")===0) n++; (x.children||[]).forEach(w); })(list); return n; };
expandAll.dispatch("click");
let es = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(Object.keys(es.open).length === window.SKYISLAND_DATA.upgrades.length && Object.keys(es.groupsCollapsed || {}).length === 0, "expand all opens every section + upgrade (" + window.SKYISLAND_DATA.upgrades.length + ")");
collapseAll.dispatch("click");
es = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(Object.keys(es.open).length === 0, "collapse all closes every upgrade");
assert(Object.keys(es.groupsCollapsed || {}).length >= 5, "collapse all collapses every section");
assert(countCards() === 0 && countHeads() >= 5, "collapsed sections hide cards but keep section names");
expandAll.dispatch("click"); // restore full render for the remaining checks

const shopping = registry["shopping"];
assert(shopping.children.length > 0 || shopping._html !== "", "shopping list populated after planning");

// Check a "have" checkbox inside first card
const checkboxes = [];
(function walk(n){ if(n.tagName==="input" && n.type==="checkbox") checkboxes.push(n); (n.children||[]).forEach(walk); })(list);
assert(checkboxes.length > 0, "requirement checkboxes rendered (" + checkboxes.length + ")");
const reqCb = checkboxes.find(c => c._listeners.change);
reqCb.checked = true; reqCb.dispatch("change");
const st = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(st.have && Object.keys(st.have).length >= 1 || st.done && Object.keys(st.done).length >= 1, "checking an item persists");

// Per-alternative +/- steppers track quantities in state.qty
const stepPlus = [];
(function walk(n){ if(n.tagName==="button" && n.className==="step" && n._text==="+") stepPlus.push(n); (n.children||[]).forEach(walk); })(list);
assert(stepPlus.length > 0, "quantity steppers rendered (" + stepPlus.length + " + buttons)");
stepPlus[0].dispatch("click");
assert(Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).qty || {}).length >= 1, "stepping + records a tracked quantity");

// The shopping list checkbox writes the same state the cards read.
const shopChecks = [];
(function walk(n){ if(n.tagName==="input" && n.className==="shop-check") shopChecks.push(n); (n.children||[]).forEach(walk); })(shopping);
assert(shopChecks.length > 0, "shopping list rows have checkboxes (" + shopChecks.length + ")");
const haveBefore = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).have || {}).length;
shopChecks[0].checked = true; shopChecks[0].dispatch("change");
assert(Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).have).length > haveBefore, "ticking a shopping line marks its contributing groups met");

// Tool qualities are a GLOBAL registry: ticking one syncs everywhere.
const qualRows = () => { const r=[]; (function w(n){ if(n.tagName==="div" && typeof n.className==="string" && n.className.indexOf("req qual")===0) r.push(n); (n.children||[]).forEach(w); })(list); return r; };
const qidOf = row => { let id=null; (function w(n){ if(id) return; if(n.tagName==="a" && n.href && n.href.indexOf("/tool_quality/")>=0) id=n.href.split("/tool_quality/")[1]; (n.children||[]).forEach(w); })(row); return id; };
const cbOf = row => (row.children||[]).find(c => c.tagName==="input");
let qrows = qualRows();
assert(qrows.length > 0, "tool-quality rows rendered (" + qrows.length + ")");
const byQ = {}; qrows.forEach(r => { const q=qidOf(r); (byQ[q]=byQ[q]||[]).push(r); });
const sharedQ = Object.keys(byQ).find(q => byQ[q].length >= 2);
assert(!!sharedQ, "a tool quality is shared by multiple upgrades (" + sharedQ + " ×" + (sharedQ?byQ[sharedQ].length:0) + ")");
cbOf(byQ[sharedQ][0]).checked = true; cbOf(byQ[sharedQ][0]).dispatch("change");
assert(Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).tools || {}).length >= 1, "owning a quality persists to global state.tools");
assert(qualRows().filter(r => qidOf(r)===sharedQ).every(r => cbOf(r).checked === true), "checking a quality syncs to every upgrade that needs it");
// Quality example items sourced from the game data
const qi = window.SKYISLAND_DATA.quality_items || {};
assert(Object.keys(qi).length > 0 && qi["HAMMER::2"] && qi["HAMMER::2"].examples.length > 0 && qi["HAMMER::2"].total >= qi["HAMMER::2"].examples.length,
  "quality_items provides example tools + total count");
const egRow = qualRows().find(r => { let has=false; (function w(n){ if(typeof n.className==="string" && n.className==="quality-egs") has=true; (n.children||[]).forEach(w); })(r); return has; });
assert(!!egRow, "quality rows display example items inline");

// Guide links: item + tool_quality namespaces, and text is a span, not a label.
const anchors = [];
(function walk(n){ if(n.tagName==="a" && n.href) anchors.push(n); (n.children||[]).forEach(walk); })(list);
assert(anchors.some(a => a.href.includes("/item/")), "item links point to /item/");
assert(anchors.some(a => a.href.includes("/tool_quality/")), "quality links point to /tool_quality/");
assert(anchors.every(a => a.target === "_blank" && /noopener/.test(a.rel || "")), "links open safely in a new tab");
let labels = 0;
(function walk(n){ if(n.tagName==="label" && n.htmlFor) labels++; (n.children||[]).forEach(walk); })(list);
assert(labels === 0, "requirement rows no longer use click-to-toggle labels");

// Tooltips: only item-group (LIST) refs carry a data-tip, and it's the expansion.
const tipped = [];
(function walk(n){ const t=n.getAttribute&&n.getAttribute("data-tip"); if(t) tipped.push(n); (n.children||[]).forEach(walk); })(list);
assert(tipped.length > 0 && tipped.every(n => n.tagName==="span"), "only LIST refs carry tooltips (no item/quality descriptions)");
assert(tipped.some(n => /OR/.test(n.getAttribute("data-tip"))), "LIST refs render an expansion tooltip");
assert(tipped.some(n => Array.isArray(n._tipItems) && n._tipItems[0] && n._tipItems[0].id && n._tipItems[0].label),
  "LIST refs carry structured expansion for in-tooltip links");

// Search matches tool qualities (e.g. "boiling" = the BOIL quality)
const searchEl = registry["search"];
searchEl.value = "boiling"; searchEl.dispatch("input");
assert(countCards() > 0, "search matches tool qualities");
searchEl.value = ""; searchEl.dispatch("input"); // reset filter

// Mobile Plan bottom sheet: handle toggles the panel open/closed
const planHandle = registry["plan-handle"];
const planPanel = registry["plan-panel"];
assert(!!planHandle && planHandle._listeners.click, "plan sheet handle is wired");
planHandle.dispatch("click");
assert(/\bopen\b/.test(planPanel.className), "tapping the handle opens the plan sheet");
planHandle.dispatch("click");
assert(!/\bopen\b/.test(planPanel.className), "tapping again closes the plan sheet");

// Remove finished from plan: rank-up #1 was planned and marked done earlier,
// so it should be dropped from the plan (checked before import replaces state).
const planBeforeRm = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length;
const rmFin = registry["remove-finished"]; // now lives in the Plan panel, not the toolbar
assert(!!rmFin && rmFin._listeners.click, "Remove finished button wired in plan panel");
rmFin.dispatch("click");
assert(Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length < planBeforeRm,
  "remove finished drops completed upgrades from the plan");

// Export copies JSON to clipboard
const expBtn = actions.children.find(c => c._text === "Export");
assert(!!expBtn, "Export button added to toolbar");
expBtn.dispatch("click");
setTimeout(() => {
  assert(clipboard.length > 0 && JSON.parse(clipboard), "export wrote valid JSON to clipboard");
  // Import
  promptReturn = JSON.stringify({ plan: { "SKYISLAND_UPGRADE_landing1": true }, done: {}, have: {}, open: {} });
  const impBtn = actions.children.find(c => c._text === "Import");
  impBtn.dispatch("click");
  const after = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(after.plan["SKYISLAND_UPGRADE_landing1"] === true, "import replaced state from JSON");

  // Import Save reads a master.gsav, matching mission type_id -> upgrade id
  const impSaveBtn = actions.children.find(c => c._text === "Import Save");
  assert(!!impSaveBtn, "Import Save button added to toolbar");
  const gsav = "# version 39\n" + JSON.stringify({
    active_missions: [
      { type_id: "SKYISLAND_UPGRADE_landing1", status: "success" },
      { type_id: "SKYISLAND_UPGRADE_exit1", status: "in_progress" },
      { type_id: "BOGUS_MISSION_NOT_IN_DATA", status: "success" },
    ],
  });
  const fileInput = registry["import-save-file"];
  fileInput.files = [{ _text: gsav }];
  fileInput.dispatch("change");
  const afterSaveImport = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(afterSaveImport.done["SKYISLAND_UPGRADE_landing1"] === true,
    "Import Save marks a mission with status success as done");
  assert(!afterSaveImport.done["SKYISLAND_UPGRADE_exit1"],
    "Import Save leaves in_progress missions untouched");

  // Reset wipes everything
  global.confirm = () => true;
  const resetBtn = actions.children.find(c => c._text === "Reset");
  assert(!!resetBtn, "Reset button present");
  resetBtn.dispatch("click");
  const cleared = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(Object.keys(cleared.plan).length === 0 && Object.keys(cleared.have).length === 0 &&
         Object.keys(cleared.done).length === 0, "reset clears all progress");

  // Repeatable key-item crafts: Craft button is disabled until all ingredient
  // groups are met; pressing it tallies +1 crafted and clears have/qty for that
  // upgrade; global tool qualities survive; the Crafted:N tag appears.
  const tree = window.SKYISLAND_DATA.upgrades.find(u => u.id === "craft:warp_folded_infinitree");
  assert(!!tree && tree.repeatable === true, "repeatable craft extracted (infinity tree sapling)");
  // Building a fresh isolated state so the craft assertions don't depend on the
  // rest of the run's mutations. State only ever changes via app.js's own entry
  // points (Import replaces `state` via Object.assign(blankState(), parsed) then
  // renders+saves) — writing straight to the mock localStorage backing store
  // would NOT reach the in-memory `state` object app.js actually reads from.
  const impBtn2 = actions.children.find(c => c._text === "Import");
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: { [tree.id]: true }, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.value = ""; searchEl.dispatch("input");
  // find the tree's card: a "card" container (not "card-title"/"card-done"/etc,
  // same exact-match convention as countCards() above) whose text includes tree.name
  function findCardByName(name) {
    const cards = [];
    (function walk(n){ if (typeof n.className === "string" && (n.className === "card" || n.className.indexOf("card ") === 0)) cards.push(n); (n.children || []).forEach(walk); })(list);
    return cards.find(c => (function walk2(n){
      if (n._text && n._text.indexOf(name) >= 0) return true;
      for (const ch of n.children || []) if (walk2(ch)) return true;
      return false;
    })(c));
  }
  let treeCard = findCardByName(tree.name);
  assert(!!treeCard, "infinity tree card rendered");
  const craftBtnOf = card => (function walk(n){ if(n.tagName==="button" && n.className && n.className.indexOf("craft-btn")===0) return n; for(const c of n.children||[]){const r=walk(c); if(r) return r;} return null; })(card);
  let craftBtn = craftBtnOf(treeCard);
  assert(!!craftBtn, "tree card has a Craft button");
  assert(craftBtn.disabled === true, "Craft button disabled before ingredients met");
  // Met every component group via the have-flag (set state.have for each group),
  // fed back in through another Import so app.js's own `state` picks it up.
  const haveAll = {};
  tree.components.forEach((_alts, gi) => { haveAll[tree.id + "::comp::" + gi] = true; });
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: haveAll, qty: {}, tools: {}, open: { [tree.id]: true }, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
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

  console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nAll smoke checks passed");
}, 10);
