# UI usability implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved complete usability pass.
**Architecture:** Keep the existing IIFE, generated data, and full render binding. Centralize mutation history and readiness; render Plan from a selected subset.
**Tech Stack:** Vanilla HTML/CSS/JS; Bun through mise for tests.
**Spec:** docs/superpowers/specs/2026-11-13-ui-usability-design.md

## Global Constraints

- Must work from file://; no new dependencies, remote assets, fetch, or build step.
- Do not edit generated data. Keep existing tracker saves compatible.
- Preserve Xedra progress when hidden, global qualities, theme independence.
- Retain desktop sidebar/mobile sheet and green accent styling.
- User approved implementation and requested this branch/worktree and Bun.

## Review Focus

- Imports with missing or malformed maps must not break rendering or leave invalid raid IDs.
- Partial OR alternatives must not count as a combined inventory.
- Undo after filtered/bulk actions must restore only tracker progress, not UI position.
- Removed or disabled controls must receive a sensible keyboard focus fallback.
- Breakpoint changes must release mobile focus/background restrictions.

### Task 1: State, Plan and recovery

**Files:** app.js; build/smoke.js
**Interfaces:** `isReady(u)` shared predicate; `checkpoint(label)` records pre-mutation progress; `undoProgress()` restores progress; `normalizeState(raw)` defaults maps and cleans plan/raid; `planView` is ephemeral all/raid.

- [ ] Add regression assertions for safe completed-card planning, partial material counts, independent OR rows, raid subset persistence/cleanup and Undo. Run smoke; expect assertions to fail before implementation.
- [ ] Implement raid map, normalization, 20-entry mutation history, progress-only restoration, shared readiness, Plan subset, remaining counts and explicit tool rows. All progress actions checkpoint once; imports validate before replacing.
- [ ] Run `mise exec bun -- bun build/smoke.js`; expect full green including previous behavior except intentionally replaced completed-card replanning.
- [ ] Commit state/Plan behavior.

### Task 2: Discovery and navigation

**Files:** app.js; index.html; build/smoke.js
**Interfaces:** Task 1 state helpers; `revealUpgrade(id)` navigation; `addPrerequisites(u)` batch mutation; `clearFilters()`; `renderWelcome()`.

- [ ] Add behavior tests: onboarding hides on progress; availability/category filters intersect; prerequisite reveal bypasses hiding filters; recursive prerequisite add is one undo step; locked cards never say ready; totals exclude repeatables from completed denominator.
- [ ] Run smoke to confirm expected failures.
- [ ] Implement native Progress/Settings disclosures, welcome/help, summary, filters, effects, completed guard, actionable prerequisites and Plan goal/focus controls. Include clear empty states and source-specific tool labels.
- [ ] Run full smoke suite; commit discovery changes.

### Task 3: Keyboard/mobile interaction and layout

**Files:** app.js; index.html; style.css; build/smoke.js
**Interfaces:** Existing render wrapper preserves focus/scroll using stable data-focus keys; sheet controller exposes close for reveal navigation.

- [ ] Extend shim to model focus, parentage, query selectors, document listeners and media changes. Add keyboard tests for card/section native buttons, pinned tooltip close/focus, closed sheet inert content, modal escape/tab, resize and focus restoration after render.
- [ ] Run smoke to confirm expected failures.
- [ ] Implement separate disclosure buttons, explicit group-details controls, stable focus restoration, sheet modal focus lifecycle, close/escape handling, responsive touch targets, compact toolbar wrapping, reduced motion and 375px guardrails.
- [ ] Run smoke and Bun parser validation. Inspect browser if available; otherwise explicitly record visual verification limitation.
- [ ] Commit interaction/layout changes.

### Task 4: Documentation and final review

**Files:** README.md; AGENTS.md; implementation files as required by review.

- [ ] Update state/behavior docs and Bun commands; ensure HTML/JS static control IDs match.
- [ ] Run full smoke, Bun parser check, and git diff --check; verify data payloads unchanged.
- [ ] Dispatch fresh whole-branch reviewer against spec and Review Focus above. Reproduce important findings with failing tests, fix, and rerun suite.
- [ ] Commit final changes and report branch/worktree, verification and visual limitations. Do not merge/push/publish.
