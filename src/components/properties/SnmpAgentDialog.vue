<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import {
  SNMP_AUTH_METHOD_OPTIONS,
  SNMP_PRIV_METHOD_OPTIONS,
  SNMP_VERSION_OPTIONS,
} from '@/utils/snmpOptions'

const props = defineProps({
  visible: { type: Boolean, required: true },
  agent: { type: Object, default: null },
  /** Names used by the other agents on the node — compared case-insensitively. */
  existingNames: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'confirm'])

function buildForm(a) {
  return {
    name: a?.name ?? '',
    address: a?.address ?? '',
    port: a?.port ?? 161,
    version: a?.version ?? '2c',
    authName: a?.authName ?? '',
    authMethod: a?.authMethod ?? 'NONE',
    authPassword: a?.authPassword ?? '',
    privMethod: a?.privMethod ?? 'NONE',
    privPassword: a?.privPassword ?? '',
    contextName: a?.contextName ?? '',
  }
}

const form = ref(buildForm(props.agent))
const nameError = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.value = buildForm(props.agent)
      nameError.value = ''
    }
  },
)

const isV3 = computed(() => form.value.version === '3')

function confirm() {
  const name = form.value.name.trim()
  if (!name) {
    nameError.value = 'Agent name is required'
    return
  }
  if (props.existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    nameError.value = `Agent with name "${name}" already exists`
    return
  }
  nameError.value = ''
  emit('confirm', {
    ...form.value,
    name,
    address: (form.value.address ?? '').trim(),
    port: Number(form.value.port) || 161,
    contextName: (form.value.contextName ?? '').trim(),
  })
  emit('update:visible', false)
}

function cancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="agent ? 'Edit SNMP Agent' : 'Add SNMP Agent'"
    modal
    :breakpoints="{ '640px': '95vw' }"
    :style="{ width: '32rem' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="agent-form">
      <div class="form-field">
        <label for="snmp-agent-name">Name <span class="required">*</span></label>
        <InputText
          autofocus
          id="snmp-agent-name"
          v-model="form.name"
          class="form-input"
          :class="{ 'p-invalid': nameError }"
          :maxlength="63"
          @keyup.enter="confirm"
        />
        <small v-if="nameError" class="p-error">{{ nameError }}</small>
      </div>

      <div class="form-field">
        <label for="snmp-agent-address">IP address</label>
        <InputText
          id="snmp-agent-address"
          v-model="form.address"
          class="form-input"
          placeholder="(node's primary IP address)"
        />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="snmp-agent-port">UDP port</label>
          <InputNumber
            id="snmp-agent-port"
            v-model="form.port"
            :min="1"
            :max="65535"
            :use-grouping="false"
            class="form-input"
          />
        </div>
        <div class="form-field">
          <label for="snmp-agent-version">Version</label>
          <Select
            id="snmp-agent-version"
            v-model="form.version"
            :options="SNMP_VERSION_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </div>
      </div>

      <div class="form-field">
        <label for="snmp-agent-auth-name">{{ isV3 ? 'User name' : 'Community string' }}</label>
        <InputText
          v-if="!isV3"
          id="snmp-agent-auth-name"
          v-model="form.authName"
          class="form-input"
        />
        <Password
          v-else
          id="snmp-agent-auth-name"
          v-model="form.authName"
          class="form-input secret-input"
          input-class="form-input"
          :input-props="{ autocomplete: 'new-password' }"
          :feedback="false"
          toggle-mask
        />
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="snmp-agent-auth-method">Authentication</label>
          <Select
            id="snmp-agent-auth-method"
            v-model="form.authMethod"
            :options="SNMP_AUTH_METHOD_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
            :disabled="!isV3"
          />
        </div>
        <div class="form-field">
          <label for="snmp-agent-auth-password">Authentication password</label>
          <Password
            id="snmp-agent-auth-password"
            v-model="form.authPassword"
            class="form-input secret-input"
            input-class="form-input"
            :input-props="{ autocomplete: 'new-password' }"
            :feedback="false"
            toggle-mask
            :disabled="!isV3"
          />
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label for="snmp-agent-priv-method">Encryption</label>
          <Select
            id="snmp-agent-priv-method"
            v-model="form.privMethod"
            :options="SNMP_PRIV_METHOD_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
            :disabled="!isV3"
          />
        </div>
        <div class="form-field">
          <label for="snmp-agent-priv-password">Encryption password</label>
          <Password
            id="snmp-agent-priv-password"
            v-model="form.privPassword"
            class="form-input secret-input"
            input-class="form-input"
            :input-props="{ autocomplete: 'new-password' }"
            :feedback="false"
            toggle-mask
            :disabled="!isV3"
          />
        </div>
      </div>

      <div class="form-field">
        <label for="snmp-agent-context">Context</label>
        <InputText id="snmp-agent-context" v-model="form.contextName" class="form-input" />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="cancel" />
      <Button label="OK" severity="primary" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.agent-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.form-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.form-input {
  width: 100%;
}

:deep(.form-input input) {
  width: 100%;
}

:deep(.secret-input),
:deep(.secret-input .p-password-input) {
  width: 100%;
}

.required {
  color: var(--p-red-400);
}
</style>
