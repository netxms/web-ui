---
worth: yes
where: src/config/propertySections.js:418
added: 2026-11-03
---
# property sections sort shared override arrays in place

`allSections.sort` mutates the shared override arrays. It works because the sort is stable, but it is surprising; sort a copy.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
