---
worth: yes
where: src/api/objectAdapters.js:521
added: 2026-11-03
---
# rack position/slot conversion is split across two helpers

`rackPositionToSlot` and `slotToRackPosition` convert between the API's `position` (physically topmost unit, in the rack's numbering direction) and the internal bottom-up slot. The rules for both numbering directions still need a paragraph, and the docblock on `rackPlacementToApiPayload` had drifted into contradicting it (fixed during the trim). One documented helper owning both directions would stop that recurring.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
