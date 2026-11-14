# Keyboard accessibility implementation plan

Goal: Complete the approved export dialog, shortcut help, and navigation pass.
Architecture: Native dialogs for export/help; existing palette commands and Plan sheet helpers; keyboard-visible skip links. No dependencies, file:// compatible.
Spec: User-approved next steps 1–3, with help accessible as a command and ? shortcut. Requirement-row navigation is deferred.

- [x] Add smoke regressions for help command/?, editable and modal guards, focus restoration, jump commands, and export fallback.
- [x] Implement native export/help dialogs, contextual help content, skip links, and navigation commands.
- [x] Run Bun smoke/parse checks, inspect native-browser focus and layout, request independent review, fix material findings, and update PR branch.

Review focus: Shift-? must work; text entry and existing modals must retain their keys; mobile Plan must open before receiving focus; export fallback must restore focus; skip links must move keyboard focus, not just scroll.

Verification: Bun smoke suite and JS parse check pass; git diff --check clean.
Native Waterfox file:// checks: Shift-?; Help command; Tab containment; Escape focus restoration; ? typed in search; upgrades jump; mobile Plan jump and inert skip links; Help layout at 375px.
Independent review: fixed important inert skip-navigation omission with a failing regression first. Native testing found and fixed utility Tab wrapping with a failing regression first.
Deferred minor: provide a disable/remap preference for the global ? shortcut. VoiceOver speech verification remains unperformed.
