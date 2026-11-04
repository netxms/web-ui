---
worth: yes
where: src/composables/useLogLiveTail.js:228
added: 2026-11-04
---
# live tail treats the first poll after an empty seed as another seed

After a successful but empty seed the cursor stays `null`, so the next poll that brings rows is
still classed as seeding: its rows get no arrival highlight (`accept()` stamps on
`cursor === null`) and a full page skips catch-up, so a burst larger than one page loses its
older rows. Key both on whether a poll has succeeded since the restart (the `seeded` flag the
`history` option added) rather than on the cursor; needs burst and arrival specs. Found by Codex
reviewing the `history` change; the behavior predates it.
