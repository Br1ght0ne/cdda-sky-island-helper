# Complete UI usability pass

Status: approved by user and implemented on codex/ui-usability-pass.

## Intent and scope

Help players decide what to unlock and what to bring home from their next raid,
while reducing tracking mistakes. The user selected the complete usability pass:
onboarding, toolbar organization, progress, filters, remaining quantities, Next
raid focus, benefit summaries, prerequisite navigation/planning, Undo, mobile and
keyboard improvements, and consistent readiness.

Profiles, shareable plans, downloadable backups, inventory allocation, promotion,
and hosting changes are deferred. Keep the terminal-inspired dark/light styling.

## Approaches

1. Focused UI pass: reorganize existing controls, onboarding, progress, filters,
   accessibility, and readiness labels. Smaller change, but leaves raid planning
   and recovery friction unresolved.
2. Complete usability pass: the above plus remaining quantities, raid focus,
   card benefits, actionable prerequisites, and Undo. The user chose this scope.

Implementation proposal: extend the existing IIFE and single state/render model.
No framework, backend, remote assets, runtime fetch, or new build step. Existing
saved progress remains compatible. Generated data files are not edited.

## Page and controls

- Search remains the first control row, with an accessible label.
- The second row keeps Hide done and Only in plan, adds category and availability
  selects, and retains Expand/Collapse all.
- Availability options: All, Available now, Missing one requirement. Available
  now means incomplete and without tracked prerequisite blockers, not necessarily
  all ingredients gathered. A helper explains that untracked in-game conditions
  may still apply. Missing one requirement means incomplete, unblocked, and
  exactly one unmet component group, tool quality, or tool requirement.
- Category defaults to All categories and lists enabled data categories grouped
  by their existing section where useful. Disabling Xedra resets an invalid
  category selection. Filters combine with search and each other.
- A labeled Progress disclosure groups Export progress, Import progress, Import
  game save, Reset progress, and Undo. A Settings disclosure holds Xedra; theme
  remains readily accessible. Native disclosure semantics avoid a custom menu.
- Empty search/filter results offer Clear filters. Search still bypasses section
  collapse. Filters and search remain ephemeral and never alter tracker progress.
- The top summary shows completed/total one-time upgrades, planned upgrades,
  ready planned upgrades, and separately total repeatable crafts. Enabled content
  determines totals; search/filtering does not. Show visible result count apart
  from overall progress. Use ordinary text rather than a dashboard of large tiles.

## First-run guidance

Show a small welcome panel when there is no tracked progress. It offers Import
your save (existing file picker) and Choose your first upgrade (reveals and
focuses the first enabled, incomplete, unblocked one-time card in data order).
Explain that master.gsav imports completed upgrades, not gathered inventory or
tools, and that progress is saved in this browser. Do not label the first card
an optimal strategy. Dismissal is a separate UI preference, excluded from tracker
export/import/reset. Progress import/save import and normal use hide the panel
once meaningful progress exists; users can reopen help from Settings.

## Cards and prerequisites

- Display the existing effect text below the title, removing only presentation
  prefixes such as EFFECT. Clamp long text visually; the expanded card retains
  the full effect and description. Do not invent benefits from misleading or
  incomplete extracted descriptions, and do not edit generated data.
- Progress reads N/M requirements met. Ready to craft is reserved for incomplete,
  unblocked upgrades with all requirements met. A blocked card with gathered
  requirements says Requirements met · prerequisite missing. Completed cards
  say Completed. Share one readiness helper across cards, Plan, and totals.
- Make each missing prerequisite a button that reveals its card, clearing only
  filters that would otherwise hide it, expanding its group/card, scrolling it
  into view, and focusing its disclosure control. Show a short notification if
  filters changed. Do not enable optional content implicitly.
- Add missing prerequisites to Plan walks the prerequisite graph recursively,
  adds enabled incomplete ancestors once, and also plans the selected target.
  It preserves existing progress and does not automatically focus them for a
  raid. Guard against cycles and explain any disabled-content blocker.
- Completed one-time upgrades have a clear Completed state; planning them no
  longer silently clears completion. Reopening uses an explicit Mark incomplete
  action/checkbox first. Completion still removes an upgrade from the Plan.
- Each planned incomplete card has a Next raid toggle. The Plan also lists its
  selected upgrade names with reveal-card and focus controls so users can manage
  focus without finding cards in the full catalog.

## Plan and Next raid

Add All planned / Next raid view buttons with counts. Next raid is a subset of
existing planned upgrade IDs, persisted as a new `raid` map in tracker state;
older saves default to an empty map. Selecting raid focus implies planning when
needed, without changing completion. Removing a plan entry or completing it also
removes its raid focus. A repeatable craft stays planned and focused after a
craft, while its ingredient quantities reset as before.

Only the selected Plan view contributes material rows, tool requirements, ready
rows, and panel counts. All planned is the default on load; switching views is
ephemeral. An empty Next raid view explains how to select goals and offers a
return to All planned. The existing Clear action explicitly clears the entire
Plan and all raid selections (with its confirmation), regardless of view; no
second bulk-clear button. Disabled optional content is excluded from both views
but its plan/focus/progress state is retained.

