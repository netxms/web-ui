---
worth: yes
where: src/views/objects/subviews/PropertiesView.vue
added: 2026-11-04
---
# PropertiesView duplicates useObjectPropertiesEditor save logic

`useObjectPropertiesEditor.js` repeats `PropertiesView.vue` from `pick`/`confirmEmptyAcl` onward: empty-ACL confirmation, status calculation diff, custom-attribute, responsible-user and trusted-object diffs, ACL serialization, auto-bind fields. Only `NetworkMapPropertiesView.vue` uses the composable. A permission or save fix has to land twice.

Fix: extract the common diff-to-mutation operations into one place both use; keep PropertiesView's class-specific saves local (do not force it through the generic editor). Keep the empty-ACL confirmation before any write, so a cancel saves nothing.

Joint codebase-size review with codex.
