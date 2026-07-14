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
  };
}

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
const expandAll = toolbar.children.find(c => c._text === "Expand all");
const collapseAll = toolbar.children.find(c => c._text === "Collapse all");
assert(!!expandAll && !!collapseAll, "Expand all / Collapse all buttons present");
const countCards = () => { let n=0; (function w(x){ if(typeof x.className==="string" && (x.className==="card"||x.className.indexOf("card ")===0)) n++; (x.children||[]).forEach(w); })(list); return n; };
const countHeads = () => { let n=0; (function w(x){ if(typeof x.className==="string" && x.className.indexOf("group-head")===0) n++; (x.children||[]).forEach(w); })(list); return n; };
expandAll.dispatch("click");
let es = JSON.parse(storeBacking["skyisland.tracker.v1"]);
assert(Object.keys(es.open).length === 84 && Object.keys(es.groupsCollapsed || {}).length === 0, "expand all opens every section + upgrade");
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

// Remove finished from plan: rank-up #1 was planned and marked done earlier,
// so it should be dropped from the plan (checked before import replaces state).
const planBeforeRm = Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length;
const rmFin = registry["remove-finished"]; // now lives in the Plan panel, not the toolbar
assert(!!rmFin && rmFin._listeners.click, "Remove finished button wired in plan panel");
rmFin.dispatch("click");
assert(Object.keys(JSON.parse(storeBacking["skyisland.tracker.v1"]).plan).length < planBeforeRm,
  "remove finished drops completed upgrades from the plan");

// Export copies JSON to clipboard
const expBtn = toolbar.children.find(c => c._text === "Export");
assert(!!expBtn, "Export button added to toolbar");
expBtn.dispatch("click");
setTimeout(() => {
  assert(clipboard.length > 0 && JSON.parse(clipboard), "export wrote valid JSON to clipboard");
  // Import
  promptReturn = JSON.stringify({ plan: { "SKYISLAND_UPGRADE_landing1": true }, done: {}, have: {}, open: {} });
  const impBtn = toolbar.children.find(c => c._text === "Import");
  impBtn.dispatch("click");
  const after = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(after.plan["SKYISLAND_UPGRADE_landing1"] === true, "import replaced state from JSON");

  // Reset wipes everything
  global.confirm = () => true;
  const resetBtn = toolbar.children.find(c => c._text === "Reset");
  assert(!!resetBtn, "Reset button present");
  resetBtn.dispatch("click");
  const cleared = JSON.parse(storeBacking["skyisland.tracker.v1"]);
  assert(Object.keys(cleared.plan).length === 0 && Object.keys(cleared.have).length === 0 &&
         Object.keys(cleared.done).length === 0, "reset clears all progress");

  console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nAll smoke checks passed");
}, 10);