The Next raid view emphasizes missing materials and tools, hiding satisfied
requirement rows; All planned retains satisfied rows below missing ones. Ready
goals remain visible in both modes when selected. Ingredient checkboxes update
only contributing upgrades in the current view; shared qualities remain global.

## Remaining quantities and alternatives

For an unmet component group, each alternative's remaining count is
`max(0, required - trackedQuantity)`. A manually checked group or a group satisfied
by any one alternative contributes zero. Quantities remain per-upgrade allocations,
not a shared inventory: ten nails entered on two cards are twenty allocated nails.

Single-alternative rows aggregate remaining counts across selected upgrades.
For OR groups, show each contributing requirement separately with its own
remaining alternatives and source upgrade; do not aggregate independent choices
into an apparently mandatory combined OR choice. A group can be completed with
any one alternative; partial different alternatives are not combined. LIST
pseudo-items keep their current unit and expansion tooltip semantics. For example,
20 required nails with 8 gathered becomes 12 more nails; a requirement of 10 nails
OR 2 sheets with 4 nails recorded becomes 6 more nails OR 2 sheets.

Satisfied rows in All planned show gathered/completed status and original amounts,
not a misleading zero-required recipe. Preserve shard prominence and display
its gathered/required total alongside the remaining amount. Include explicit
non-quality tool requirements in the Plan as well as qualities, so the checklist
and readiness agree. Their ownership retains the existing per-upgrade semantics.

## Undo and state safety

Use a small bounded in-memory undo history (20 user mutations). Snapshot tracker
progress for plan/focus changes, completion, crafting/count reset, ingredient and
tool changes, prerequisite batch planning, Clear, Reset, and imports. Treat each
bulk operation as one undo step. Do not record search, filters, expand/collapse,
theme, or ordinary renders. Undo restores progress without reverting current
card/section open state or UI preferences; it updates all views and persistence.
A new mutation replaces the most recent toast but does not erase earlier undo
history. No redo or persisted history in this pass.

Show a descriptive Undo action in the toast after discrete progress actions and
keep Undo available in Progress after the toast expires. Avoid toast spam for
rapid steppers; keep their undo accessible in Progress. Use accessible labels
that name the action being undone. Retain confirmations for Reset, Clear, save
import, and crafted-count reset. Cancelled/failed imports create no history entry.
Imports that replace progress normalize the added raid map and exclude orphaned,
completed, or unplanned focus IDs. Save import retains the Xedra setting, marks
newly completed IDs, and removes their plan/focus entries consistently.

## Mobile and keyboard behavior

- Use real buttons for card and section disclosures, separate from their child
  actions and links; maintain aria-expanded/aria-controls and visible focus.
- Give steppers and primary touch actions roughly 44px hit areas on mobile,
  wrapping layout as needed rather than shrinking numbers or clipping controls.
- Item-group details have an explicit keyboard/touch-operable button. Preserve
  desktop hover/freeze behavior and accent-green styling. Click or Enter pins
  the details, Escape/Close dismisses and returns focus, and links are reachable
  without a hover timer. Real item links never toggle a card or checkbox.
- Preserve focus and Plan scroll across full renders; fall back to a logical
  nearby control when an action removes its source card/row.
- Closed mobile Plan content is excluded from keyboard navigation. Opening the
  modal sheet moves focus inside, prevents background keyboard interaction, and
  Escape/backdrop/handle closes it and restores focus. Desktop remains a sidebar;
  switching breakpoints releases any mobile focus restriction.
- Preserve top:auto on the mobile sheet and touch-action:manipulation. Respect
  reduced motion. Keep layouts usable down to 375px without horizontal scrolling.

## Validation and delivery

Use Bun via mise, as requested. Extend the hand-rolled DOM shim only for APIs the
implementation uses. Add behavioral coverage for remaining quantities and OR
choices; raid scoping/persistence/cleanup; readiness consistency; prerequisites;
filters and counts; onboarding; undo after bulk operations/imports; keyboard
controls and focus restoration; existing Xedra, theme, and repeatable behavior.
Run `mise exec bun -- bun build/smoke.js` and a Bun parser check without creating
build outputs in the repository. Run applicable existing formatting checks if
available. No package installation is needed for the product.

DOM-shim tests cannot establish visual layout correctness. Inspect in an available
browser if possible; otherwise explicitly report the limitation and request a
375px and desktop visual check. Update README and AGENTS.md for new behavior,
state fields, and the Bun test command. Keep the work on the requested isolated
branch/worktree; do not publish or merge it as part of this pass.

## Builder discretion

Exact spacing, icons, notification durations, helper organization, and test layout
are implementation decisions. The choices above concerning raid persistence,
Undo depth, filter semantics, onboarding dismissal, and non-aggregated OR groups
are proposals by the assistant for review, not prior user-specified details.
