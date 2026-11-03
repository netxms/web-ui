<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useUsers, useUserGroups } from '@/queries/useUserQueries'

const props = defineProps({
  modelValue: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const { data: usersData } = useUsers()
const { data: groupsData } = useUserGroups()

const filter = ref('')

const currentSet = computed(() => new Set(props.modelValue))

const allEntities = computed(() => {
  const groups = (groupsData.value ?? []).map((g) => ({ ...g, kind: 'group' }))
  const users = (usersData.value ?? []).map((u) => ({ ...u, kind: 'user' }))
  return [...groups, ...users]
})

const entityMap = computed(() => {
  const map = new Map()
  for (const e of allEntities.value) map.set(e.id, e)
  return map
})

const currentEntries = computed(() =>
  props.modelValue.map((id) => entityMap.value.get(id) ?? { id, name: `#${id}`, kind: 'unknown' }),
)

const availableEntries = computed(() => {
  const search = filter.value.toLowerCase()
  const available = allEntities.value.filter((e) => !currentSet.value.has(e.id))
  if (!search) return available
  return available.filter((e) => e.name.toLowerCase().includes(search))
})

function add(entity) {
  emit('update:modelValue', [...props.modelValue, entity.id])
}

function remove(id) {
  emit(
    'update:modelValue',
    props.modelValue.filter((i) => i !== id),
  )
}
</script>

<template>
  <div class="acl-picker">
    <div class="acl-col acl-col--available">
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
        <!-- The whole row is the add control; right-hand rows stay <div>s because they contain
             the remove button. -->
        <button
          v-for="entity in availableEntries"
          :key="entity.id"
          type="button"
          class="entity-row"
          :aria-label="`Add ${entity.name}`"
          @click="add(entity)"
        >
          <span class="kind-badge" :class="`kind-badge--${entity.kind}`">
            {{ entity.kind === 'group' ? 'Group' : 'User' }}
          </span>
          <span class="entity-name">{{ entity.name }}</span>
          <i class="pi pi-angle-right row-btn" aria-hidden="true" />
        </button>
        <div v-if="availableEntries.length === 0 && !filter" class="list-empty">
          All users and groups are already in the access control list.
        </div>
        <div v-else-if="availableEntries.length === 0" class="list-empty">
          No matches for "{{ filter }}".
        </div>
      </div>
    </div>

    <div class="acl-col acl-col--current">
      <div class="col-header">
        Access Control
        <span class="count">({{ modelValue.length }})</span>
      </div>
      <div class="entity-list">
        <div v-if="currentEntries.length === 0" class="list-empty">
          No entries &mdash; all users have access.
        </div>
        <div
          v-for="entity in currentEntries"
          :key="entity.id"
          class="entity-row entity-row--current"
        >
          <span class="kind-badge" :class="`kind-badge--${entity.kind}`">
            {{ entity.kind === 'group' ? 'Group' : entity.kind === 'user' ? 'User' : '?' }}
          </span>
          <span class="entity-name">{{ entity.name }}</span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="danger"
            class="row-btn"
            :aria-label="`Remove ${entity.name}`"
            @click="remove(entity.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acl-picker {
  display: flex;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

.acl-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.acl-col--available {
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
  /* Undo the button chrome. */
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
}

.entity-row:last-child {
  border-bottom: none;
}

.acl-col--available .entity-row {
  cursor: pointer;
}

.acl-col--available .entity-row:hover {
  background: var(--p-surface-hover);
}

.acl-col--available .entity-row:hover .row-btn {
  opacity: 1;
}

.acl-col--available .row-btn {
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
