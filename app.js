/* Sky Island Helper — vanilla JS, no build step, runs straight from file://.
   State lives in localStorage (works from a local .html file) and can be
   exported / imported as JSON via the clipboard. */
(function () {
  "use strict";

  const DATA = (window.SKYISLAND_DATA || { upgrades: [] });
  const UP = DATA.upgrades;
  const byId = Object.fromEntries(UP.map(u => [u.id, u]));

  const STORE_KEY = "skyisland.tracker.v1";
  const els = {
    list: document.getElementById("list"),
    search: document.getElementById("search"),
    hideDone: document.getElementById("hide-done"),
    onlyPlan: document.getElementById("only-plan"),
    clearPlan: document.getElementById("clear-plan"),
    shopping: document.getElementById("shopping"),
    planHint: document.getElementById("plan-hint"),
    stats: document.getElementById("stats"),
    foot: document.getElementById("foot"),
    toolbar: document.querySelector(".toolbar"),
  };

  // ---- state ---------------------------------------------------------------
  let state = load();

  function blankState() {
    return { done: {}, plan: {}, have: {}, qty: {}, open: {} };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return blankState();
      return Object.assign(blankState(), JSON.parse(raw));
    } catch (e) {
      return blankState();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---- helpers -------------------------------------------------------------
  // A requirement group is "met" when the upgrade is done, OR its checkbox is
  // ticked (state.have -> "I have one of these, doesn't matter which"), OR any
  // one alternative's tracked quantity (state.qty) has reached its required
  // count. Group key: `${upgradeId}::${section}::${index}`.
  function haveKey(u, section, idx) { return u.id + "::" + section + "::" + idx; }
  function qtyKey(u, gi, altId) { return u.id + "::comp::" + gi + "::" + altId; }
  function getQty(u, gi, altId) { return state.qty[qtyKey(u, gi, altId)] || 0; }
  function setQty(u, gi, alt, val) {
    const v = Math.max(0, Math.min(alt.count, val | 0));
    const k = qtyKey(u, gi, alt.id);
    if (v <= 0) delete state.qty[k]; else state.qty[k] = v;
    render();
  }
  // Whole-group manual flag (used by the checkbox and by qualities/tools).
  function isHave(u, section, idx) {
    return !!state.done[u.id] || !!state.have[haveKey(u, section, idx)];
  }
  // Component group also counts as met if any alternative is fully stocked.
  function compMet(u, gi, alts) {
    if (isHave(u, "comp", gi)) return true;
    return alts.some(a => getQty(u, gi, a.id) >= a.count);
  }
  // Toggle a component group's overall state (from either view). Checking sets
  // the manual flag; unchecking clears the flag AND any per-item quantities.
  function setCompGroup(u, gi, alts, met) {
    const k = haveKey(u, "comp", gi);
    if (met) {
      state.have[k] = true;
    } else {
      delete state.have[k];
      alts.forEach(a => delete state.qty[qtyKey(u, gi, a.id)]);
    }
    render();
  }
  function groupMet(u, g) {
    return g.section === "comp" ? compMet(u, g.idx, g.alts) : isHave(u, g.section, g.idx);
  }
  function reqGroups(u) {
    // Flattened list of every checkable requirement across sections.
    const g = [];
    u.components.forEach((alts, i) => g.push({ section: "comp", idx: i, alts }));
    u.qualities.forEach((q, i) => g.push({ section: "qual", idx: i, qual: q }));
    u.tools.forEach((t, i) => g.push({ section: "tool", idx: i, tool: t }));
    return g;
  }
  function progress(u) {
    const groups = reqGroups(u);
    if (!groups.length) return { met: 0, total: 0 };
    let met = 0;
    groups.forEach(g => { if (groupMet(u, g)) met++; });
    return { met, total: groups.length };
  }

  // ---- rendering -----------------------------------------------------------
  function render() {
    const q = els.search.value.trim().toLowerCase();
    const hideDone = els.hideDone.checked;
    const onlyPlan = els.onlyPlan.checked;

    const groups = {}; // group -> category -> [upgrades]
    let shown = 0;
    UP.forEach(u => {
      if (hideDone && state.done[u.id]) return;
      if (onlyPlan && !state.plan[u.id]) return;
      if (q && !matches(u, q)) return;
      (groups[u.group] = groups[u.group] || {});
      (groups[u.group][u.category] = groups[u.group][u.category] || []).push(u);
      shown++;
    });

    els.list.innerHTML = "";
    if (!shown) {
      els.list.innerHTML = '<div class="empty">No upgrades match your filters.</div>';
    } else {
      for (const group of Object.keys(groups)) {
        const gh = document.createElement("div");
        gh.className = "group-head";
        gh.textContent = group;
        els.list.appendChild(gh);
        for (const cat of Object.keys(groups[group])) {
          const ch = document.createElement("div");
          ch.className = "cat-head";
          ch.textContent = cat;
          els.list.appendChild(ch);
          groups[group][cat].forEach(u => els.list.appendChild(card(u)));
        }
      }
    }
    renderStats();
    renderShopping();
    save();
  }

  function matches(u, q) {
    if (u.name.toLowerCase().includes(q)) return true;
    if ((u.effect || "").toLowerCase().includes(q)) return true;
    for (const alts of u.components)
      for (const a of alts) if (a.name.toLowerCase().includes(q)) return true;
    return false;
  }

  function card(u) {
    const prog = progress(u);
    const done = !!state.done[u.id];
    const planned = !!state.plan[u.id];
    const open = !!state.open[u.id];

    const card = document.createElement("div");
    card.className = "card" + (done ? " done" : "") + (planned ? " planned" : "") + (open ? " open" : "");

    // top row
    const top = document.createElement("div");
    top.className = "card-top";

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

    const main = document.createElement("div");
    main.className = "card-main";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = u.name;
    if (u.key_name) {
      const key = document.createElement("span");
      key.className = "card-key";
      key.textContent = "Craft: " + u.key_name;
      title.appendChild(key);
    }
    const eff = document.createElement("div");
    eff.className = "card-effect";
    eff.textContent = u.effect || "";
    main.appendChild(title); main.appendChild(eff);

    const side = document.createElement("div");
    side.className = "card-side";
    const badge = document.createElement("div");
    const complete = prog.total > 0 && prog.met === prog.total;
    badge.className = "progress-badge" + (complete ? " complete" : "");
    badge.textContent = prog.total ? (complete ? "✓ ready" : prog.met + "/" + prog.total) : "—";
    const planBtn = document.createElement("button");
    planBtn.type = "button";
    planBtn.className = "plan-btn" + (planned ? " on" : "");
    planBtn.textContent = planned ? "✓ Planned" : "＋ Plan";
    planBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (planned) delete state.plan[u.id]; else state.plan[u.id] = true;
      render();
    });
    side.appendChild(badge); side.appendChild(planBtn);

    top.appendChild(doneWrap); top.appendChild(main); top.appendChild(side);
    top.addEventListener("click", () => {
      if (open) delete state.open[u.id]; else state.open[u.id] = true;
      render();
    });
    card.appendChild(top);

    // body
    const body = document.createElement("div");
    body.className = "card-body";

    if (prog.total) {
      const pbar = document.createElement("div");
      pbar.className = "pbar";
      const span = document.createElement("span");
      span.style.width = (100 * prog.met / prog.total) + "%";
      pbar.appendChild(span);
      body.appendChild(pbar);
    }

    if (u.components.length) {
      body.appendChild(sectionLabel("Materials"));
      u.components.forEach((alts, i) => body.appendChild(componentRow(u, i, alts)));
    }
    if (u.qualities.length) {
      body.appendChild(sectionLabel("Tool qualities"));
      u.qualities.forEach((q, i) =>
        body.appendChild(reqRow(u, "qual", i, [guideLink("tool_quality", q.id, q.name, q.tip), textNode(" "), tagNode("lvl " + q.level)])));
    }
    if (u.tools.length) {
      body.appendChild(sectionLabel("Tools"));
      u.tools.forEach((t, i) => body.appendChild(reqRow(u, "tool", i, [itemLink(t.id, t.name, false, t.tip)])));
    }

    if (u.description) {
      const d = document.createElement("div");
      d.className = "desc";
      d.textContent = u.description;
      body.appendChild(d);
    }
    card.appendChild(body);
    return card;
  }

  function sectionLabel(t) {
    const el = document.createElement("div");
    el.className = "req-section-label";
    el.textContent = t;
    return el;
  }
  function textNode(t) { return document.createTextNode(t); }
  function tagNode(t) { const s = document.createElement("span"); s.className = "tag"; s.textContent = t; return s; }

  const GUIDE = (DATA.guide_base || "https://cdda-guide.nornagon.net") + "/";
  // Link into the CDDA Guide. `kind` is the guide namespace: "item" or
  // "tool_quality". `tip` (optional) shows a hover tooltip.
  function guideLink(kind, id, text, tip) {
    const a = document.createElement("a");
    a.className = "item-link";
    a.href = GUIDE + kind + "/" + encodeURIComponent(id);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    if (tip) a.setAttribute("data-tip", tip);
    a.addEventListener("click", e => e.stopPropagation());
    return a;
  }
  // Real items link to the item browser; LIST/requirement pseudo-ids
  // (e.g. "cordage", "any_badge") aren't item pages, so render them as a
  // hoverable span whose tooltip expands the requirement.
  function itemLink(id, text, isList, tip) {
    if (!isList) return guideLink("item", id, text, tip);
    const s = document.createElement("span");
    s.className = "list-ref";
    s.textContent = text;
    if (tip) s.setAttribute("data-tip", tip);
    return s;
  }

  // A material requirement row: group checkbox + one stepper per alternative.
  // The line is met when the box is ticked or any alternative is fully stocked.
  function componentRow(u, gi, alts) {
    const met = compMet(u, gi, alts);
    const locked = !!state.done[u.id];
    const row = document.createElement("div");
    row.className = "req comp" + (met ? " have" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = met;
    cb.disabled = locked;
    cb.title = "I have one of these (any alternative)";
    cb.addEventListener("change", () => setCompGroup(u, gi, alts, cb.checked));

    const text = document.createElement("span");
    text.className = "req-text";
    alts.forEach((a, i) => {
      if (i) { const or = document.createElement("span"); or.className = "or"; or.textContent = "or"; text.appendChild(or); }
      text.appendChild(stepper(u, gi, a, locked));
      text.appendChild(textNode(" "));
      text.appendChild(itemLink(a.id, a.name, a.list, a.tip));
    });
    row.appendChild(cb); row.appendChild(text);
    return row;
  }

  // "[−] have/count [+]" quantity tracker for a single alternative.
  function stepper(u, gi, a, locked) {
    const have = getQty(u, gi, a.id);
    const done = have >= a.count;
    const wrap = document.createElement("span");
    wrap.className = "stepper" + (done ? " full" : "");

    const minus = document.createElement("button");
    minus.type = "button"; minus.className = "step"; minus.textContent = "−";
    minus.disabled = locked || have <= 0;
    minus.title = "Have one fewer";
    minus.addEventListener("click", e => { e.stopPropagation(); setQty(u, gi, a, have - 1); });

    const qty = document.createElement("input");
    qty.className = "qty"; qty.type = "text"; qty.inputMode = "numeric";
    qty.value = have; qty.disabled = locked;
    qty.title = "How many you have";
    qty.addEventListener("click", e => e.stopPropagation());
    qty.addEventListener("change", () => setQty(u, gi, a, parseInt(qty.value, 10) || 0));

    const sep = document.createElement("span");
    sep.className = "of"; sep.textContent = "/" + a.count;

    const plus = document.createElement("button");
    plus.type = "button"; plus.className = "step"; plus.textContent = "+";
    plus.disabled = locked || have >= a.count;
    plus.title = "Have one more";
    plus.addEventListener("click", e => { e.stopPropagation(); setQty(u, gi, a, have + 1); });

    wrap.appendChild(minus); wrap.appendChild(qty); wrap.appendChild(sep); wrap.appendChild(plus);
    return wrap;
  }

  function reqRow(u, section, idx, contentNodes) {
    const have = isHave(u, section, idx);
    const row = document.createElement("div");
    row.className = "req" + (have ? " have" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = have;
    cb.disabled = !!state.done[u.id]; // done ⇒ everything implicitly had
    cb.addEventListener("change", () => {
      const k = haveKey(u, section, idx);
      if (cb.checked) state.have[k] = true; else delete state.have[k];
      render();
    });
    // Plain span (not a <label>): clicking the text/link must NOT toggle the box.
    const text = document.createElement("span");
    text.className = "req-text";
    (Array.isArray(contentNodes) ? contentNodes : [contentNodes]).forEach(n => text.appendChild(n));
    row.appendChild(cb); row.appendChild(text);
    return row;
  }

  // ---- shopping list -------------------------------------------------------
  function renderShopping() {
    const planned = UP.filter(u => state.plan[u.id]);
    els.planHint.style.display = planned.length ? "none" : "block";
    els.shopping.innerHTML = "";
    if (!planned.length) return;

    // Aggregate component groups across planned upgrades. Key by the set of
    // alternative ids so "3 nails" from two upgrades merges into one line.
    // Each line tracks its contributing (upgrade, group) pairs so ticking it
    // updates the very same state the cards read/write.
    const agg = {}; // sig -> { alts, from:Set, groups:[{u,gi,alts}] }
    let shards = 0, shardsHave = 0;

    planned.forEach(u => {
      u.components.forEach((alts, i) => {
        // warp shards get their own read-only summary line (a currency total).
        if (alts.length === 1 && alts[0].id === "warptoken") {
          shards += alts[0].count;
          if (compMet(u, i, alts)) shardsHave += alts[0].count;
          return;
        }
        const sig = alts.map(a => a.id).join("|");
        const rec = agg[sig] || (agg[sig] = { alts, from: new Set(), groups: [] });
        rec.groups.push({ u, gi: i, alts });
        rec.from.add(u.name);
      });
    });

    const rows = Object.values(agg).map(rec => {
      const unmet = rec.groups.filter(g => !compMet(g.u, g.gi, g.alts));
      return { rec, unmet, allMet: unmet.length === 0 };
    }).sort((a, b) => {
      if (a.allMet !== b.allMet) return a.allMet ? 1 : -1; // needed first, met last
      return a.rec.alts[0].name.localeCompare(b.rec.alts[0].name);
    });

    let itemsNeeded = 0;
    rows.forEach(({ rec, unmet, allMet }) => {
      if (!allMet) itemsNeeded++;
      // Sum counts across the groups that still need this material (or all, if done).
      const src = allMet ? rec.groups : unmet;
      const counts = {};
      src.forEach(g => g.alts.forEach(a => { counts[a.id] = (counts[a.id] || 0) + a.count; }));

      const row = document.createElement("div");
      row.className = "shop-item" + (allMet ? " have" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "shop-check";
      cb.checked = allMet;
      cb.indeterminate = !allMet && unmet.length < rec.groups.length;
      cb.title = "Mark this material as gathered for every planned upgrade that needs it";
      cb.addEventListener("change", () => {
        rec.groups.forEach(g => {
          const k = haveKey(g.u, "comp", g.gi);
          if (cb.checked) state.have[k] = true;
          else { delete state.have[k]; g.alts.forEach(a => delete state.qty[qtyKey(g.u, g.gi, a.id)]); }
        });
        render();
      });

      const name = document.createElement("div");
      name.className = "shop-name";
      rec.alts.forEach((a, i) => {
        if (i) { const or = document.createElement("span"); or.className = "or"; or.textContent = " or "; name.appendChild(or); }
        const c = document.createElement("span"); c.className = "count"; c.textContent = (counts[a.id] || 0) + "× ";
        name.appendChild(c); name.appendChild(itemLink(a.id, a.name, a.list, a.tip));
      });
      const from = document.createElement("div");
      from.className = "shop-from";
      from.textContent = [...rec.from].join(", ");
      const col = document.createElement("div");
      col.style.flex = "1";
      col.appendChild(name); col.appendChild(from);
      row.appendChild(cb); row.appendChild(col);
      els.shopping.appendChild(row);
    });

    if (shards > 0) {
      const line = document.createElement("div");
      line.className = "shard-line";
      const remaining = shards - shardsHave;
      line.innerHTML = '<span class="count">' + remaining + "×</span> warp shards still needed" +
        (shardsHave ? ' <span class="shop-from">(' + shards + " total)</span>" : "");
      els.shopping.appendChild(line);
    }

    const tot = document.createElement("div");
    tot.className = "shop-total";
    tot.textContent = itemsNeeded + " material line(s) still to gather across " + planned.length + " planned upgrade(s).";
    els.shopping.appendChild(tot);
  }

  function renderStats() {
    const total = UP.length;
    const done = UP.filter(u => state.done[u.id]).length;
    const planned = UP.filter(u => state.plan[u.id]).length;
    els.stats.innerHTML = "<b>" + done + "</b>/" + total + " completed · <b>" + planned + "</b> planned";
    els.foot.textContent = total + " upgrades tracked";
  }

  // ---- import / export -----------------------------------------------------
  function exportState() {
    const json = JSON.stringify(state);
    copyToClipboard(json).then(ok => {
      alert(ok ? "Progress copied to clipboard as JSON.\nPaste it somewhere safe to back it up."
               : "Couldn't access clipboard. Here is your JSON:\n\n" + json);
    });
  }
  function importState() {
    const raw = prompt("Paste previously exported JSON progress:");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw.trim());
      state = Object.assign(blankState(), parsed);
      save();
      render();
      alert("Progress imported.");
    } catch (e) {
      alert("That doesn't look like valid exported JSON.");
    }
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  // ---- wiring --------------------------------------------------------------
  function setAllOpen(open) {
    state.open = {};
    if (open) UP.forEach(u => { state.open[u.id] = true; });
    render();
  }

  function addToolbarButtons() {
    const expand = document.createElement("button");
    expand.type = "button"; expand.className = "btn ghost"; expand.textContent = "Expand all";
    expand.addEventListener("click", () => setAllOpen(true));
    const collapse = document.createElement("button");
    collapse.type = "button"; collapse.className = "btn ghost"; collapse.textContent = "Collapse all";
    collapse.addEventListener("click", () => setAllOpen(false));
    els.toolbar.appendChild(expand);
    els.toolbar.appendChild(collapse);

    const exp = document.createElement("button");
    exp.type = "button"; exp.className = "btn"; exp.textContent = "Export";
    exp.title = "Copy your progress to the clipboard as JSON";
    exp.addEventListener("click", exportState);
    const imp = document.createElement("button");
    imp.type = "button"; imp.className = "btn"; imp.textContent = "Import";
    imp.title = "Paste previously exported JSON progress";
    imp.addEventListener("click", importState);
    const reset = document.createElement("button");
    reset.type = "button"; reset.className = "btn danger"; reset.textContent = "Reset";
    reset.title = "Clear all progress (completed, planned, and checked items)";
    reset.addEventListener("click", () => {
      if (confirm("Reset ALL progress? This clears completed, planned, and checked items. Consider Export first.")) {
        state = blankState();
        save();
        render();
      }
    });
    els.toolbar.appendChild(exp);
    els.toolbar.appendChild(imp);
    els.toolbar.appendChild(reset);
  }

  // ---- hover tooltips (guide-style) ---------------------------------------
  function setupTooltips() {
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.style.display = "none";
    document.body.appendChild(tip);
    let current = null;

    function place(target) {
      if (!target.getBoundingClientRect) return;
      const r = target.getBoundingClientRect();
      tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = r.left + window.scrollX;
      left = Math.min(left, window.scrollX + document.documentElement.clientWidth - tw - 10);
      left = Math.max(window.scrollX + 6, left);
      let top = r.top + window.scrollY - th - 8; // above the item
      if (top < window.scrollY + 4) top = r.bottom + window.scrollY + 8; // flip below
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }
    document.addEventListener("mouseover", e => {
      const t = e.target.closest && e.target.closest("[data-tip]");
      if (!t || t === current) return;
      current = t;
      tip.textContent = t.getAttribute("data-tip");
      place(t);
    });
    document.addEventListener("mouseout", e => {
      const t = e.target.closest && e.target.closest("[data-tip]");
      if (t && t === current) { tip.style.display = "none"; current = null; }
    });
  }

  els.search.addEventListener("input", render);
  els.hideDone.addEventListener("change", render);
  els.onlyPlan.addEventListener("change", render);
  els.clearPlan.addEventListener("click", () => {
    if (Object.keys(state.plan).length && confirm("Clear all planned upgrades?")) {
      state.plan = {}; render();
    }
  });
  addToolbarButtons();
  setupTooltips();
  render();
})();
