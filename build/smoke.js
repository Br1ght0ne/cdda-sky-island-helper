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
    insertBefore(c, ref) {
      const i = this.children.indexOf(ref);
      if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e || { stopPropagation() {} })); },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    querySelector() { return null; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; },
    select() {},
    focus() {},
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
["list","search","search-clear","hide-done","only-plan","clear-plan","shopping","plan-hint","stats","foot"]
  .forEach(id => { registry[id] = mkEl(id === "search" ? "input" : id === "search-clear" ? "button" : "div"); registry[id].value = ""; registry[id].checked = false; });
const toolbar = mkEl("div");

// Static #toolbar-actions layout from index.html: a checkbox group placeholder
// followed by #main-actions, wired up front (not built by app.js) so
// insertBefore(viewGroup, mainActions) lands in the right spot, same as
// the real DOM.
const toolbarActionsEl = mkEl("div");
const mainActionsEl = mkEl("div");
toolbarActionsEl.children = [mkEl("div"), mainActionsEl];
registry["toolbar-actions"] = toolbarActionsEl;
registry["main-actions"] = mainActionsEl;

// Static theme-toggle buttons from index.html (not built by app.js, so the
// shim fabricates them the same way it fakes ".toolbar" via querySelector).
const themeButtons = ["auto", "light", "dark"].map(choice => {
  const b = mkEl("button");
  b.dataset.themeChoice = choice;
  return b;
});
const themeToggle = mkEl("div");
themeToggle.children = themeButtons;
registry["theme-toggle"] = themeToggle;

