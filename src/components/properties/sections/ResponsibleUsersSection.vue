<script setup>
import { computed, ref } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useUsers, useUserGroups } from '@/queries/useUserQueries'

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

const filter = ref('')

const allEntities = computed(() => [
  ...(groupsData.value ?? []).map((g) => ({ id: g.id, name: g.name, kind: 'group' })),
  ...(usersData.value ?? []).map((u) => ({ id: u.id, name: u.fullName || u.name, kind: 'user' })),
])

const entityMap = computed(() => {
  const map = new Map()
  for (const e of allEntities.value) map.set(e.id, e)
  return map
})

const selectedIds = computed(
  () => new Set((props.draft.responsibleUsers ?? []).map((r) => r.userId)),
)

const availableEntries = computed(() => {
  const q = filter.value.toLowerCase()
  return allEntities.value
    .filter((e) => !selectedIds.value.has(e.id))
    .filter((e) => !q || e.name.toLowerCase().includes(q))
})

const selectedEntries = computed(() =>
  (props.draft.responsibleUsers ?? []).map((r) => ({
    ...r,
    ...(entityMap.value.get(r.userId) ?? { name: `ID ${r.userId}`, kind: 'unknown' }),
  })),
)

function add(entity) {
  props.draft.responsibleUsers = [
    ...(props.draft.responsibleUsers ?? []),
    { userId: entity.id, tag: '' },
  ]
}

function remove(userId) {
  props.draft.responsibleUsers = props.draft.responsibleUsers.filter((r) => r.userId !== userId)
}

function updateTag(userId, value) {
  const idx = props.draft.responsibleUsers.findIndex((r) => r.userId === userId)
  if (idx !== -1)
    props.draft.responsibleUsers[idx] = { ...props.draft.responsibleUsers[idx], tag: value }
}
</script>

<template>
  <div class="responsible-users-section">
    <div class="ru-picker">
      <div class="ru-col ru-col--available">
        <div class="col-header">Available</div>
        <div class="col-filter">
          <InputText
            v-model="filter"
            data-filter-input
            placeholder="Filter users and groups..."
            class="filter-input"
            size="small"
          />
        </div>
        <div class="entity-list">
          <button
            type="button"
            v-for="entity in availableEntries"
            :key="entity.id"
            class="entity-row"
            @click="add(entity)"
          >
            <span class="kind-badge" :class="`kind-badge--${entity.kind}`">
              {{ entity.kind === 'group' ? 'Group' : 'User' }}
            </span>
            <span class="entity-name">{{ entity.name }}</span>
            <i class="pi pi-angle-right row-btn" aria-hidden="true" />
          </button>
          <div v-if="availableEntries.length === 0 && !filter" class="list-empty">
            All users and groups are already assigned.
          </div>
          <div v-else-if="availableEntries.length === 0" class="list-empty">
            No matches for "{{ filter }}".
          </div>
        </div>
      </div>

      <div class="ru-col ru-col--selected">
        <div class="col-header">
          Responsible Users
          <span class="count">({{ selectedEntries.length }})</span>
        </div>
        <div class="entity-list">
          <div v-if="selectedEntries.length === 0" class="list-empty">
            No responsible users assigned.
          </div>
          <div
            v-for="ru in selectedEntries"
            :key="ru.userId"
            class="entity-row entity-row--selected"
          >
            <span class="kind-badge" :class="`kind-badge--${ru.kind}`">
              {{ ru.kind === 'group' ? 'Group' : ru.kind === 'user' ? 'User' : '?' }}
            </span>
            <span class="entity-name">{{ ru.name }}</span>
            <InputText
              :model-value="ru.tag"
              placeholder="tag"
              class="tag-input"
              size="small"
              maxlength="31"
              @update:model-value="(v) => updateTag(ru.userId, v)"
            />
            <Button
              aria-label="Remove responsible user"
              icon="pi pi-times"
              text
              rounded
              size="small"
              severity="danger"
              class="row-btn"
              @click="remove(ru.userId)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.responsible-users-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ru-picker {
  display: flex;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
  flex: 1;
  min-height: 20rem;
}

.ru-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.ru-col--available {
  border-right: 1px solid var(--p-surface-border);
}

.col-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.count {
  font-weight: 400;
  margin-left: 0.25rem;
}

.col-filter {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
  height: 45px;
}

.filter-input {
  width: 100%;
  padding-block: 0.3rem;
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
  padding: 0.35rem 0.75rem 0.35rem 0.625rem;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.875rem;
  height: 45px;
}

.entity-row:last-child {
  border-bottom: none;
}

.ru-col--available .entity-row {
  cursor: pointer;
}

.ru-col--available .entity-row:hover {
  background: var(--p-surface-hover);
}

.ru-col--available .entity-row:hover .row-btn {
  opacity: 1;
}

.ru-col--available .row-btn {
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

.tag-input {
  flex: 0 0 8rem;
}

.row-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-muted-color);
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

.kind-badge--unknown {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

html.app-dark .kind-badge--user {
  background: var(--p-blue-900);
  color: var(--p-blue-200);
}

html.app-dark .kind-badge--group {
  background: var(--p-purple-900);
  color: var(--p-purple-200);
}

.list-empty {
  padding: 1.5rem 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  line-height: 1.5;
}
</style>
