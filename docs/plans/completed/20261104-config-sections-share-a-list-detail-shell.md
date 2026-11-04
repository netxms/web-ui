# Config list/detail sections share one shell

Implements `docs/backlog/config-sections-share-a-list-detail-shell.md`. Refactor: no intended
behavior change beyond the normalizations listed per task.

## Tandem

| Task | Writer | Reviewer |
|---|---|---|
| 1 | claude | codex |
| 2 | codex | claude |
| 3 | codex | claude |
| 4 | claude | codex |
| 5 | claude | codex |

## Context

Ten sections in `src/views/configuration/sections/` are the same route-driven list/detail screen
(`useEntityDetail`, list kept mounted with `v-show`, detail branch on `entityId`): Actions,
EventForwarders, ChatBots, AssetManagementSchema, DciSummaryTables, ScheduledTasks, ObjectTools,
EventTemplates, MappingTables, SnmpTrapMappings. Each repeats SectionHeader with Refresh + Add,
the filter toolbar with item count, a Skeleton loop, AppTable wiring, the ellipsis column and
EntityContextMenu, `confirm.require` + toasts on delete, the Loading / Error / Not Found detail
branch, and ~80 lines of scoped CSS.

Out of scope, stay custom: split-pane sections (NotificationChannels, ScriptLibrary,
WebServiceDefinitions, ImageLibrary, GeographicalAreas, SshKeys, ObjectCategories,
AlarmCategories), list-only sections without a detail route (PersistentStorage, AgentTunnels,
ServerConfig), EPP, UsersGroups, AiAssistant. The `*DetailView.vue` editors are untouched; their
draft/dirty contract belongs to `docs/backlog/entity-editors-lose-or-overwrite-unsaved-edits.md`.

### Shared pieces (Task 1 builds them, later tasks may extend them)

- `src/components/layout/EntityListSection.vue`: the whole section. `detail` prop + `#detail`
  slot renders the detail wrapper (`v-if`); the list half stays mounted under `v-show`. List half:
  SectionHeader (`title`, `icon`, Refresh always, Add when `addLabel` is set; `#header-actions`
  slot for extras), RefetchIndicator, toolbar (SmartFilterInput `v-model:filter`,
  `filterPlaceholder`, count from `countNoun` via `$plural`; `#toolbar` slot for extra controls),
  `#before-table` slot (selection bars), loading placeholder, AppTable with `rows`, `columns`,
  `error`, `storageKey`, `targetFor`, `emptyText`, other AppTable props/listeners through `$attrs`.
  It renders the `actions` column's ellipsis button itself and owns EntityContextMenu: right-click
  and the button both open it with `menuItems(row)`. Emits `refresh`, `add`, `row-click`;
  AppTable's `retry` is wired to `refresh`. `inheritAttrs: false`, `$attrs` bound on the AppTable
  only. `detail` is only a visibility switch and `#detail` an opaque slot; the section keeps the
  route, "new" and editor precedence.
- `src/components/layout/EntityDetailState.vue`: the non-editor detail states with
  EntityDetailHeader + back: loading skeleton, `error` (QueryErrorState + retry), not found
  (`notFoundText`), and restricted (`restrictedRight` → RestrictedState) for "new" without the
  right.
- `src/composables/useConfirmDelete.js`: single-target only. `confirm.require` with the standard
  danger dialog, runs a promise-returning delete (`mutateAsync`), success toast (3000 ms) and error
  toast (5000 ms) with an `errorDetail(err)` hook for 409-style messages, falling back to
  `err.message`, then to a fallback text. Returns a promise of `true` only after a successful
  delete; cancel, dismiss and failure give `false`; a rejected `mutateAsync` is caught, never
  unhandled. Callers `closeDetail()` only on `true`.
- Batch deletion (MappingTables, SnmpTrapMappings) keeps its own confirm handler: one dialog for
  all targets, every target attempted, one error toast per failed target, no success toast,
  selection cleared on accept. It does not go through `useConfirmDelete`.
- Shared CSS lives in the shell. Classes used inside cell slots (`.text-muted`, `.empty-message`)
  are styled by the slot owner's scope; use `:slotted()` in the shell only if it is verified to
  reach nested cell content, otherwise each section keeps those two rules.
- List loading uses `TableSkeleton` with the table's column widths (numeric `width` converted to
  `px` tracks, never raw column objects or bare numbers; overflow contained at narrow width)
  instead of the hand-rolled
  `<Skeleton class="mb-2">` loop (whose `mb-*` classes are undefined, see
  `docs/backlog/undefined-margin-utility-classes.md`; that item stays open for the other files).

