---
worth: yes
where: src/utils/networkMapOverflowTables.js:507
added: 2026-11-03
---
# overflow table layout keeps two passes in step implicitly

`layoutLabelsWithTables()` / `splitSecondPass()` keep warm state for two passes (p1/p2) in step without anything owning it. A small object holding both passes would make the invariant structural.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
