---
worth: later
where: src/utils/objectQueryScript.js:119
added: 2026-11-03
---
# substring object search treats typed * and ? as wildcards

Substring mode wraps the text as `*text*` and `nxslString` escapes only quotes, backslashes and control characters, so a `*` or `?` the user types still acts as an `ilike` wildcard. (The old comment claimed otherwise; it was removed in the trim.) Open: whether NXSL `ilike` can escape wildcards at all, and how the legacy client behaves.
