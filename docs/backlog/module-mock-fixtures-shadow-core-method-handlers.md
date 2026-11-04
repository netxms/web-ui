---
worth: later
where: vite-plugin-mock-api.js:132
added: 2026-10-28
---
# module mock fixtures shadow core method handlers

Each mock folder runs its whole lookup before the next, so an object fixture in a module's mock
folder (`v1/objects/<id>.json`) answers every method for that object. A `PATCH` of it gets the
unchanged fixture back, and core's `mocks/v1/objects/_.PATCH.js` never runs, so no override is
recorded either. Before module fixtures moved out of core, core's JS handler ran ahead of the same
JSON file. Only dev mock runs are affected, and no current caller reads the PATCH response, which
is why it was left. Worth settling once a module view edits objects in mock runs: then the module
ships its own `_.PATCH.js`, or the lookup tries method-specific candidates across all folders
before method-neutral ones.
