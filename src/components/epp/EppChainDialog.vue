<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import EppChainAccessList from '@/components/epp/EppChainAccessList.vue'

// Mirrors AlarmCategoryDialog, the other name/description/ACL entity in Configuration.
defineOptions({ name: 'EppChainDialog' })

// Column widths on the server side (`event_policy_chain`).
const NAME_MAX = 63
const DESCRIPTION_MAX = 255

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** null to create a new one. */
  chain: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: [String, Object, Error], default: null },
})

const emit = defineEmits(['update:visible', 'save'])

const isEdit = computed(() => !!props.chain)
const dialogTitle = computed(() => (isEdit.value ? 'Chain Properties' : 'New Rule Chain'))

const form = ref({ name: '', description: '', accessList: [] })
const nameError = ref(false)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    nameError.value = false
    form.value = {
      name: props.chain?.name ?? '',
      description: props.chain?.description ?? '',
      accessList: (props.chain?.accessList ?? []).map((entry) => ({ ...entry })),
    }
  },
  { immediate: true },
)

function onSave() {
  nameError.value = !form.value.name.trim()
  if (nameError.value) return
  emit('save', {
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    // Always sent: the server replaces the list only when one is present, so an emptied list must
    // travel as `[]`.
    accessList: form.value.accessList,
  })
}

function onHide() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogTitle"
    modal
    :style="{ width: '38rem' }"
    :closable="!saving"
    @update:visible="onHide"
  >
    <div class="dialog-form">
      <MutationErrorState :error="error" class="form-error" />

      <div class="form-field" :class="{ 'field-error': nameError }">
        <label for="chain-name">Name <span class="required">*</span></label>
        <InputText
          id="chain-name"
          v-model="form.name"
          autofocus
          :disabled="saving"
          :maxlength="NAME_MAX"
          placeholder="e.g. Network devices"
          class="w-full"
          @input="nameError = false"
        />
        <small v-if="nameError" class="error-text">Name is required</small>
      </div>

      <div class="form-field">
        <label for="chain-description">Description</label>
        <Textarea
          id="chain-description"
          v-model="form.description"
          :disabled="saving"
          :rows="3"
          :maxlength="DESCRIPTION_MAX"
          placeholder="What this chain handles"
          class="w-full"
          auto-resize
        />
        <small
          class="char-count"
          :class="{ 'char-count--limit': form.description.length >= DESCRIPTION_MAX }"
        >
          {{ form.description.length }} / {{ DESCRIPTION_MAX }}
        </small>
      </div>

      <div class="form-field">
        <!-- Not a <label>: the access list is a group of controls, not one form field. -->
        <div id="chain-access-label" class="field-label">Access</div>
        <div role="group" aria-labelledby="chain-access-label">
          <EppChainAccessList v-model="form.accessList" :disabled="saving" />
        </div>
        <small class="field-hint">
          These rights apply to the desktop and legacy web console. This console requires the global
          event processing right, which grants access to every chain.
        </small>
      </div>

      <p v-if="!isEdit" class="dialog-hint">
        The chain starts empty. Events reach it once a rule in another chain calls it.
      </p>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="saving" @click="onHide" />
      <Button
        :label="isEdit ? 'Save' : 'Create'"
        icon="pi pi-check"
        :loading="saving"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-top: 0.25rem;
}

.form-error {
  margin-bottom: 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label,
.form-field .field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--p-text-color);
}

.required {
  color: var(--p-red-500);
}

.field-error :deep(.p-inputtext) {
  border-color: var(--p-red-500);
}

.error-text {
  font-size: 0.75rem;
  color: var(--p-red-500);
}

.char-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-align: right;
}

.char-count--limit {
  color: var(--p-red-500);
}

.field-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.dialog-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
