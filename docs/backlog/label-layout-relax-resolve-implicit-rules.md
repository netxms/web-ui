---
worth: yes
where: src/utils/networkMapLabelLayout.js
added: 2026-11-03
---
# label layout relax/resolve rules are implicit

The sleep/wake and drift-home rules in `relax()` / `resolve()` only make sense with their comments. Split into named steps (e.g. `scanContacts`, `applyMoves`, `updateSleep`).

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
