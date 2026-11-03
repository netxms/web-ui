<script setup>
import { computed, ref, toRef } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import { useUsers, useUserGroups } from '@/queries/useUserQueries'
import { useInheritedAccessRights } from '@/composables/useInheritedAccessRights'
import {
  groupObjectAccessRights,
  EVERYONE_GROUP_ID,
  SYSTEM_USER_ID,
  isGroupId,
  hasAccessBit,
  setAccessBit,
  summarizeAccess,
} from '@/auth/objectAccessRights'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const { data: usersData } = useUsers()
const { data: groupsData } = useUserGroups()

const selectedUserId = ref(null)
const addMode = ref(false)
const addFilter = ref('')

const canInherit = computed(() => (props.object.parents ?? []).length > 0)

const rightsGroups = computed(groupObjectAccessRights)

// The user/group directory comes back empty on 403.
const entityMap = computed(() => {
  const map = new Map()
  for (const g of groupsData.value ?? []) {
    map.set(g.id, { id: g.id, name: g.name, kind: 'group' })
  }
  for (const u of usersData.value ?? []) {
    map.set(u.id, { id: u.id, name: u.fullName || u.name, kind: 'user' })
  }
  return map
})

function entityKind(userId) {
  return isGroupId(userId) ? 'group' : 'user'
}

function displayName(userId) {
  const known = entityMap.value.get(userId)
  if (known) return known.name
  if (userId === EVERYONE_GROUP_ID) return 'Everyone'
  if (userId === SYSTEM_USER_ID) return 'system'
  return `[${userId}]`
}

const { inheritedEntries } = useInheritedAccessRights(
  toRef(props, 'object'),
  computed(() => props.draft.inheritAccessRights),
)

const directIds = computed(() => new Set((props.draft.accessList ?? []).map((e) => e.userId)))

const directRows = computed(() =>
  (props.draft.accessList ?? []).map((e) => ({
    userId: e.userId,
    access: e.access,
    inherited: false,
    name: displayName(e.userId),
    kind: entityKind(e.userId),
    summary: summarizeAccess(e.access),
  })),
)

const inheritedRows = computed(() =>
  inheritedEntries.value
    .filter((e) => !directIds.value.has(e.userId))
    .map((e) => ({
      userId: e.userId,
      access: e.access,
      inherited: true,
      name: displayName(e.userId),
      kind: entityKind(e.userId),
      summary: summarizeAccess(e.access),
      sourceObjectName: e.sourceObjectName,
    })),
)

const aclRows = computed(() => [...directRows.value, ...inheritedRows.value])

const selectedRow = computed(
  () => aclRows.value.find((r) => r.userId === selectedUserId.value) ?? null,
)

const rightsEditable = computed(() => selectedRow.value != null && !selectedRow.value.inherited)

const availableEntries = computed(() => {
  const q = addFilter.value.toLowerCase()
  return [...entityMap.value.values()]
    .filter((e) => !directIds.value.has(e.id))
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
})

function selectRow(userId) {
  selectedUserId.value = userId
}

function openAdd() {
  addMode.value = true
  addFilter.value = ''
}

function cancelAdd() {
  addMode.value = false
}

function addEntry(entity) {
  if (!directIds.value.has(entity.id)) {
    props.draft.accessList = [...(props.draft.accessList ?? []), { userId: entity.id, access: 0 }]
  }
  selectedUserId.value = entity.id
  addMode.value = false
}

function removeSelected() {
  if (selectedUserId.value == null) return
  props.draft.accessList = (props.draft.accessList ?? []).filter(
    (e) => e.userId !== selectedUserId.value,
  )
  selectedUserId.value = null
}

function isChecked(mask) {
  return selectedRow.value != null && hasAccessBit(selectedRow.value.access, mask)
}

function toggleRight(mask, on) {
  const idx = (props.draft.accessList ?? []).findIndex((e) => e.userId === selectedUserId.value)
  if (idx === -1) return
  const entry = props.draft.accessList[idx]
  props.draft.accessList[idx] = { ...entry, access: setAccessBit(entry.access, mask, on) }
}
</script>

