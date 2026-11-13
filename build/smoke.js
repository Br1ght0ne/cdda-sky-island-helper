// @ts-nocheck
// Minimal DOM shim to smoke-test app.js under node (no jsdom).
const path = require("path");
const originalTimeout = global.setTimeout;
let toastExpiry;
global.setTimeout = (fn, ms, ...args) => { if (ms === 3500) toastExpiry = fn; return originalTimeout(fn, ms, ...args); };
const ROOT = path.dirname(__dirname);

function descendants(root) { return (root.children || []).flatMap(n => [n, ...descendants(n)]); }
function matchesSelector(n, selector) {
  return selector.split(",").some(part => {
    const sel = part.trim();
    if (sel.startsWith("#")) return n.id === sel.slice(1);
    if (sel.startsWith(".")) return (n.className || "").split(" ").includes(sel.slice(1));
    const attr = /^\[([^=\]]+)(?:="([^"\]]*)")?\]$/.exec(sel);
    if (attr) return n.getAttribute && n.getAttribute(attr[1]) !== null && (attr[2] === undefined || n.getAttribute(attr[1]) === attr[2]);
    return n.tagName === sel;
  });
}
function mkEl(tag) {
  return {
    tagName: tag, children: [], _listeners: {}, style: {}, dataset: {}, _attrs: {},
    className: "", _text: "", _html: "",
    set textContent(v) { this._text = v; this.children = []; },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    append(...args) { args.forEach(c => { if (c.parentElement) c.parentElement.removeChild(c); this.children.push(c); if (typeof c === "object") c.parentElement = this; }); },
    replaceChildren(...args) { this.children.forEach(c => { c.parentElement = null; }); this.children = []; this.append(...args); },
    insertBefore(c, ref) {
      const i = this.children.indexOf(ref);
      if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    remove() { /* no-op in shim — elements aren't parented */ },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e || { stopPropagation() {} })); },
    setAttribute(k, v) { this._attrs[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); },
    removeAttribute(k) { delete this._attrs[k]; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    get classList() {
      const el = this;
      return {
        add(cls) { if (!el.className.split(" ").includes(cls)) el.className = el.className ? el.className + " " + cls : cls; },
        remove(cls) { el.className = el.className.split(" ").filter(c => c !== cls).join(" "); },
        toggle(cls) { if (el.className.split(" ").includes(cls)) this.remove(cls); else this.add(cls); },
        contains(cls) { return el.className.split(" ").includes(cls); },
      };
    },
    closest(sel) { let n = this; while (n) { if (matchesSelector(n, sel)) return n; n = n.parentElement; } return null; },
    contains(n) { return n === this || descendants(this).includes(n); },
    querySelectorAll(sel) { return descendants(this).filter(n => matchesSelector(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    scrollIntoView() { this.scrolled = true; },
    getClientRects() { return [{}]; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0 }; },
    select() {},
    focus() { global.document.activeElement = this; },
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
["list","search","search-clear","hide-done","only-plan","show-xedra","clear-plan","shopping","plan-hint","stats","foot","toast"]
  .forEach(id => {
    let tag;
    if (id === "search") tag = "input";
    else if (["search-clear", "hide-done", "only-plan"].includes(id)) tag = "button";
    else tag = "div";
    registry[id] = mkEl(tag);
    registry[id].value = "";
    registry[id].checked = false;
  });
const toolbar = mkEl("div");

// Static #toolbar-actions layout from index.html: a checkbox group placeholder
// followed by #main-actions, wired up front (not built by app.js) so
// insertBefore(viewGroup, mainActions) lands in the right spot, same as
// the real DOM.
const toolbarActionsEl = mkEl("div");
const mainActionsEl = mkEl("div");
const progressMenu = mkEl("details"); progressMenu.append(mainActionsEl);
registry["progress-menu"] = progressMenu;
toolbarActionsEl.children = [mkEl("div"), getEl("undo-progress"), progressMenu];
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
  querySelector: sel => {
    if (sel === ".toolbar") return toolbar;
    if (sel.startsWith("#")) return getEl(sel.slice(1));
    return Object.values(registry).flatMap(n => [n, ...descendants(n)]).find(n => matchesSelector(n, sel)) || null;
    return null;
  },
  querySelectorAll: sel => sel === "#theme-toggle .theme-btn" ? themeButtons : [...new Set([...Object.values(registry).flatMap(n => [n, ...descendants(n)]), ...descendants(global.document.body)])].filter(n => matchesSelector(n, sel)),
  createElement: mkEl,
  createTextNode: t => ({ nodeType: 3, textContent: t, _text: t }),
  body: mkEl("body"),
  documentElement: { clientWidth: 1000, dataset: {} },
  _listeners: {},
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
  dispatch(ev, e) { (this._listeners[ev] || []).forEach(fn => fn(e)); },
  execCommand: () => true,
};
const storeBacking = {};
function getState() {
  try { return JSON.parse(storeBacking["skyisland.tracker.v1"]); }
  catch (e) { throw new Error("state JSON corrupted: " + e.message); }
}
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
const mobileMedia = { matches: true, listeners: [], addEventListener(_ev, fn) { this.listeners.push(fn); }, change(value) { this.matches = value; this.listeners.forEach(fn => fn(this)); } };
global.window = { scrollX: 0, scrollY: 0, matchMedia: q => q.includes("max-width") ? mobileMedia : { matches: false, addEventListener() {} } };
getEl("plan-panel").append(getEl("plan-handle"), getEl("plan-views"), getEl("plan-heading"), getEl("plan-scroll"));
getEl("plan-views").append(getEl("plan-view-all"), getEl("plan-view-raid"));
getEl("plan-scroll").append(getEl("plan-goals"), getEl("plan-ready-list"), getEl("shopping"));

require(path.join(ROOT, "data.js"));
require(path.join(ROOT, "app.js"));

// ---- assertions ----
function assert(c, m) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else process.stdout.write("ok  - " + m + "\n"); }

const list = registry["list"];
const actions = registry["toolbar-actions"]; // Expand/Collapse live here
const headerActions = registry["main-actions"]; // Export/Import/Import Save/Reset live here (sticky toolbar)
assert(list.children.length > 0, "list rendered group/category/card nodes");
const xedraToggle = registry["show-xedra"];
assert(xedraToggle.checked === false, "optional Xedra content starts off");

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
assert(getState().plan && Object.keys(getState().plan).length >= 1, "planning persists to localStorage");

// Plan ready badge: shows the x/y ready count in the header once something is planned.
const planFooterSummary = registry["plan-footer-summary"];
const plannedCount = Object.keys(getState().plan).length;
assert(planFooterSummary.textContent === "0/" + plannedCount + " ready",
  "plan ready badge shows the ready/planned count once something is planned");

// Toolbar order: checkboxes, then Expand/Collapse, then the main action
// buttons (pushed right), with Reset last of those.
const viewGroupIdx = actions.children.findIndex(c => findByText(c, "Expand all"));
const mainActionsIdx = actions.children.indexOf(registry["progress-menu"]);
assert(viewGroupIdx !== -1 && viewGroupIdx < mainActionsIdx,
  "Expand/Collapse group sits to the left of the main action buttons");
assert(registry["main-actions"].children.at(-1)._text === "Reset",
  "Reset is the rightmost main action button");

// Expand all / Collapse all — now also affects collapsible sections
const expandAll = findByText(actions, "Expand all");
const collapseAll = findByText(actions, "Collapse all");
assert(!!expandAll && !!collapseAll, "Expand all / Collapse all buttons present");
const countCards = () => { let n=0; (function w(x){ if(typeof x.className==="string" && (x.className==="card"||x.className.startsWith("card "))) n++; (x.children||[]).forEach(w); })(list); return n; };
const countHeads = () => { let n=0; (function w(x){ if(typeof x.className==="string" && x.className.startsWith("group-head")) n++; (x.children||[]).forEach(w); })(list); return n; };
expandAll.dispatch("click");
let es = getState();
assert(Object.keys(es.open).length === window.SKYISLAND_DATA.upgrades.length && Object.keys(es.groupsCollapsed || {}).length === 0, "expand all opens every section + upgrade (" + window.SKYISLAND_DATA.upgrades.length + ")");
collapseAll.dispatch("click");
es = getState();
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
const planBeforeReq = Object.keys(getState().plan).length;
reqCb.checked = true; reqCb.dispatch("change");
const st = getState();
assert(st.have && Object.keys(st.have).length >= 1 || st.done && Object.keys(st.done).length >= 1, "checking an item persists");
assert(Object.keys(st.plan).length === planBeforeReq - 1,
  "marking a one-shot upgrade complete drops it from the plan immediately (no Remove finished step)");

// Bug fix regression: planned/done are mutually exclusive both ways — just
// as marking done auto-unplans, re-planning a done-but-unplanned upgrade
// must clear its done status (stale button reference is fine: it still
// mutates the real `state` object, which is all these listeners touch).
assert(Object.keys(st.done).length >= 1, "sanity: rank-up #1 is currently done");
planButtons[0].dispatch("click");
const afterReplan = getState();
assert(Object.keys(afterReplan.done).length === 1, "planning cannot silently reopen a completed upgrade");
assert(Object.keys(afterReplan.plan).length === planBeforeReq - 1, "completed upgrade remains out of plan");
reqCb.checked = false; reqCb.dispatch("change");
planButtons[0].dispatch("click");

// Per-alternative +/- steppers track quantities in state.qty
const stepPlus = [];
(function walk(n){ if(n.tagName==="button" && n.className==="step" && n._text==="+") stepPlus.push(n); (n.children||[]).forEach(walk); })(list);
assert(stepPlus.length > 0, "quantity steppers rendered (" + stepPlus.length + " + buttons)");
stepPlus[0].dispatch("click");
assert(Object.keys(getState().qty || {}).length >= 1, "stepping + records a tracked quantity");

// The shopping list checkbox writes the same state the cards read.
const shopChecks = [];
(function walk(n){ if(n.tagName==="input" && n.className==="shop-check") shopChecks.push(n); (n.children||[]).forEach(walk); })(shopping);
assert(shopChecks.length > 0, "shopping list rows have checkboxes (" + shopChecks.length + ")");
const haveBefore = Object.keys(getState().have || {}).length;
shopChecks[0].checked = true; shopChecks[0].dispatch("change");
assert(Object.keys(getState().have).length > haveBefore, "ticking a shopping line marks its contributing groups met");

// Tool qualities are a GLOBAL registry: ticking one syncs everywhere.
const qualRows = () => { const r=[]; (function w(n){ if(n.tagName==="div" && typeof n.className==="string" && n.className.startsWith("req qual")) r.push(n); (n.children||[]).forEach(w); })(list); return r; };
const qidOf = row => { let id=null; (function w(n){ if(id) return; if(n.tagName==="a" && n.href && n.href.includes("/tool_quality/")) id=n.href.split("/tool_quality/")[1]; (n.children||[]).forEach(w); })(row); return id; };
const cbOf = row => (row.children||[]).find(c => c.tagName==="input");
const qrows = qualRows();
assert(qrows.length > 0, "tool-quality rows rendered (" + qrows.length + ")");
const byQ = {}; qrows.forEach(r => { const q=qidOf(r); (byQ[q]=byQ[q]||[]).push(r); });
const sharedQ = Object.keys(byQ).find(q => byQ[q].length >= 2);
assert(!!sharedQ, "a tool quality is shared by multiple upgrades (" + sharedQ + " ×" + (sharedQ?byQ[sharedQ].length:0) + ")");
cbOf(byQ[sharedQ][0]).checked = true; cbOf(byQ[sharedQ][0]).dispatch("change");
assert(Object.keys(getState().tools || {}).length >= 1, "owning a quality persists to global state.tools");
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
assert(tipped.length > 0 && tipped.every(n => n.tagName==="button"), "only LIST refs carry tooltips (no item/quality descriptions)");
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
const expBtn = headerActions.children.find(c => c._text === "Export data");
assert(!!expBtn, "Export button added to toolbar");
expBtn.dispatch("click");
setTimeout(() => {
  assert(clipboard.length > 0 && JSON.parse(clipboard), "export wrote valid JSON to clipboard");
  // Import
  promptReturn = JSON.stringify({ plan: { "SKYISLAND_UPGRADE_landing1": true }, done: {}, have: {}, open: {} });
  const impBtn = headerActions.children.find(c => c._text === "Import data");
  impBtn.dispatch("click");
  const after = getState();
  assert(after.plan["SKYISLAND_UPGRADE_landing1"] === true, "import replaced state from JSON");

  // Import Save reads a master.gsav, matching mission type_id -> upgrade id
  const impSaveBtn = headerActions.children.find(c => c._text === "Import game save");
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
  const afterSaveImport = getState();
  assert(afterSaveImport.done["SKYISLAND_UPGRADE_landing1"] === true,
    "Import Save marks a mission with status success as done");
  assert(!afterSaveImport.done["SKYISLAND_UPGRADE_exit1"],
    "Import Save leaves in_progress missions untouched");

  // Reset wipes everything
  global.confirm = () => true;
  const resetBtn = headerActions.children.find(c => c._text === "Reset");
  assert(!!resetBtn, "Reset button present");
  resetBtn.dispatch("click");
  const cleared = getState();
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
  const impBtn2 = headerActions.children.find(c => c._text === "Import data");
  promptReturn = JSON.stringify({ done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: { [tree.id]: true }, crafted: {} });
  impBtn2.dispatch("click");
  searchEl.value = ""; searchEl.dispatch("input");
  // find the tree's card: a "card" container (not "card-title"/"card-done"/etc,
  // same exact-match convention as countCards() above) whose text includes tree.name
  function findCardByName(name) {
    const cards = [];
    (function walk(n){ if (typeof n.className === "string" && (n.className === "card" || n.className.startsWith("card "))) cards.push(n); (n.children || []).forEach(walk); })(list);
    return cards.find(c => (function walk2(n){
      if (n.className === "card-title" && n._text === name) return true;
      for (const ch of n.children || []) if (walk2(ch)) return true;
      return false;
    })(c));
  }
  let treeCard = findCardByName(tree.name);
  assert(!!treeCard, "infinity tree card rendered");
  const craftBtnOf = card => (function walk(n){ if(n.tagName==="button" && n.className && n.className.startsWith("craft-btn")) return n; for(const c of n.children||[]){const r=walk(c); if(r) return r;} return null; })(card);
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
  const ownQualBefore = Object.keys(getState().tools || {}).length;
  craftBtn.dispatch("click");
  const afterCraft = getState();
  assert((afterCraft.crafted[tree.id] || 0) === 1, "pressing Craft tallies crafted:1");
  assert(Object.keys(afterCraft.have).filter(k => k.startsWith(tree.id + "::comp::")).length === 0,
    "Craft clears the upgrade's have flags");
  assert(Object.keys(afterCraft.qty).filter(k => k.startsWith(tree.id + "::comp::")).length === 0,
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
  const afterFooterCraft = getState();
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
  const afterFooterDone = getState();
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
  assert(shardRowText.includes("1/" + shardCount + " gathered"),
    "gathering 1 of " + shardCount + " shards shows partial progress (" + shardRowText + ")");
  assert(shopping.children[0] === shardRow, "shard row is pinned first in the plan panel");
  shardRowCb.checked = true; shardRowCb.dispatch("change");
  const afterShardCheck = getState();
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
  const rank1Card = findCardByName(rank1.name);
  let rank2Card = findCardByName(rank2.name);
  assert(!!rank1Card && !!rank2Card, "rank-up 1 and 2 cards rendered");
  let rank2Done = doneCbOf(rank2Card);
  assert(!!rank2Done && rank2Done.disabled === true, "rank-up 2 is chain-locked until rank-up 1 is done");
  // Defensive guard: forcing the change event anyway must not mark it done.
  rank2Done.checked = true; rank2Done.dispatch("change");
  const afterLockedAttempt = getState();
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

  // Xedra upgrades are permanent unlocks, not repeatable crafts. Tier 4
  // unlocks both tier 5 and blood-gift research in the game.
  const xedra = ["upgradekey_vampire4", "upgradekey_vampire5", "upgradekey_bloodgift_research"]
    .map(id => window.SKYISLAND_DATA.upgrades.find(u => u.id === id));
  assert(xedra.every(Boolean), "all three Xedra Evolved upgrades extracted");
  if (xedra.every(Boolean)) {
    searchEl.value = ""; searchEl.dispatch("input");
    assert(!findCardByName(xedra[0].name), "Xedra cards are hidden with the toggle off");
    xedraToggle.checked = true; xedraToggle.dispatch("change");
    assert(!!findCardByName(xedra[0].name), "turning Xedra on reveals its cards");
    assert(getState().xedraEnabled === true, "Xedra choice persists in tracker state");
    assert(xedra.every(u => u.repeatable === false), "Xedra upgrades are one-shot unlocks");
    promptReturn = JSON.stringify({ xedraEnabled: true, done: {}, plan: {}, have: {}, qty: {}, tools: {}, open: {}, crafted: {} });
    impBtn2.dispatch("click");
    const [tier4, tier5, research] = xedra;
    assert(doneCbOf(findCardByName(tier5.name)).disabled === true, "vampire tier 5 requires tier 4");
    assert(doneCbOf(findCardByName(research.name)).disabled === true, "blood-gift research requires tier 4");
    const tier4Done = doneCbOf(findCardByName(tier4.name));
    tier4Done.checked = true; tier4Done.dispatch("change");
    for (const upgrade of [tier5, research]) {
      assert(doneCbOf(findCardByName(upgrade.name)).disabled === false, upgrade.name + " unlocks after tier 4");
    }
    for (const upgrade of xedra) {
      const have = {};
      upgrade.components.forEach((_alts, gi) => { have[upgrade.id + "::comp::" + gi] = true; });
      const prerequisites = upgrade === tier4 ? {} : { [tier4.id]: true };
      promptReturn = JSON.stringify({ xedraEnabled: true, done: prerequisites, plan: { [upgrade.id]: true }, have, qty: {}, tools: {}, open: {}, crafted: {} });
      impBtn2.dispatch("click");
      assert(!!findByText(planReadyList, upgrade.name), upgrade.name + " appears ready in the Plan");
      const done = doneCbOf(findCardByName(upgrade.name));
      done.checked = true; done.dispatch("change");
      const saved = getState();
      assert(saved.done[upgrade.id] && !saved.plan[upgrade.id] && !saved.crafted[upgrade.id],
        upgrade.name + " completes once and leaves the Plan without a craft tally");
    }
    const have = { [tier4.id + "::comp::0"]: true };
    promptReturn = JSON.stringify({ xedraEnabled: true, done: { [tier4.id]: true }, plan: { [research.id]: true }, have, qty: {}, tools: {}, open: {}, crafted: {} });
    impBtn2.dispatch("click");
    assert(textOf(registry.shopping).includes(research.name), "enabled Xedra requirements appear in the Plan");
    const enabledCount = countCards();
    xedraToggle.checked = false; xedraToggle.dispatch("change");
    assert(countCards() === enabledCount - 3, "disabling Xedra hides exactly its three cards");
    assert(!textOf(registry.shopping).includes(research.name) && !textOf(planReadyList).includes(research.name),
      "disabled Xedra content is excluded from Plan materials and ready upgrades");
    assert(registry["plan-summary"].textContent === "nothing planned yet", "disabled Xedra plans do not count in the Plan summary");
    assert(textOf(registry.foot).includes("114 upgrades tracked"), "tracked count excludes disabled Xedra content");
    assert(getState().done[tier4.id] && getState().plan[research.id] && getState().have[tier4.id + "::comp::0"],
      "disabling Xedra preserves its completion, plan, and gathered materials");
    searchEl.value = research.name; searchEl.dispatch("input");
    assert(!findCardByName(research.name), "search does not reveal disabled Xedra content");
    searchEl.value = ""; searchEl.dispatch("input");
    xedraToggle.checked = true; xedraToggle.dispatch("change");
    assert(textOf(registry.shopping).includes(research.name), "re-enabling Xedra restores its Plan requirements");
    assert(textOf(registry.foot).includes("117 upgrades tracked"), "tracked count includes enabled Xedra content");
    promptReturn = JSON.stringify({ plan: {}, done: {} });
    impBtn2.dispatch("click");
    assert(xedraToggle.checked === false && !findCardByName(tier4.name), "old tracker imports default optional Xedra content to off");
  }

  // Usability regressions: partial counts, subset actions and undo.
  const importFixture = value => { promptReturn = JSON.stringify(value); impBtn2.dispatch("click"); };
  const r1 = "SKYISLAND_UPGRADE_rankup1", r2 = "SKYISLAND_UPGRADE_rankup2";
  const key1 = r1 + "::comp::0::warptoken";
  importFixture({ plan: { [r1]: true, [r2]: true }, qty: { [key1]: 1 }, raid: { [r1]: true } });
  assert(textOf(shopping).includes("5×"), "Plan subtracts partial quantities from remaining shards");
  getEl("plan-view-raid").dispatch("click");
  assert(textOf(shopping).includes("1×") && !textOf(shopping).includes("Island Rank Up 2"), "Next raid limits material totals and sources to focused goals");
  const raidCheck = (shopping.children[0]?.children || []).find(n => n.className === "shop-check");
  if (raidCheck) { raidCheck.checked = true; raidCheck.dispatch("change"); }
  assert(getState().have[r1 + "::comp::0"] && !getState().have[r2 + "::comp::0"], "raid gathering affects only selected upgrades");
  getEl("undo-progress").dispatch("click");
  assert(!getState().have[r1 + "::comp::0"] && getState().qty[key1] === 1, "Undo restores quantity and flags before gathering");
  getEl("plan-view-all").dispatch("click");
  importFixture({ plan: { [r1]: true }, raid: { [r1]: true, bogus: true, [r2]: true } });
  assert(Object.keys(getState().raid || {}).join() === r1, "import removes orphaned or unplanned raid selections");
  const completeFocused = doneCbOf(findCardByName("Island Rank Up 1"));
  completeFocused.checked = true; completeFocused.dispatch("change");
  assert(!getState().raid?.[r1] && !getState().plan[r1], "completion removes raid focus and plan membership");
  getEl("undo-progress").dispatch("click");
  assert(getState().raid?.[r1] && getState().plan[r1] && !getState().done[r1], "Undo completion restores plan and raid focus");
  importFixture({plan: null, qty: [], raid: null});
  assert(getState().plan && getState().raid && !Array.isArray(getState().qty), "malformed state maps normalize safely");

  // Discovery and prerequisite navigation.
  importFixture({});
  assert(getEl("welcome").hidden === false, "welcome appears for an empty tracker");
  const available = getEl("availability"), category = getEl("category-filter");
  available.value = "available"; available.dispatch("change");
  assert(!!findCardByName("Island Rank Up 1") && !findCardByName("Island Rank Up 2"), "Available now excludes tracked prerequisite blockers");
  category.value = "Island Rank Up"; category.dispatch("change");
  assert(countCards() === 1, "category and availability filters intersect");
  const rankTools = Object.fromEntries(window.SKYISLAND_DATA.upgrades.find(u => u.id === r1).qualities.map(q => [q.id + "::" + q.level, true]));
  importFixture({ tools: rankTools });
  available.value = "one"; available.dispatch("change");
  assert(countCards() === 1, "Missing one requirement selects an unblocked single-requirement upgrade");
  available.value = ""; category.value = ""; available.dispatch("change");
  importFixture({ plan: { [r2]: true }, have: { [r2 + "::comp::0"]: true }, tools: rankTools });
  assert(getEl("welcome").hidden === true, "welcome hides when meaningful progress exists");
  assert(!textOf(findCardByName("Island Rank Up 2")).includes("✓ ready"), "a locked card with gathered requirements never says ready");
  const prereqBtn = findByText(findCardByName("Island Rank Up 2"), "Add missing prerequisites to Plan");
  assert(!!prereqBtn, "blocked upgrades offer prerequisite planning");
  if (prereqBtn) prereqBtn.dispatch("click");
  assert(getState().plan[r1] && getState().plan[r2], "prerequisite planning includes target and missing ancestors");
  getEl("undo-progress").dispatch("click");
  assert(!getState().plan[r1] && getState().plan[r2], "prerequisite batch is one undo step");
  const totalOneShot = window.SKYISLAND_DATA.upgrades.filter(u => !u.repeatable && !u.mod).length;
  assert(textOf(registry.stats).includes("0/" + totalOneShot + " upgrades completed"), "completion summary excludes repeatable recipes");
  searchEl.value = "Island Rank Up 2"; searchEl.dispatch("input");
  const prereqLink = findByText(findCardByName("Island Rank Up 2"), "Island Rank Up 1");
  if (prereqLink) prereqLink.dispatch("click");
  assert(searchEl.value === "" && getState().open[r1], "prerequisite navigation clears hiding search and reveals target");
  searchEl.value = ""; searchEl.dispatch("input");
  const firstCard = findCardByName("Island Rank Up 1");
  assert(textOf(firstCard).includes("Reach Rank 1"), "collapsed card includes its extracted benefit");

  // Keyboard and focus regressions.
  importFixture({ plan: { [r1]: true }, open: { [r1]: true } });
  const cardForFocus = findCardByName("Island Rank Up 1");
  const disclosure = cardForFocus.querySelector(".card-disclosure");
  assert(disclosure?.tagName === "button" && disclosure.getAttribute("aria-expanded") === "true", "card uses a keyboard-native disclosure with expanded state");
  assert(list.querySelector(".group-head")?.tagName === "button", "section collapse uses a native button");
  const focusPlus = cardForFocus.querySelectorAll("button").find(n => n._text === "+");
  focusPlus.focus(); focusPlus.dispatch("click");
  assert(document.activeElement !== focusPlus && document.activeElement?._text === "+", "stepper focus follows the rebuilt control after gathering");
  assert(getEl("plan-scroll").inert === true, "closed mobile Plan excludes its content from keyboard navigation");
  planHandle.focus(); planHandle.dispatch("click");
  assert(getEl("main-content").inert === true && planPanel.getAttribute("aria-modal") === "true", "open mobile Plan makes background inert and declares a modal");
  document.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert(!/\bopen\b/.test(planPanel.className) && document.activeElement === planHandle, "Escape closes sheet and restores its handle focus");
  planHandle.dispatch("click"); mobileMedia.change(false);
  assert(!getEl("main-content").inert && !getEl("plan-scroll").inert && planPanel.getAttribute("aria-modal") === null, "desktop breakpoint releases modal restrictions");
  mobileMedia.change(true);
  const groupDetails = list.querySelector("[data-tip]");
  assert(groupDetails?.tagName === "button", "item groups have an explicit keyboard control");
  if (groupDetails) {
    groupDetails.focus(); document.dispatch("click", { target: groupDetails });
    const tip = document.body.querySelector(".tooltip");
    assert(tip.classList.contains("frozen") && tip.querySelector("button"), "clicked item details pin with a Close button");
    document.dispatch("keydown", { key: "Escape", preventDefault() {} });
    assert(tip.style.display === "none" && document.activeElement === groupDetails, "Escape closes details and restores trigger focus");
  }

  // Independent alternatives and bounded recovery history.
  importFixture({ plan: { SKYISLAND_bunker_temperature_adaptation: true, SKYISLAND_UPGRADE_sunblock: true } });
  const umbrellaRows = shopping.children.filter(n => textOf(n).includes("telescoping umbrella"));
  assert(umbrellaRows.length === 2, "independent umbrella alternatives remain separate Plan choices");
  importFixture({ plan: { SKYISLAND_UPGRADE_scouting2: true } });
  const batteryRow = shopping.children.find(n => textOf(n).includes("light battery"));
  assert(!!batteryRow && ["5×", "10×", "15×"].every(t => textOf(batteryRow).includes(t)), "same-ID alternatives preserve their distinct required counts");
  const rad = "SKYISLAND_UPGRADE_radblock";
  importFixture({ plan: { [rad]: true }, qty: { [rad + "::comp::0::bleach"]: 15, [rad + "::comp::0::ammonia_hydroxide"]: 15 } });
  const chemicalRow = shopping.children.find(n => textOf(n).includes("bleach"));
  assert(chemicalRow && textOf(chemicalRow).includes("15×") && !chemicalRow.children[0].checked, "half of each alternative does not satisfy an OR group");
  importFixture({ plan: { [r1]: true }, raid: { [r1]: true }, open: { [r1]: true } });
  const clearButton = getEl("clear-plan"); clearButton.dispatch("click");
  assert(!getState().plan[r1] && !getState().raid[r1], "Clear empties both plan and raid goals");
  getEl("undo-progress").dispatch("click");
  assert(getState().plan[r1] && getState().raid[r1], "Undo restores a cleared plan and focus");
  for (let i = 0; i < 25; i++) {
    const next = findByText(findCardByName("Island Rank Up 1"), "Next raid"); next.dispatch("click");
  }
  for (let i = 0; i < 20; i++) getEl("undo-progress").dispatch("click");
  assert(getEl("undo-progress").disabled && !getState().raid[r1], "Undo retains only the last 20 progress changes");

  // Review regressions: visible focus and truthful, reachable Undo actions.
  importFixture({ plan: { [r1]: true }, raid: { [r1]: true }, open: { [r1]: true } });
  mobileMedia.change(false); getEl("plan-view-raid").dispatch("click");
  const disappearing = shopping.children.find(n => n.className?.includes("shard")).children[0];
  disappearing.focus(); disappearing.checked = true; disappearing.dispatch("change");
  assert(document.activeElement === getEl("plan-view-raid"), "desktop removed-row focus falls back to the visible Plan view");
  getEl("plan-view-all").dispatch("click");
  importFixture({ plan: { [r1]: true }, open: { [r1]: true } });
  findByText(findCardByName("Island Rank Up 1"), "Next raid").dispatch("click");
  const oldToastUndo = findByText(getEl("toast"), "Undo");
  const quietPlus = findCardByName("Island Rank Up 1").querySelectorAll("button").find(n => n._text === "+");
  quietPlus.dispatch("click");
  assert(getEl("toast").hidden || getEl("toast").inert || !findByText(getEl("toast"), "Undo"), "quiet quantity changes retire the prior action's toast Undo");
  if (oldToastUndo) oldToastUndo.dispatch("click");
  assert(getState().qty[key1] === 1, "a stale toast Undo cannot undo a different later action");
  const identicalState = getState(); importFixture(identicalState);
  const noOpUndo = findByText(getEl("toast"), "Undo");
  assert(!noOpUndo, "an unchanged import does not offer Undo for an unrelated older change");
  findByText(findCardByName("Island Rank Up 1"), "Next raid").dispatch("click");
  const expiringUndo = findByText(getEl("toast"), "Undo");
  expiringUndo.focus(); if (toastExpiry) toastExpiry();
  assert(!getEl("toast").hidden && getEl("toast").classList.contains("show"), "toast remains available while its Undo has keyboard focus");
  searchEl.focus(); if (toastExpiry) toastExpiry();
  assert(getEl("toast").hidden || getEl("toast").inert, "expired toast Undo is excluded from keyboard navigation");
  const detailTrigger = list.querySelector("[data-tip]");
  detailTrigger.focus(); document.dispatch("click", { target: detailTrigger });
  const detailPanel = document.body.querySelector(".tooltip");
  const detailClose = detailPanel.querySelector("button"); detailClose.focus();
  document.dispatch("keydown", { key: "Tab", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  assert(document.activeElement === detailPanel.querySelector("a"), "Tab from item details Close wraps to its alternatives");
  document.dispatch("keydown", { key: "Escape", preventDefault() {} });

  category.value = "Island Rank Up"; registry["hide-done"].setAttribute("aria-pressed", "true");
  searchEl.value = "Island Rank Up 2"; searchEl.dispatch("input");
  findByText(findCardByName("Island Rank Up 2"), "Island Rank Up 1").dispatch("click");
  assert(category.value === "Island Rank Up" && registry["hide-done"].getAttribute("aria-pressed") === "true" && searchEl.value === "", "prerequisite navigation preserves compatible filters");
  category.value = ""; registry["hide-done"].setAttribute("aria-pressed", "false"); category.dispatch("change");
  const listUpgrade = window.SKYISLAND_DATA.upgrades.find(u => u.components.some(g => g.some(a => a.list)));
  importFixture({ plan: { [listUpgrade.id]: true } });
  mobileMedia.change(true); planHandle.focus(); planHandle.dispatch("click");
  const sheetDetails = shopping.querySelector("[data-tip]");
  sheetDetails.focus(); document.dispatch("click", { target: sheetDetails });
  assert(planPanel.contains(detailPanel) && document.activeElement === detailPanel.querySelector("a"), "mobile item details remain inside the modal and focus the first alternative");
  document.dispatch("keydown", { key: "Tab", shiftKey: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  assert(document.activeElement === detailPanel.querySelector("button"), "reverse Tab stays within pinned item details");
  document.dispatch("keydown", { key: "Escape", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  assert(planPanel.classList.contains("open") && document.activeElement === sheetDetails, "Escape closes nested item details without closing the Plan");
  document.dispatch("keydown", { key: "Escape", preventDefault() {} });

  importFixture({plan: { SKYISLAND_UPGRADE_bonusmissions5: true }});
  assert(textOf(getEl("plan-summary")).includes("4 tools"), "Plan handle includes explicit tools in its missing requirements");

  importFixture({done: { [r1]: true }, plan: { [r2]: true }});
  const hideButton = getEl("hide-done"), planButton = getEl("only-plan");
  hideButton.dispatch("click");
  assert(hideButton.getAttribute("aria-pressed") === "true" && !findCardByName("Island Rank Up 1"), "Hide done button stays pressed and filters completed cards");
  hideButton.dispatch("click");
  assert(hideButton.getAttribute("aria-pressed") === "false" && !!findCardByName("Island Rank Up 1"), "Hide done button toggles off and restores completed cards");
  planButton.dispatch("click");
  assert(planButton.getAttribute("aria-pressed") === "true" && countCards() === 1 && !!findCardByName("Island Rank Up 2"), "Only in plan button filters to planned cards");
  planButton.dispatch("click");
  assert(planButton.getAttribute("aria-pressed") === "false" && countCards() > 1, "Only in plan button toggles off");

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

  process.stdout.write(process.exitCode ? "\nSMOKE TEST FAILED\n" : "\nAll smoke checks passed\n");
}, 10);
