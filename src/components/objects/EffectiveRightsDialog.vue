<script setup>
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import { useObject } from '@/queries/useObjectQueries'
import { groupObjectAccessRights } from '@/auth/objectAccessRights'
import { useAuthStore } from '@/stores/authStore'

/**
 * The logged-in account's rights on one object. Unlike the legacy dialog it cannot show another
 * user's: the WebAPI resolves `effectiveRights` for the calling session only. Tree nodes may
 * carry no rights, so the full object is fetched.
 */
const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const authStore = useAuthStore()

const objectId = computed(() => props.object?.id ?? null)
const { data: fullObject, isLoading } = useObject(objectId)

const rights = computed(() => fullObject.value?.effectiveRights ?? null)

// An older server sends no rights document, and `hasObjectRight` then allows everything.
const unreported = computed(() => !isLoading.value && rights.value == null)

const groups = computed(() =>
  groupObjectAccessRights().map((group) => ({
    name: group.name,
    rights: group.rights.map((right) => ({
      key: right.key,
      label: right.label,
      granted: rights.value?.[right.api] === true,
    })),
  })),
)

const grantedCount = computed(() =>
  groups.value.reduce((total, group) => total + group.rights.filter((r) => r.granted).length, 0),
)
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Effective Rights${object?.name ? ` - ${object.name}` : ''}`"
    modal
    :style="{ width: '560px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="rights-body">
      <p class="rights-subject">
        Rights held by
        <strong>{{ authStore.user?.username ?? 'the current account' }}</strong>
        on this object, including rights inherited from parent objects.
      </p>

      <div v-if="isLoading" class="rights-columns">
        <Skeleton v-for="i in 8" :key="i" height="1.5rem" />
      </div>

      <Message v-else-if="unreported" severity="secondary" :closable="false">
        This server does not report effective rights, so every action stays available and the server
        decides.
      </Message>

      <template v-else>
        <p v-if="grantedCount === 0" class="rights-none">
          No rights on this object beyond seeing it listed.
        </p>

        <div class="rights-columns">
          <div v-for="group in groups" :key="group.name" class="rights-group">
            <div class="rights-group-title">{{ group.name }}</div>
            <div
              v-for="right in group.rights"
              :key="right.key"
              class="rights-row"
              :class="{ 'rights-row--denied': !right.granted }"
            >
              <i :class="right.granted ? 'pi pi-check' : 'pi pi-minus'" class="rights-icon" />
              <span>{{ right.label }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <Button label="Close" text severity="secondary" @click="emit('update:visible', false)" />
    </template>
  </Dialog>
</template>

<style scoped>
.rights-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.rights-subject {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.rights-none {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.rights-columns {
  columns: 2;
  column-gap: 1.5rem;
}

.rights-group {
  break-inside: avoid;
  margin-bottom: 0.875rem;
}

.rights-group-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.25rem;
}

.rights-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  padding: 0.125rem 0;
}

.rights-row--denied {
  color: var(--p-text-muted-color);
}

.rights-icon {
  font-size: 0.75rem;
  color: var(--p-green-500);
}

.rights-row--denied .rights-icon {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}
</style>
