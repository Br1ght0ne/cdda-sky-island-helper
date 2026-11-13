# Command palette and card keyboard navigation

User selected the palette first, with Up/Down/Enter card navigation and optional
Vim j/k aliases in Settings. Extend the existing offline IIFE; no dependencies.

- Commands button next to search and Cmd/Ctrl-K open a native dialog. Close other
  transient UI first. Search upgrades across enabled content and useful commands.
- Up/Down select results, Enter runs, Escape/backdrop closes and restores focus.
  Expose combobox/listbox selection to assistive technology. Empty results explain
  that nothing matches; Enter on them is inert. Focus remains in the search field.
- Commands: reveal upgrade; switch All planned/Next raid; toggle Hide done/Only in
  plan; Undo when available; Expand/Collapse all. When opened from a card, also
  offer plan/remove, raid selection, and adding missing prerequisites where valid.
  Reuse existing mutation/Undo/render functions, and existing prerequisite reveal.
- On focused card disclosure buttons, Up/Down move through rendered cards and
  Enter toggles expansion. Clamp at boundaries. Ignore modifiers, editable fields,
  dialogs and other controls. Do not override browser/OS shortcuts elsewhere.
- Settings: Use Vim j/k navigation, off by default, stored in skyisland.vim-keys
  independently of tracker state. j moves down, k up in the same scoped context.
- Native dialog provides modal focus semantics. Opening from a card and executing
  an action resolves the replacement card by ID if a render removed the opener.
- Verify palette keyboard flow, no-results, hidden optional content, modal focus
  return, contextual planning and Undo, filtered navigation, Vim opt-in and typing
  guards with the DOM shim. Inspect desktop/375px layouts in the host browser.
