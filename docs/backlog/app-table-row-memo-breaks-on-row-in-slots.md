---
worth: yes
where: src/components/common/AppTable.vue:842
added: 2026-11-03
---
# AppTable rows re-render if forwarded slots mention row

Rows skip re-rendering only while the forwarded slots never reference `row` or `rowIdx`. Nothing checks it, and the regression is silent (performance only). Add a test that guards it, or change how slots are forwarded.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