global.document = {
  getElementById: getEl,
  querySelector: sel => sel === ".toolbar" ? toolbar : null,
  querySelectorAll: sel => sel === "#theme-toggle .theme-btn" ? themeButtons : [],
  createElement: mkEl,
  createTextNode: t => ({ nodeType: 3, textContent: t, _text: t }),
  body: mkEl("body"),
  documentElement: { clientWidth: 1000, dataset: {} },
  addEventListener: () => {},
  execCommand: () => true,
};
const storeBacking = {};
global.localStorage = {
  getItem: k => (k in storeBacking ? storeBacking[k] : null),
  setItem: (k, v) => { storeBacking[k] = String(v); },
  removeItem: k => { delete storeBacking[k]; },
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
const actions = registry["toolbar-actions"]; // Expand/Collapse live here
const headerActions = registry["main-actions"]; // Export/Import/Import Save/Reset live here (sticky toolbar)
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

// Plan footer: shows once something is planned, with an "X/Y ready" summary
// (nothing gathered yet, so 0 are ready).
const planFooter = registry["plan-footer"];
const planFooterSummary = registry["plan-footer-summary"];
const plannedCount = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length;
assert(planFooter.hidden === false && planFooterSummary.textContent === "0/" + plannedCount + " ready",
  "plan footer shows the ready/planned count once something is planned");

// Toolbar order: checkboxes, then Expand/Collapse, then the main action
// buttons (pushed right), with Reset last of those.
const viewGroupIdx = actions.children.findIndex(c => findByText(c, "Expand all"));
const mainActionsIdx = actions.children.indexOf(registry["main-actions"]);
assert(viewGroupIdx !== -1 && viewGroupIdx < mainActionsIdx,
  "Expand/Collapse group sits to the left of the main action buttons");
assert(registry["main-actions"].children[registry["main-actions"].children.length - 1]._text === "Reset",
  "Reset is the rightmost main action button");

// Expand all / Collapse all — now also affects collapsible sections
const expandAll = findByText(actions, "Expand all");
const collapseAll = findByText(actions, "Collapse all");
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

// Check a "have" checkbox inside first card. (The very first checkbox in the
// list is actually rank-up #1's own "Mark complete" checkbox — its doneWrap
// is appended before its body's requirement rows — so this also exercises
// the "done" path.)
const checkboxes = [];
(function walk(n){ if(n.tagName==="input" && n.type==="checkbox") checkboxes.push(n); (n.children||[]).forEach(walk); })(list);
assert(checkboxes.length > 0, "requirement checkboxes rendered (" + checkboxes.length + ")");
const reqCb = checkboxes.find(c => c._listeners.change);
const planBeforeReq = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length;
reqCb.checked = true; reqCb.dispatch("change");
const st = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(st.have && Object.keys(st.have).length >= 1 || st.done && Object.keys(st.done).length >= 1, "checking an item persists");
assert(Object.keys(st.plan).length === planBeforeReq - 1,
  "marking a one-shot upgrade complete drops it from the plan immediately (no Remove finished step)");

// Bug fix regression: planned/done are mutually exclusive both ways — just
// as marking done auto-unplans, re-planning a done-but-unplanned upgrade
// must clear its done status (stale button reference is fine: it still
// mutates the real `state` object, which is all these listeners touch).
assert(Object.keys(st.done).length >= 1, "sanity: rank-up #1 is currently done");
planButtons[0].dispatch("click");
const afterReplan = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(Object.keys(afterReplan.done).length === 0, "re-planning a done upgrade clears its done status");
assert(Object.keys(afterReplan.plan).length === planBeforeReq, "and adds it back to the plan");

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
const searchClearEl = registry["search-clear"];
searchEl.value = "boiling"; searchEl.dispatch("input");
assert(countCards() > 0, "search matches tool qualities");
assert(searchClearEl.hidden === false, "clear button shows once search has text");
searchClearEl.dispatch("click");
assert(searchEl.value === "", "clicking clear button empties the search input");
assert(searchClearEl.hidden === true, "clear button hides once search is empty");

// Mobile Plan bottom sheet: handle toggles the panel open/closed
const planHandle = registry["plan-handle"];
const planPanel = registry["plan-panel"];
assert(!!planHandle && planHandle._listeners.click, "plan sheet handle is wired");
planHandle.dispatch("click");
assert(/\bopen\b/.test(planPanel.className), "tapping the handle opens the plan sheet");
planHandle.dispatch("click");
assert(!/\bopen\b/.test(planPanel.className), "tapping again closes the plan sheet");

// Export copies JSON to clipboard
const expBtn = headerActions.children.find(c => c._text === "Export");
assert(!!expBtn, "Export button added to toolbar");
expBtn.dispatch("click");
setTimeout(() => {
  assert(clipboard.length > 0 && JSON.parse(clipboard), "export wrote valid JSON to clipboard");
  // Import
  promptReturn = JSON.stringify({ plan: { "SKYISLAND_UPGRADE_landing1": true }, done: {}, have: {}, open: {} });
  const impBtn = headerActions.children.find(c => c._text === "Import");
  impBtn.dispatch("click");
  const after = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(after.plan["SKYISLAND_UPGRADE_landing1"] === true, "import replaced state from JSON");

  // Import Save reads a master.gsav, matching mission type_id -> upgrade id
  const impSaveBtn = headerActions.children.find(c => c._text === "Import Save");
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
  const resetBtn = headerActions.children.find(c => c._text === "Reset");
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
  const impBtn2 = headerActions.children.find(c => c._text === "Import");
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

  // ---- Plan footer: complete/craft ready upgrades right from the sidebar ---
  const planReadyList = registry["plan-ready-list"];

  // A ready + planned repeatable craft shows up with its own Craft button;
  // pressing it tallies the same as the card's, and stays planned (you keep
  // crafting more of a repeatable, so it's never auto-removed).
  promptReturn = JSON.stringify({ done: {}, plan: { [tree.id]: true }, have: haveAll, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  const footerCraftBtn = (planReadyList.children || []).map(row => (row.children || []).find(c => c.tagName === "button")).find(Boolean);
  assert(!!footerCraftBtn, "ready repeatable craft appears in the plan footer with a Craft button");
  footerCraftBtn.dispatch("click");
  const afterFooterCraft = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert((afterFooterCraft.crafted[tree.id] || 0) === 1, "crafting from the plan footer tallies the same as the card");
  assert(!!afterFooterCraft.plan[tree.id], "a repeatable craft stays planned after crafting from the footer");

  // A ready + planned one-shot upgrade shows a checkbox instead; checking it
  // marks it done AND immediately drops it from the plan — there's no
  // separate "Remove finished" step anymore.
  const oneShot = window.SKYISLAND_DATA.upgrades.find(u => !u.repeatable && u.components.length > 0);
  assert(!!oneShot, "found a non-repeatable upgrade with components to test the footer checkbox");
  const oneShotHave = {};
  oneShot.components.forEach((_alts, gi) => { oneShotHave[oneShot.id + "::comp::" + gi] = true; });
  oneShot.tools.forEach((_t, i) => { oneShotHave[oneShot.id + "::tool::" + i] = true; });
  const oneShotQualHave = {};
  oneShot.qualities.forEach(q => { oneShotQualHave[q.id + "::" + q.level] = true; });
  promptReturn = JSON.stringify({ done: {}, plan: { [oneShot.id]: true }, have: oneShotHave, qty: {}, tools: oneShotQualHave, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  const footerCheck = (planReadyList.children || []).map(row => (row.children || []).find(c => c.tagName === "input")).find(Boolean);
  assert(!!footerCheck, "ready one-shot upgrade appears in the plan footer with a checkbox");
  footerCheck.checked = true; footerCheck.dispatch("change");
  const afterFooterDone = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(afterFooterDone.done[oneShot.id] === true, "checking the footer checkbox marks the upgrade done");
  assert(!afterFooterDone.plan[oneShot.id], "and immediately drops it from the plan");

  // Warp shards are folded into the plan's normal material rows (checkbox +
  // pinned first), but the "from" line still surfaces the running
  // gathered/total tally since that's the one thing the binary met/unmet
  // count above can't show.
  function textOf(n) {
    if (n.nodeType === 3) return n._text || "";
    if (n.children && n.children.length) return n.children.map(textOf).join("");
    return n._text || n.textContent || "";
  }
  const shardUp = window.SKYISLAND_DATA.upgrades.find(u =>
    u.components.some(alts => alts.length === 1 && alts[0].id === "warptoken" && alts[0].count >= 2));
  assert(!!shardUp, "found an upgrade with a multi-shard requirement to test partial progress");
  const shardGi = shardUp.components.findIndex(alts => alts.length === 1 && alts[0].id === "warptoken" && alts[0].count >= 2);
  const shardQtyKey = shardUp.id + "::comp::" + shardGi + "::warptoken";
  promptReturn = JSON.stringify({ done: {}, plan: { [shardUp.id]: true }, have: {}, qty: { [shardQtyKey]: 1 }, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  const shardRow = (function findShardRow(n) {
    if (typeof n.className === "string" && n.className.split(" ").includes("shard")) return n;
    for (const c of n.children || []) { const r = findShardRow(c); if (r) return r; }
    return null;
  })(shopping);
  assert(!!shardRow, "shard row renders once a shard-only upgrade is planned");
  const shardRowCb = (shardRow.children || []).find(c => c.tagName === "input");
  assert(!!shardRowCb, "shard row has a checkbox like other plan materials");
  const shardCount = shardUp.components[shardGi][0].count;
  const shardRowText = textOf(shardRow);
  assert(shardRowText.indexOf("1/" + shardCount + " gathered") >= 0,
    "gathering 1 of " + shardCount + " shards shows partial progress (" + shardRowText + ")");
  assert(shopping.children.indexOf(shardRow) === 0, "shard row is pinned first in the plan panel");
  shardRowCb.checked = true; shardRowCb.dispatch("change");
  const afterShardCheck = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(afterShardCheck.have[shardUp.id + "::comp::" + shardGi] === true,
    "checking the shard row marks the group met just like other plan materials");

  // ---- ordered upgrade chains: Rank Up 1 must finish before Rank Up 2 -----
  function doneCbOf(card) {
    return (function walk(n) {
      if (n.tagName === "input" && n.type === "checkbox") return n;
      for (const c of n.children || []) { const r = walk(c); if (r) return r; }
      return null;
    })(card);
  }
  const rank1 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_UPGRADE_rankup1");
  const rank2 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_UPGRADE_rankup2");
  assert(!!rank1 && !!rank2, "rank-up 1 and 2 both extracted");
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: { [rank1.id]: true, [rank2.id]: true }, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.value = ""; searchEl.dispatch("input");
  let rank1Card = findCardByName(rank1.name);
  let rank2Card = findCardByName(rank2.name);
  assert(!!rank1Card && !!rank2Card, "rank-up 1 and 2 cards rendered");
  let rank2Done = doneCbOf(rank2Card);
  assert(!!rank2Done && rank2Done.disabled === true, "rank-up 2 is chain-locked until rank-up 1 is done");
  // Defensive guard: forcing the change event anyway must not mark it done.
  rank2Done.checked = true; rank2Done.dispatch("change");
  const afterLockedAttempt = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(!afterLockedAttempt.done[rank2.id], "checking a chain-locked upgrade is ignored");
  // Complete rank-up 1; rank-up 2 should unlock on the next render.
  const rank1Done = doneCbOf(rank1Card);
  rank1Done.checked = true; rank1Done.dispatch("change");
  rank2Card = findCardByName(rank2.name);
  rank2Done = doneCbOf(rank2Card);
  assert(rank2Done.disabled === false, "rank-up 2 unlocks once rank-up 1 is marked done");

  // ---- cross-family construction prerequisites (Main Room -> West Room, etc.) ---
  // These come from the mod's own NPC dialogue conditions (dialog_statue.json),
  // not from the id-prefix heuristic above, since e.g. "bigroom" and
  // "westroom" don't share a prefix.
  const base1 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_base1");
  const bigroom1 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_bigroom1");
  const bigroom2 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_bigroom2");
  const bigroom3 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_bigroom3");
  const skylight2 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_centralskylight2");
  const westroom3 = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_westroom3");
  const westSide = window.SKYISLAND_DATA.upgrades.find(u => u.id === "SKYISLAND_BUILD_west_side_rooms");
  assert([base1, bigroom1, bigroom2, bigroom3, skylight2, westroom3, westSide].every(Boolean),
    "construction chain upgrades all extracted");

  // Main Room 1 is locked behind Bunker Entrance despite the different id prefix.
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.value = ""; searchEl.dispatch("input");
  const bigroom1Done = doneCbOf(findCardByName(bigroom1.name));
  assert(bigroom1Done.disabled === true, "Main Room 1 is locked until Bunker Entrance is done");

  // Central Skylight 2 needs Main Room 2 specifically, not Main Room 1 — the
  // exact case that prompted this feature (it doesn't come with Main Room 1).
  promptReturn = JSON.stringify({ done: { [base1.id]: true, [bigroom1.id]: true }, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  let skylight2Done = doneCbOf(findCardByName(skylight2.name));
  assert(skylight2Done.disabled === true, "Central Skylight 2 stays locked with only Main Room 1 done (it needs Main Room 2)");

  promptReturn = JSON.stringify({ done: { [base1.id]: true, [bigroom1.id]: true, [bigroom2.id]: true }, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  skylight2Done = doneCbOf(findCardByName(skylight2.name));
  assert(skylight2Done.disabled === false, "Central Skylight 2 unlocks once Main Room 2 is done");

  // West Side Rooms needs BOTH West Room 3 and Main Room 3 (a two-requirement
  // lock) — doing only one of the two must not unlock it.
  promptReturn = JSON.stringify({ done: { [bigroom3.id]: true }, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  let westSideDone = doneCbOf(findCardByName(westSide.name));
  assert(westSideDone.disabled === true, "West Side Rooms stays locked with only Main Room 3 done (also needs West Room 3)");

  promptReturn = JSON.stringify({ done: { [bigroom3.id]: true, [westroom3.id]: true }, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.dispatch("input");
  westSideDone = doneCbOf(findCardByName(westSide.name));
  assert(westSideDone.disabled === false, "West Side Rooms unlocks once both Main Room 3 and West Room 3 are done");

  // ---- theme toggle ---------------------------------------------------
  const [autoBtn, lightBtn, darkBtn] = themeButtons;
  assert(autoBtn.getAttribute("aria-pressed") === "true", "theme toggle starts on Auto");
  lightBtn.dispatch("click");
  assert(global.document.documentElement.dataset.theme === "light", "clicking Light sets data-theme=light");
  assert(storeBacking["skyisland.theme"] === "light", "Light choice persists to localStorage");
  assert(lightBtn.getAttribute("aria-pressed") === "true" && autoBtn.getAttribute("aria-pressed") === "false",
    "aria-pressed follows the active theme button");
  darkBtn.dispatch("click");
  assert(global.document.documentElement.dataset.theme === "dark", "clicking Dark sets data-theme=dark");
  autoBtn.dispatch("click");
  assert(!("theme" in global.document.documentElement.dataset), "clicking Auto clears data-theme");
  assert(!("skyisland.theme" in storeBacking), "Auto choice clears the persisted theme");

  console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nAll smoke checks passed");
}, 10);
