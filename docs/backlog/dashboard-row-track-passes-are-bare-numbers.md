---
worth: yes
where: src/utils/dashboardUtils.js:75
added: 2026-11-03
---
# dashboard row-track fill passes are bare numbers

`computeRowTracks` runs its fill passes as bare numbers 0-3, and only a comment says what each one means. Named constants (or one function per pass) would make the order readable from the code.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
