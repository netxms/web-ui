<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import AppLink from '@/components/common/AppLink.vue'
import FormField from '@/components/common/FormField.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useSshKeys } from '@/queries/useSshKeyQueries'
import { objectTarget } from '@/utils/routeTargets'
import { storedCredentialsState } from '@/utils/sshTerminalProtocol'

const MODE_OPTIONS = [
  { label: 'Stored credentials', value: 'stored' },
  { label: 'Enter credentials', value: 'custom' },
]

const props = defineProps({
  /** Adapted node document. */
  object: { type: Object, required: true },
  /** @type {import('vue').PropType<{ severity: string, title: string, detail?: string }|null>} */
  message: { type: Object, default: null },
  /** The per-node memory from user preferences; never holds a password. */
  remembered: { type: Object, default: null },
  /** The form is on screen. It stays mounted while connecting, so a failure finds it filled in. */
  active: { type: Boolean, default: true },
  /** A login is being tried. */
  connecting: { type: Boolean, default: false },
})

const emit = defineEmits(['connect', 'cancel'])

const storedState = computed(() => storedCredentialsState(props.object))
const hasStored = computed(() => storedState.value !== 'none')

const mode = ref(props.remembered?.mode ?? 'stored')
const login = ref(props.remembered?.login || props.object.ssh?.login || '')
const password = ref('')
const keyId = ref(props.remembered?.keyId ?? 0)
const loginError = ref('')

const usesForm = computed(() => !hasStored.value || mode.value === 'custom')

const canEditSettings = computed(() => hasObjectRight(props.object, 'MODIFY'))
const settingsTarget = computed(() =>
  objectTarget(props.object, 'properties', { query: { section: 'communication' } }),
)

const { data: sshKeys } = useSshKeys()
const keyOptions = computed(() => [{ id: 0, name: 'None' }, ...(sshKeys.value ?? [])])

const formRef = ref(null)

function focusFirstField() {
  const form = formRef.value
  if (!form) return
  const empty = [...form.querySelectorAll('input:not([type="hidden"])')].find(
    (input) => !input.value && input.closest('.ssh-connect-field'),
  )
  ;(empty ?? form.querySelector('button[type="submit"]'))?.focus()
}

watch(
  () => props.active,
  (active) => {
    if (active) nextTick(focusFirstField)
  },
  { immediate: true },
)

function submit() {
  if (props.connecting) return
  if (!usesForm.value) {
    emit('connect', { mode: 'stored' })
    return
  }
  const trimmed = login.value.trim()
  if (!trimmed) {
    loginError.value = 'Enter a login.'
    return
  }
  loginError.value = ''
  emit('connect', {
    mode: 'custom',
    login: trimmed,
    password: password.value,
    keyId: keyId.value,
  })
}

defineExpose({
  forgetPassword() {
    password.value = ''
  },
})
</script>

<template>
  <form ref="formRef" class="ssh-connect" @submit.prevent="submit">
    <h2 class="ssh-connect-title">Connect to {{ object.name }}</h2>
    <p class="ssh-connect-route">
      Through the NetXMS SSH proxy, port {{ object.ssh?.port || 22 }}.
      <AppLink v-if="canEditSettings" :to="settingsTarget">Change in Properties</AppLink>
    </p>

    <SelectButton
      v-if="hasStored"
      v-model="mode"
      :options="MODE_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :disabled="connecting"
      size="small"
      aria-label="Credentials"
    />

    <template v-if="usesForm">
      <FormField
        v-slot="{ id, describedBy }"
        class="ssh-connect-field"
        label="Login"
        required
        :empty="!login.trim()"
        :error="loginError"
      >
        <InputText
          :id="id"
          v-model="login"
          data-testid="ssh-login"
          autocomplete="off"
          :disabled="connecting"
          fluid
          size="small"
          :aria-describedby="describedBy"
        />
      </FormField>
      <FormField v-slot="{ id }" class="ssh-connect-field" label="Password">
        <Password
          v-model="password"
          :input-id="id"
          :input-props="{ autocomplete: 'new-password' }"
          :disabled="connecting"
          :feedback="false"
          toggle-mask
          fluid
          size="small"
        />
      </FormField>
      <FormField
        v-if="sshKeys?.length"
        v-slot="{ id }"
        label="SSH key"
        hint="Tried first; the password is the fallback."
      >
        <Select
          v-model="keyId"
          :input-id="id"
          :options="keyOptions"
          option-label="name"
          option-value="id"
          :disabled="connecting"
          fluid
          size="small"
        />
      </FormField>
    </template>
    <p v-else class="ssh-connect-stored">
      <template v-if="storedState === 'known'">
        Logs in as <strong>{{ object.ssh.login }}</strong> with the credentials stored on the node.
      </template>
      <template v-else>Logs in with the credentials stored on the node.</template>
    </p>

    <Message v-if="message" severity="error" :closable="false" size="small">
      <div class="ssh-connect-error">
        <strong>{{ message.title }}</strong>
        <span v-if="message.detail">{{ message.detail }}</span>
      </div>
    </Message>

    <div class="ssh-connect-actions">
      <Button
        type="submit"
        class="ssh-connect-submit"
        :label="connecting ? 'Connecting...' : 'Connect'"
        icon="pi pi-sign-in"
        :loading="connecting"
        size="small"
      />
      <Button
        v-if="connecting"
        label="Cancel"
        severity="secondary"
        text
        size="small"
        @click="emit('cancel')"
      />
    </div>
  </form>
</template>

<style scoped>
.ssh-connect {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 26rem;
  max-width: 100%;
  margin: auto;
  padding: 1.25rem;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.5rem);
}

.ssh-connect-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ssh-connect-route,
.ssh-connect-stored {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  overflow-wrap: anywhere;
}

.ssh-connect-stored strong {
  color: var(--p-text-color);
}

.ssh-connect-actions {
  display: flex;
  gap: 0.5rem;
}

.ssh-connect-submit {
  flex: 1;
}

.ssh-connect-error {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow-wrap: anywhere;
}
</style>
