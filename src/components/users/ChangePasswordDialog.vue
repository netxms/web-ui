<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { useSetPassword } from '@/queries/useUserQueries'

const props = defineProps({
  userId: {
    type: [Number, String],
    required: true,
  },
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:visible'])

const newPassword = ref('')
const confirmPassword = ref('')

const passwordError = computed(() => {
  if (newPassword.value && confirmPassword.value && newPassword.value !== confirmPassword.value) {
    return 'Passwords do not match'
  }
  return null
})

const { mutate: setPassword, isPending: isSettingPassword } = useSetPassword()

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      newPassword.value = ''
      confirmPassword.value = ''
    }
  },
)

function close() {
  emit('update:visible', false)
}

function confirmChangePassword() {
  if (!newPassword.value || passwordError.value) return
  setPassword(
    { userId: props.userId, newPassword: newPassword.value },
    { onSuccess: () => close() },
  )
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Change Password"
    modal
    :style="{ width: '26rem' }"
    @update:visible="(val) => emit('update:visible', val)"
  >
    <div class="password-dialog-body">
      <div class="password-field">
        <label for="new-password">New Password</label>
        <InputText
          id="new-password"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          autofocus
          class="password-input"
        />
      </div>
      <div class="password-field">
        <label for="confirm-password">Confirm Password</label>
        <InputText
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          class="password-input"
          :class="{ 'p-invalid': passwordError }"
        />
      </div>
      <p v-if="passwordError" class="password-error">{{ passwordError }}</p>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button
        label="Change Password"
        severity="primary"
        :disabled="!newPassword || !!passwordError || isSettingPassword"
        :loading="isSettingPassword"
        @click="confirmChangePassword"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.password-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 0 0.5rem;
}

.password-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.password-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.password-input {
  width: 100%;
}

.password-error {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-red-500);
}
</style>
