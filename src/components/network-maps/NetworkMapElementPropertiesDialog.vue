<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import ObjectPickerInput from '@/components/objects/ObjectPickerInput.vue'
import { useImageLibrary } from '@/queries/useImageLibraryQueries'
import FormField from '@/components/common/FormField.vue'

/** Property editor for text box, group box and image decoration map elements. */
const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Null when the dialog is closed. */
  element: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'apply'])

const isTextBox = computed(() => props.element?.type === 'text-box')
const isGroupBox = computed(
  () => props.element?.type === 'decoration' && props.element?.decorationType === 'group-box',
)
const isImage = computed(
  () => props.element?.type === 'decoration' && props.element?.decorationType === 'image',
)

const header = computed(() => {
  if (isTextBox.value) return 'Text Box Properties'
  if (isImage.value) return 'Image Properties'
  return 'Group Box Properties'
})

const { data: imageList } = useImageLibrary()
const imageOptions = computed(() =>
  (imageList.value ?? []).map((img) => ({ label: img.name, value: img.id })),
)

const form = ref({})
const drillDownObject = ref(null)

watch(
  () => [props.visible, props.element],
  () => {
    const el = props.element
    if (!props.visible || !el) return
    if (el.type === 'text-box') {
      form.value = {
        text: el.text ?? '',
        fontSize: el.fontSize ?? 10,
        borderRequired: el.borderRequired ?? true,
        backgroundColor: el.backgroundColor ?? '#ffffff',
        textColor: el.textColor ?? '#000000',
        borderColor: el.borderColor ?? '#000000',
        drillDownObjectId: el.drillDownObjectId ?? 0,
      }
      drillDownObject.value = el.drillDownObjectId
        ? { id: el.drillDownObjectId, name: `#${el.drillDownObjectId}` }
        : null
    } else if (el.decorationType === 'image') {
      form.value = {
        width: el.width ?? 128,
        height: el.height ?? 128,
        imageGuid: el.imageGuid ?? '',
      }
    } else {
      form.value = {
        label: el.label ?? '',
        width: el.width ?? 250,
        height: el.height ?? 100,
        color: el.style?.color ?? '#40699c',
      }
    }
  },
  { immediate: true },
)

function apply() {
  const el = props.element
  if (!el) return
  let patch
  if (el.type === 'text-box') {
    patch = {
      text: form.value.text,
      fontSize: form.value.fontSize,
      borderRequired: form.value.borderRequired,
      backgroundColor: form.value.backgroundColor,
      textColor: form.value.textColor,
      borderColor: form.value.borderColor,
      drillDownObjectId: drillDownObject.value?.id ?? 0,
    }
  } else if (el.decorationType === 'image') {
    patch = { width: form.value.width, height: form.value.height, imageGuid: form.value.imageGuid }
  } else {
    patch = {
      label: form.value.label,
      width: form.value.width,
      height: form.value.height,
      color: form.value.color,
    }
  }
  emit('apply', patch)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    :modal="true"
    :closable="true"
    :style="{ width: '520px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="element-props-form">
      <template v-if="isTextBox">
        <FormField label="Text" v-slot="{ id }">
          <Textarea
            autofocus
            :id="id"
            v-model="form.text"
            rows="4"
            auto-resize
            class="full-width"
          />
        </FormField>
        <div class="props-row">
          <FormField label="Text size" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="form.fontSize"
              :min="1"
              :max="100"
              show-buttons
              size="small"
            />
          </FormField>
          <div class="prop-inline">
            <Checkbox v-model="form.borderRequired" input-id="tb-border" :binary="true" />
            <label for="tb-border">Show border</label>
          </div>
        </div>
        <div class="color-grid">
          <FormField class="color-cell" label="Background" group>
            <ColorPickerField v-model="form.backgroundColor" />
          </FormField>
          <FormField class="color-cell" label="Text color" group>
            <ColorPickerField v-model="form.textColor" />
          </FormField>
          <FormField class="color-cell" label="Border color" group>
            <ColorPickerField v-model="form.borderColor" :disabled="!form.borderRequired" />
          </FormField>
        </div>
        <ObjectPickerInput
          v-model="drillDownObject"
          label="Drill-down object"
          dialog-title="Select Drill-Down Object"
        />
      </template>

      <template v-else-if="isGroupBox">
        <FormField label="Title" v-slot="{ id }">
          <InputText :id="id" v-model="form.label" size="small" class="full-width" />
        </FormField>
        <FormField label="Width" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.width"
            :min="40"
            :max="4000"
            show-buttons
            size="small"
          />
        </FormField>
        <FormField label="Height" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.height"
            :min="40"
            :max="4000"
            show-buttons
            size="small"
          />
        </FormField>
        <FormField label="Color" group>
          <ColorPickerField v-model="form.color" />
        </FormField>
      </template>

      <template v-else-if="isImage">
        <FormField label="Image" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.imageGuid"
            :options="imageOptions"
            option-label="label"
            option-value="value"
            filter
            placeholder="Select image"
            size="small"
            class="full-width"
          />
        </FormField>
        <FormField label="Width" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.width"
            :min="8"
            :max="4000"
            show-buttons
            size="small"
          />
        </FormField>
        <FormField label="Height" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.height"
            :min="8"
            :max="4000"
            show-buttons
            size="small"
          />
        </FormField>
      </template>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button label="Apply" @click="apply" />
    </template>
  </Dialog>
</template>

<style scoped>
.element-props-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.full-width {
  width: 100%;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.props-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.color-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.color-cell-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}
</style>
