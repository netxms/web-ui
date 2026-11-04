---
worth: yes
where: src/components/common/AppTable.vue
added: 2026-11-04
---
# AppTable empty and error states do not wrap

Body cells are `white-space: nowrap; overflow: hidden`, and `.app-table__state-cell` (empty, error and
loading rows) inherits that. An empty-state sentence longer than the table is cut off at the right edge
instead of wrapping, even inside the `max-width` box `EntityListSection` gives its empty message: Event
Forwarders, Chat Bots, Mapping Tables and SNMP Traps on an empty server, worst at narrow width. Already
the case before the list/detail shell; the shell kept the same markup.

Fix: `white-space: normal` on `.app-table__state-cell` in `AppTable.vue`, which covers every table's
`#empty` slot and the error message. Check a long `QueryErrorState` message there too.