Each migrated section keeps: its queries, `useWorkingState` filter key, filter predicate, columns,
`#cell` content for its own columns, menu items, delete messages, create/rename routing, and the
detail editor component with its props and events.

## Validation

After each task: `yarn test:unit`, `yarn lint:ci`, `yarn build`.

e2e specs run in the mode each one supports, chosen explicitly per run, not from `.env.local`:
- `e2e/writeControls.spec.js` skips on a real server; run it with `VITE_USE_MOCKS=true` in Task 1
  (Actions) and Task 3 (ObjectTools, EventTemplates).
- `e2e/configCrud.spec.js` skips under mocks; run it against the real server in Task 4
  (MappingTables, SnmpTrapMappings) when one is configured, otherwise report it as not run. Task
  4's section specs are the fallback that always runs.

Manual check (list, filter, empty filter result, context menu, detail, new, not found via a bogus
id in the URL, light and dark): under mocks for the sections with fixtures (Actions,
AssetManagementSchema, DciSummaryTables, EventTemplates, ObjectTools); against the real server
for the rest (EventForwarders, ChatBots, ScheduledTasks, MappingTables, SnmpTrapMappings), or
reported as not checked when none is available.

### Task 1: Shell, detail states, delete helper; pilot on Actions and EventForwarders

Files: `src/components/layout/EntityListSection.vue`, `src/components/layout/EntityDetailState.vue`,
`src/composables/useConfirmDelete.js`, specs in `src/components/layout/__tests__/` and
`src/composables/__tests__/`, `src/views/configuration/sections/ActionsSection.vue`,
`src/views/configuration/sections/EventForwardersSection.vue`

- [x] Build `EntityListSection`, `EntityDetailState`, `useConfirmDelete` as described above,
      shaped by what Actions and EventForwarders need; no props for cases no pilot uses yet.
- [x] Migrate ActionsSection: View/Edit label and Delete visibility by `manageActions`,
      restricted "new", 409 message.
- [x] Migrate EventForwardersSection: keyed by name, `@created` → `openDetail`, rename via
      `onSaved`, `closeDetail()` after deleting while in detail, 409 message.
- [x] Specs: EntityListSection (count text, Add hidden without `addLabel`, ellipsis button and
      right-click open the menu with that row's items, `row-click` and `refresh` emitted, AppTable
      `retry` emits `refresh`, filter v-model, loading placeholder instead of the table, `error`
      reaches AppTable, forwarded attrs and listeners land once and only on AppTable, the same
      AppTable instance survives list → detail → list); EntityDetailState (each state, `back` and
      `retry` emits); useConfirmDelete (reject and dismiss run nothing and give `false`, accept
      runs the delete, toasts success and gives `true`, failure toasts `errorDetail(err)`, then
      `err.message`, then the fallback text, gives `false` and leaves no unhandled rejection).
- [x] Normalization: EventForwarders error toast life 6000 → 5000.
- ➕ Skeleton tracks are `minmax(0, <width>fr)`, not `px`: every migrated table uses
  `resize-fit`, which scales columns to the container, so width-weighted `fr` matches the table
  and cannot overflow.
- ➕ `useConfirmDelete` options: `message`, `run`, `successDetail`, `failureDetail`, `errorDetail`.
  The shell defaults AppTable to `striped`, `column-borders`, `resize-fit`, `page-size` 50;
  attributes override them.
- ➕ `.text-muted` stays in each section's scoped CSS (no `:slotted()`). The shell's empty
  message takes EventForwarders' `max-width: 32rem` for every section. Detail skeleton rows are
  spaced by a flex gap instead of the undefined `mb-*` classes.
- ➕ Actions: the four identical "value or -" cells collapse into one fallback branch; the no-op
  `@saved="() => {}"` is gone.
- ⚠️ EventForwarders manual check not done: no real server configured. Under mocks its endpoint
  404s, which showed the list error inside the table (light, dark, narrow). Actions checked under
  mocks; `writeControls.spec.js` passed under mocks (14/14).

### Task 2: ChatBots, AssetManagementSchema, DciSummaryTables, ScheduledTasks

Files: those four `*Section.vue`, the shell/helper and their specs if extended.

- [x] ChatBots: keyed by name, created/rename routing as EventForwarders, `closeDetail()` after
      delete in detail.
- [x] AssetManagementSchema: keyed by name, its delete message.
- [x] DciSummaryTables: Clone menu item. Normalization: its detail branch moves to
      EntityDetailState, which adds the header on loading/error and a Not Found state it lacks.
- [x] ScheduledTasks: filter-options button and Popover through `#toolbar`, computed columns
      (system column), Delete disabled for system tasks.
