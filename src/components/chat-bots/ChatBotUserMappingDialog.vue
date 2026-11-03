<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useUsers } from '@/queries/useUserQueries'
import { PEER_ID_MAX_LENGTH } from '@/utils/chatBotDisplay'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  /** `{ peerId, userId }`, or null to add a new one. */
  mapping: {
    type: Object,
    default: null,
  },
  /** Used to reject duplicates when adding. */
  usedPeerIds: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.mapping)

const { data: usersData } = useUsers()
const userOptions = computed(() =>
  (usersData.value ?? [])
    .map((u) => ({ label: u.fullName ? `${u.name} (${u.fullName})` : u.name, value: u.id }))
    .sort((a, b) => a.label.localeCompare(b.label)),
)

const form = ref({ peerId: '', userId: null })
const peerIdError = ref(null)
const userError = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = {
      peerId: props.mapping?.peerId ?? '',
      userId: props.mapping?.userId ?? null,
    }
    peerIdError.value = null
    userError.value = false
  },
  { immediate: true },
)

function validate() {
  const peerId = form.value.peerId.trim()
  if (!peerId) {
    peerIdError.value = 'Peer ID is required'
  } else if (!isEdit.value && props.usedPeerIds.includes(peerId)) {
    peerIdError.value = 'This peer ID is already mapped'
  } else {
    peerIdError.value = null
  }
  userError.value = form.value.userId === null || form.value.userId === undefined
  return !peerIdError.value && !userError.value
}

function onSave() {
  if (!validate()) return
  emit('save', { peerId: form.value.peerId.trim(), userId: form.value.userId })
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? 'Edit User Mapping' : 'Add User Mapping'"
    modal
    :style="{ width: '32rem' }"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <div class="form-field" :class="{ 'field-error': peerIdError }">
        <label for="mapping-peer-id">Platform peer ID <span class="required">*</span></label>
        <InputText
          autofocus
          id="mapping-peer-id"
          v-model="form.peerId"
          :maxlength="PEER_ID_MAX_LENGTH"
          :disabled="isEdit"
          placeholder="Chat ID, JID, etc."
          class="w-full"
          @input="peerIdError = null"
        />
        <small v-if="peerIdError" class="error-text">{{ peerIdError }}</small>
        <small v-else class="hint-text">
          Platform-specific identifier of the sender. Cannot be changed once mapped.
        </small>
      </div>

      <div class="form-field" :class="{ 'field-error': userError }">
        <label for="mapping-user">NetXMS user <span class="required">*</span></label>
        <Select
          id="mapping-user"
          v-model="form.userId"
          :options="userOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="Select user"
          class="w-full"
          @change="userError = false"
        />
        <small v-if="userError" class="error-text">User is required</small>
        <small v-else class="hint-text">
          Messages from this peer act with the selected user's access rights.
        </small>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onHide" />
      <Button :label="isEdit ? 'Save' : 'Add'" icon="pi pi-check" @click="onSave" />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.required {
  color: var(--p-red-500);
}

.field-error :deep(.p-inputtext),
.field-error :deep(.p-select) {
  border-color: var(--p-red-500);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
