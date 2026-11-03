<script setup>
import { computed, ref } from 'vue'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useUsers, useUserGroups } from '@/queries/useUserQueries'
import { EPP_CHAIN_ACCESS_EDIT, EPP_CHAIN_ACCESS_READ } from '@/utils/eppChains'

/**
 * Who may read a chain and who may edit its rules. Flatter than the object ACL editor: a chain
 * has few rights, so they fit inline. Enforced only over NXCP; the WebAPI gates chain endpoints
 * on the global EPP right alone, which the dialog says.
 */
defineOptions({ name: 'EppChainAccessList' })

const props = defineProps({
  /** `[{ userId, accessRights }]`; the whole list is replaced on save. */
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { data: usersData } = useUsers()
const { data: groupsData } = useUserGroups()

const addMode = ref(false)
const filter = ref('')

const allEntities = computed(() => [
  ...(groupsData.value ?? []).map((g) => ({ ...g, kind: 'group' })),
  ...(usersData.value ?? []).map((u) => ({ ...u, kind: 'user' })),
])

const entityMap = computed(() => new Map(allEntities.value.map((e) => [e.id, e])))

const rows = computed(() =>
  props.modelValue.map((entry) => {
    const entity = entityMap.value.get(entry.userId)
    return {
      ...entry,
      // A user deleted after the ACL was written still has to be removable.
      name: entity?.name ?? `#${entry.userId}`,
      kind: entity?.kind ?? 'unknown',
      canRead: !!(entry.accessRights & EPP_CHAIN_ACCESS_READ),
      canEdit: !!(entry.accessRights & EPP_CHAIN_ACCESS_EDIT),
    }
  }),
)

/** Edit without Read hides the chain from the very user meant to work on it. */
const editWithoutRead = computed(() => rows.value.filter((row) => row.canEdit && !row.canRead))

const availableEntities = computed(() => {
  const taken = new Set(props.modelValue.map((entry) => entry.userId))
  const search = filter.value.toLowerCase()
  return allEntities.value.filter(
    (entity) => !taken.has(entity.id) && (!search || entity.name.toLowerCase().includes(search)),
  )
})

function setRight(userId, mask, on) {
  emit(
    'update:modelValue',
    props.modelValue.map((entry) =>
      entry.userId === userId
        ? {
            ...entry,
            accessRights: on ? entry.accessRights | mask : entry.accessRights & ~mask,
          }
        : entry,
    ),
  )
}

function addEntity(entity) {
  // Read makes the chain visible, so it is the default, as in the legacy client.
  emit('update:modelValue', [
    ...props.modelValue,
    { userId: entity.id, accessRights: EPP_CHAIN_ACCESS_READ },
  ])
  filter.value = ''
  addMode.value = false
}

function removeEntry(userId) {
  emit(
    'update:modelValue',
    props.modelValue.filter((entry) => entry.userId !== userId),
  )
}
</script>

<template>
  <div class="chain-acl">
    <template v-if="addMode">
      <div class="acl-header">
        <span>Add user or group</span>
        <Button
          icon="pi pi-arrow-left"
          label="Back"
          text
          size="small"
          severity="secondary"
          @click="addMode = false"
        />
      </div>
      <InputText
        v-model="filter"
        data-filter-input
        placeholder="Filter users and groups…"
        size="small"
        class="acl-filter"
      />
      <div class="entity-list">
        <div v-if="!availableEntities.length" class="list-empty">
          {{
            filter ? `No matches for "${filter}".` : 'Every user and group is already in the list.'
          }}
        </div>
        <button
          v-for="entity in availableEntities"
          :key="entity.id"
          type="button"
          class="entity-row entity-row--clickable"
          :aria-label="`Grant ${entity.name} access`"
          @click="addEntity(entity)"
        >
          <span class="kind-badge" :class="`kind-badge--${entity.kind}`">
            {{ entity.kind === 'group' ? 'Group' : 'User' }}
          </span>
          <span class="entity-name">{{ entity.name }}</span>
          <i class="pi pi-angle-right" aria-hidden="true" />
        </button>
      </div>
    </template>

    <template v-else>
      <div class="acl-header">
        <span
          >Users and Groups <span class="count">({{ rows.length }})</span></span
        >
        <Button
          icon="pi pi-plus"
          label="Add"
          text
          size="small"
          severity="secondary"
          :disabled="disabled"
          @click="addMode = true"
        />
      </div>

      <div class="entity-list">
        <div v-if="!rows.length" class="list-empty">
          No chain-level access. Only users with the global event processing right can open this
          chain.
        </div>
        <div v-else class="rights-legend">
          <span class="rights-legend__spacer" />
          <span>Read</span>
          <span>Edit</span>
          <span class="rights-legend__spacer-narrow" />
        </div>
        <div v-for="row in rows" :key="row.userId" class="entity-row">
          <span class="kind-badge" :class="`kind-badge--${row.kind}`">
            {{ row.kind === 'group' ? 'Group' : 'User' }}
          </span>
          <span class="entity-name" :title="row.name">{{ row.name }}</span>
          <Checkbox
            :model-value="row.canRead"
            :binary="true"
            :disabled="disabled"
            :aria-label="`${row.name} may read this chain`"
            class="right-box"
            @update:model-value="setRight(row.userId, EPP_CHAIN_ACCESS_READ, $event)"
          />
          <Checkbox
            :model-value="row.canEdit"
            :binary="true"
            :disabled="disabled"
            :aria-label="`${row.name} may edit this chain's rules`"
            class="right-box"
            @update:model-value="setRight(row.userId, EPP_CHAIN_ACCESS_EDIT, $event)"
          />
          <Button
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            :disabled="disabled"
            :aria-label="`Remove ${row.name}`"
            @click="removeEntry(row.userId)"
          />
        </div>
      </div>

      <Message v-if="editWithoutRead.length" severity="warn" :closable="false" class="acl-message">
        {{ editWithoutRead.map((r) => r.name).join(', ') }}
        {{ editWithoutRead.length === 1 ? 'has' : 'have' }} Edit without Read, so the chain stays
        hidden from {{ editWithoutRead.length === 1 ? 'them' : 'them' }}. Grant Read as well.
      </Message>
    </template>
  </div>
</template>

<style scoped>
.chain-acl {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.acl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.count {
  color: var(--p-text-muted-color);
  font-weight: 400;
}

.acl-filter {
  width: 100%;
}

.entity-list {
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
  max-height: 13rem;
  overflow-y: auto;
}

.list-empty {
  padding: 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.rights-legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
  border-bottom: 1px solid var(--p-surface-border);
}

.rights-legend__spacer {
  flex: 1;
}

/* Lines the labels up over the checkbox columns and the remove button's slot. */
.rights-legend span:not(.rights-legend__spacer):not(.rights-legend__spacer-narrow) {
  width: 1.5rem;
  text-align: center;
}

.rights-legend__spacer-narrow {
  width: 2rem;
}

.entity-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.25rem 0.5rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--p-surface-border);
  color: inherit;
  font: inherit;
  text-align: left;
}

.entity-row:last-child {
  border-bottom: none;
}

.entity-row--clickable {
  cursor: pointer;
}

.entity-row--clickable:hover {
  background: var(--p-surface-hover);
}

.kind-badge {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 0.75rem;
  border: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.kind-badge--group {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.entity-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
}

.right-box {
  width: 1.5rem;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.acl-message {
  margin: 0;
}
</style>
