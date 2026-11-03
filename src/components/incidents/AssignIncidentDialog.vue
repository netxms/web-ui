<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Skeleton from 'primevue/skeleton'
import { useUsers } from '@/queries/useUserQueries'

// Users only: CMD_ASSIGN_INCIDENT takes a user id.
const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Highlighted in the list; 0 when unassigned. */
  currentUserId: { type: Number, default: 0 },
  isPending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'assign'])

const { data: usersData, isLoading } = useUsers()

const filter = ref('')
const selectedId = ref(null)

watch(
  () => props.visible,
  (isVisible) => {
    if (!isVisible) return
    filter.value = ''
    selectedId.value = props.currentUserId || null
  },
)

const users = computed(() => {
  const search = filter.value.trim().toLowerCase()
  const list = usersData.value ?? []
  if (!search) return list
  return list.filter(
    (u) => u.name?.toLowerCase().includes(search) || u.fullName?.toLowerCase().includes(search),
  )
})

const selectedUser = computed(
  () => (usersData.value ?? []).find((u) => u.id === selectedId.value) ?? null,
)

function close() {
  emit('update:visible', false)
}

function assign() {
  if (!selectedUser.value) return
  emit('assign', { userId: selectedUser.value.id })
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Assign Incident"
    modal
    :style="{ width: '28rem' }"
    :draggable="false"
    @update:visible="close"
  >
    <div class="assign-body">
      <InputText
        autofocus
        v-model="filter"
        data-filter-input
        placeholder="Filter users..."
        size="small"
        class="filter-input"
      />

      <div v-if="isLoading" class="user-loading">
        <Skeleton v-for="i in 5" :key="i" height="2rem" />
      </div>

      <div v-else class="user-list">
        <p v-if="users.length === 0" class="list-empty">
          {{ filter ? `No matches for "${filter}".` : 'No users available.' }}
        </p>
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          class="user-row"
          :class="{ selected: user.id === selectedId }"
          @click="selectedId = user.id"
        >
          <i class="pi pi-user user-icon" />
          <span class="user-name">{{ user.name }}</span>
          <span v-if="user.fullName" class="user-fullname">{{ user.fullName }}</span>
          <i v-if="user.id === currentUserId" class="pi pi-check current-icon" />
        </button>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="isPending" @click="close" />
      <Button
        label="Assign"
        icon="pi pi-user"
        :loading="isPending"
        :disabled="!selectedUser || selectedId === currentUserId"
        @click="assign"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.assign-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-input {
  width: 100%;
}

.user-loading {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-list {
  display: flex;
  flex-direction: column;
  max-height: 20rem;
  overflow-y: auto;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
}

.list-empty {
  margin: 0;
  padding: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.875rem;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.625rem;
  border: none;
  border-bottom: 1px solid var(--p-surface-border);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.user-row:last-child {
  border-bottom: none;
}

.user-row:hover {
  background: var(--p-content-hover-background);
}

.user-row.selected {
  background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}

.user-icon {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.user-fullname {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-icon {
  margin-left: auto;
  color: var(--p-primary-color);
  font-size: 0.75rem;
}
</style>
