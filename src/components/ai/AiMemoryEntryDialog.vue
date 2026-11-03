<script setup>
/**
 * Create or edit one AI memory entry (legacy `AiMemoryEntryEditDialog`). Scope and owner are
 * set at creation and cannot change afterwards; the server takes only title, content and the
 * locked flag on an update.
 */
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import FormField from '@/components/common/FormField.vue'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import { useSaveAiMemoryEntry } from '@/queries/useAiQueries'
import {
  MEMORY_SCOPES,
  MEMORY_TITLE_MAX_BYTES,
  buildMemoryPayload,
  creatableMemoryScopes,
  emptyMemoryForm,
  validateMemoryForm,
} from '@/utils/aiMemoryDisplay'

const props = defineProps({
  /** The entry to edit, or null for a new one. */
  entry: { type: Object, default: null },
  canManageMemory: { type: Boolean, default: false },
  currentUserId: { type: Number, default: null },
  /** `{ value, label }` for each user that can own a user entry. */
  userOptions: { type: Array, default: () => [] },
  /** The edited entry's user or object, already resolved to a name. */
  targetLabel: { type: String, default: '' },
})

const visible = defineModel('visible', { type: Boolean, default: false })

const isNew = computed(() => props.entry == null)
const scopeOptions = computed(() =>
  isNew.value ? creatableMemoryScopes(props.canManageMemory) : MEMORY_SCOPES,
)

const form = ref(emptyMemoryForm('user', null))
const errors = ref({})
const saveError = ref(null)

watch(visible, (open) => {
  if (!open) return
  form.value = props.entry
    ? {
        scope: props.entry.scope,
        scopeId: props.entry.scopeId,
        title: props.entry.title,
        content: props.entry.content,
        locked: props.entry.locked,
      }
    : emptyMemoryForm(scopeOptions.value[0].value, props.currentUserId)
  errors.value = {}
  saveError.value = null
})

function onScopeChange(scope) {
  form.value.scopeId = scope === 'user' ? (props.currentUserId ?? 0) : 0
}

const { mutate: saveEntry, isPending: isSaving } = useSaveAiMemoryEntry()

function save() {
  errors.value = validateMemoryForm(form.value, isNew.value)
  if (Object.keys(errors.value).length) return
  saveError.value = null
  saveEntry(
    { memoryId: props.entry?.id ?? null, data: buildMemoryPayload(form.value, isNew.value) },
    {
      onSuccess: () => (visible.value = false),
      onError: (err) => (saveError.value = err.message ?? 'Failed to save memory entry.'),
    },
  )
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="isNew ? 'New Memory Entry' : 'Edit Memory Entry'"
    modal
    :style="{ width: '38rem' }"
    :draggable="false"
  >
    <div class="memory-dialog-body">
      <FormField label="Scope" v-slot="{ id }">
        <Select
          v-model="form.scope"
          :input-id="id"
          :options="scopeOptions"
          option-label="label"
          option-value="value"
          :disabled="!isNew"
          fluid
          @update:model-value="onScopeChange"
        />
      </FormField>

      <template v-if="isNew">
        <FormField
          v-if="form.scope === 'user'"
          label="User"
          required
          :error="errors.scopeId"
          v-slot="{ id }"
        >
          <Select
            v-model="form.scopeId"
            :input-id="id"
            :options="userOptions"
            option-label="label"
            option-value="value"
            :invalid="!!errors.scopeId"
            filter
            fluid
          />
        </FormField>
        <FormField
          v-else-if="form.scope === 'object'"
          label="Object"
          required
          :error="errors.scopeId"
          group
        >
          <ObjectPickerField v-model="form.scopeId" empty-label="(none)" />
        </FormField>
      </template>
      <FormField
        v-else-if="form.scope !== 'environment'"
        :label="form.scope === 'user' ? 'User' : 'Object'"
        v-slot="{ id }"
      >
        <InputText :id="id" :model-value="targetLabel" disabled fluid />
      </FormField>

      <FormField label="Title (unique within scope)" required :error="errors.title" v-slot="{ id }">
        <InputText
          :id="id"
          v-model="form.title"
          :maxlength="MEMORY_TITLE_MAX_BYTES"
          :invalid="!!errors.title"
          fluid
        />
      </FormField>

      <FormField label="Content" required :error="errors.content" v-slot="{ id }">
        <Textarea
          :id="id"
          v-model="form.content"
          :rows="8"
          :invalid="!!errors.content"
          class="memory-content"
          fluid
        />
      </FormField>

      <div class="memory-locked">
        <Checkbox v-model="form.locked" input-id="memory-locked" binary />
        <label for="memory-locked">Locked (the model cannot change or delete it)</label>
      </div>

      <MutationErrorState :error="saveError" />
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="visible = false" />
      <Button
        label="Save"
        severity="primary"
        :loading="isSaving"
        :disabled="isSaving"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.memory-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.memory-content {
  max-height: 20rem;
  overflow-y: auto !important;
}

.memory-locked {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
</style>
