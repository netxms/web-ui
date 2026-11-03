---
worth: yes
where: src/utils/dciChartModel.js:188
added: 2026-11-03
---
# DCI chart FLAGS entries repeat the same setter code

Every `FLAGS` entry spells out the same getter/setter shape. Generating the entries from a `[name, path, value]` list would shrink it to data.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