<template>
  <div class="access-control-section">
    <div class="inherit-row">
      <Checkbox
        v-model="draft.inheritAccessRights"
        :binary="true"
        :disabled="!canInherit"
        input-id="inherit-access"
      />
      <label for="inherit-access" class="inherit-label">
        Inherit access rights from parent object(s)
      </label>
      <span v-if="!canInherit" class="inherit-hint">(object has no parents)</span>
    </div>

    <div class="acl-picker">
      <div class="acl-col acl-col--entries">
        <div class="col-header">
          Users and Groups
          <span class="count">({{ aclRows.length }})</span>
          <span class="col-header-actions">
            <Button
              icon="pi pi-plus"
              label="Add"
              text
              size="small"
              severity="secondary"
              @click="openAdd"
            />
            <Button
              icon="pi pi-times"
              label="Delete"
              text
              size="small"
              severity="danger"
              :disabled="!rightsEditable"
              @click="removeSelected"
            />
          </span>
        </div>
        <div class="entity-list">
          <div v-if="aclRows.length === 0" class="list-empty">
            No access entries. Add a user or group, or enable inheritance above.
          </div>
          <button
            type="button"
            v-for="row in aclRows"
            :key="row.userId"
            class="entity-row"
            :class="{
              'entity-row--selected': row.userId === selectedUserId,
              'entity-row--inherited': row.inherited,
            }"
            @click="selectRow(row.userId)"
          >
            <span class="kind-badge" :class="`kind-badge--${row.kind}`">
              {{ row.kind === 'group' ? 'Group' : 'User' }}
            </span>
            <span class="entity-name" :title="row.name">{{ row.name }}</span>
            <span
              v-if="row.inherited"
              class="inherited-tag"
              :title="`Inherited from ${row.sourceObjectName ?? 'parent'}`"
            >
              inherited
            </span>
            <span class="summary-tag">{{ row.summary }}</span>
          </button>
        </div>
      </div>

      <div class="acl-col acl-col--rights">
        <template v-if="addMode">
          <div class="col-header">
            Add user or group
            <span class="col-header-actions">
              <Button
                icon="pi pi-arrow-left"
                label="Back"
                text
                size="small"
                severity="secondary"
                @click="cancelAdd"
              />
            </span>
          </div>
          <div class="col-filter">
            <InputText
              v-model="addFilter"
              data-filter-input
              placeholder="Filter users and groups..."
              class="filter-input"
              size="small"
            />
          </div>
          <div class="entity-list">
            <div v-if="availableEntries.length === 0" class="list-empty">
              {{
                addFilter
                  ? `No matches for "${addFilter}".`
                  : 'All users and groups are already in the list.'
              }}
            </div>
            <button
              type="button"
              v-for="entity in availableEntries"
              :key="entity.id"
              class="entity-row entity-row--clickable"
              @click="addEntry(entity)"
            >
              <span class="kind-badge" :class="`kind-badge--${entity.kind}`">
                {{ entity.kind === 'group' ? 'Group' : 'User' }}
              </span>
              <span class="entity-name" :title="entity.name">{{ entity.name }}</span>
              <i class="pi pi-angle-right row-btn" aria-hidden="true" />
            </button>
          </div>
        </template>

        <template v-else>
          <div class="col-header">
            Access Rights
            <span v-if="selectedRow" class="count">— {{ selectedRow.name }}</span>
          </div>
          <div class="rights-body">
            <div v-if="!selectedRow" class="list-empty">
              Select a user or group to view or edit its access rights.
            </div>
            <div v-else-if="selectedRow.inherited" class="rights-hint">
              These rights are inherited from
              <strong>{{ selectedRow.sourceObjectName ?? 'a parent object' }}</strong> and cannot be
              edited here.
            </div>
            <div v-if="selectedRow" class="rights-groups">
              <div v-for="group in rightsGroups" :key="group.name" class="rights-group">
                <div class="rights-group-title">{{ group.name }}</div>
                <div class="rights-group-items">
                  <div v-for="right in group.rights" :key="right.mask" class="right-item">
                    <Checkbox
                      :model-value="isChecked(right.mask)"
                      :binary="true"
                      :disabled="!rightsEditable"
                      :input-id="`right-${right.mask}`"
                      @update:model-value="(v) => toggleRight(right.mask, v)"
                    />
                    <label :for="`right-${right.mask}`" class="right-label">{{
                      right.label
                    }}</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.access-control-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
}

.inherit-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.inherit-label {
  cursor: pointer;
  font-size: 0.875rem;
}

.inherit-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.acl-picker {
  display: flex;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
  flex: 1;
  min-height: 22rem;
}

.acl-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.acl-col--entries {
  border-right: 1px solid var(--p-surface-border);
}

.col-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  min-height: 2.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.acl-col--rights .col-header {
  padding: 0.725rem 0.75rem;
}

.count {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}

.col-header-actions {
  margin-left: auto;
  display: flex;
  gap: 0.25rem;
}

.col-filter {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.filter-input {
  width: 100%;
}

.entity-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.entity-row {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem 0.4rem 0.625rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.875rem;
  cursor: pointer;
}

.entity-row:last-child {
  border-bottom: none;
}

.entity-row:hover {
  background: var(--p-surface-hover);
}

.entity-row--selected {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.entity-row--selected:hover {
  background: var(--p-highlight-background);
}

.entity-row--inherited .entity-name {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.entity-row--clickable:hover .row-btn {
  opacity: 1;
}

.entity-row--clickable .row-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.entity-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-btn {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
}

.kind-badge {
  font-size: 0.6875rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-weight: 600;
  flex-shrink: 0;
}

.kind-badge--user {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.kind-badge--group {
  background: var(--p-purple-100);
  color: var(--p-purple-700);
}

html.app-dark .kind-badge--user {
  background: var(--p-blue-900);
  color: var(--p-blue-200);
}

html.app-dark .kind-badge--group {
  background: var(--p-purple-900);
  color: var(--p-purple-200);
}

.summary-tag {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.entity-row--selected .summary-tag {
  color: inherit;
}

.inherited-tag {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-style: italic;
  color: var(--p-text-muted-color);
}

.rights-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0.75rem;
}

.rights-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.625rem;
  background: var(--p-surface-ground);
  border-radius: var(--p-border-radius-sm, 0.25rem);
}

.rights-groups {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.rights-group-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.4rem;
}

.rights-group-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.35rem 0.75rem;
}

.right-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.right-label {
  font-size: 0.8125rem;
  cursor: pointer;
}

.right-item :deep(.p-checkbox-disabled) + .right-label {
  cursor: default;
  color: var(--p-text-muted-color);
}

.list-empty {
  padding: 1.5rem 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}

@media (max-width: 720px) {
  .acl-picker {
    flex-direction: column;
  }

  .acl-col--entries {
    border-right: none;
    border-bottom: 1px solid var(--p-surface-border);
  }
}
</style>