- ➕ AssetManagementSchema and ScheduledTasks use the shell's 300px filter width (previously
  320px and 280px); AssetManagementSchema uses the shared PrimeVue row-menu button. All four
  keep their own cell styles; the shell owns the empty-message style and loading placeholders.
- ➕ Validation: full unit suite 4082 passed / 15 skipped, lint zero errors (121 existing
  warnings), production build passed. Browser checks with mocks in light and dark covered
  AssetManagementSchema and DciSummaryTables list, filter, empty result, menu, detail/back,
  new form and bogus-id route; the mock account was granted the required rights locally.
- ⚠️ No real server configured: ChatBots and ScheduledTasks were not checked in a browser.
  AssetManagementSchema has only a list fixture, so its existing and bogus-id detail routes
  exercised the error state, not a populated editor; DciSummaryTables exercised its populated
  editor. No live CRUD was attempted.

### Task 3: ObjectTools, EventTemplates

Files: those two `*Section.vue`, the shell/helper and their specs if extended.

- [x] ObjectTools: toggle column, Enable/Disable item, View/Edit by `manageTools`, restricted
      "new", `closeDetail()` when the deleted tool is open. Normalization: its detail branch moves
      to EntityDetailState, which adds the header on loading/error and a Not Found state it lacks.
- [x] EventTemplates: keyed by code, View/Edit by `editEventDb`, restricted "new", Delete disabled
      for system templates.
- ➕ EventTemplates uses the shared PrimeVue row-menu button; both sections use the shell's
  empty-message style and loading placeholders. ObjectTools retains loading-first editor
  precedence and closes detail after delete only when the deleted tool is still open.
- ➕ Validation: full unit suite 4082 passed / 15 skipped; lint zero errors (121 existing
  warnings); production and demo builds passed; `writeControls.spec.js` passed under mocks
  (14/14). Browser checks in light and dark covered both sections' list, filter, empty result,
  menus, populated editor/back (filter preserved), new form and bogus-id routes; system-event
  Delete was disabled, and a nonnumeric ObjectTools route showed the new Not Found state.
- ⚠️ No real-server check or live mutation was attempted.

### Task 4: MappingTables, SnmpTrapMappings; close the backlog item

Files: those two `*Section.vue`, the shell/helper and their specs if extended,
`docs/backlog/config-sections-share-a-list-detail-shell.md`

- [x] Both: `selectable` + `selected-ids` + `@selection-change` through `$attrs`, the selection bar
      through `#before-table`, multi-row Delete and Edit disabled for several rows, `onCreated`
      with `router.replace`, the `detail.id === detailId` identity check before rendering the
      editor. Batch delete keeps its own confirm handler and behavior (see Shared pieces).
- [x] Section specs for both (mocked queries, the real shell): selection through
      `selected-ids`/`selection-change` reaches the selection bar, the context menu on a selected
      row targets the whole selection (Edit disabled, "Delete (n)"), cancel deletes nothing,
      accept attempts every target and clears the selection, one target failing toasts that
      target and still deletes the others.
- [x] Normalization: list errors go through AppTable `:error` instead of a separate
      QueryErrorState branch.
- [x] `git rm docs/backlog/config-sections-share-a-list-detail-shell.md`.
- ➕ Both empty states have two variants and inline markup, so the shell gained an `empty` slot
  that replaces `emptyText` (now optional); the shell spec covers it.
- ➕ Section specs live in one file, `sections/__tests__/batchDeleteSections.spec.js`, run over
  both sections; they also cover the menu on an unselected row while others are selected.
- ➕ Detail states normalize too: "Loading..." with three skeleton rows becomes
  EntityDetailState's "Loading…".
- ⚠️ `configCrud.spec.js` not run: no real server configured. Under mocks both sections have no
  fixtures, so the light/dark gallery shots only showed the list error inside the table.

### Task 5: Close the plan

- [x] Move this file to `docs/plans/completed/`.
- ➕ Branch review (revmux, comprehensive, 4/4 sources): 1 major, 2 minor, all fixed in the
  task commits they belong to, then a `final` round over the fixes found nothing.
  - Batch delete (Task 4): one `useMutation` observer keeps only the last `mutate()` call's
    callbacks, so an earlier failed target got no toast. Each target's `mutateAsync` promise is now
    caught on its own. The section spec keeps the real delete hooks on a real `QueryClient`, mocks
    only the API and fails late; its failure cases fail on the old handlers. The batch confirm now
    says "SNMP traps".
  - `useConfirmDelete` (Task 1) resolves `true` only while the caller's scope is alive, so a delete
    that completes after a section switch cannot close another section's editor.
  - `docs/backlog/undefined-margin-utility-classes.md` (Task 4) no longer names code this branch
    removed; it gives a grep pattern instead of counts.
