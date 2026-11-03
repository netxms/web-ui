<script setup>
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'

/** Rule: { comparisonType, image, compareValue, comment }; first match in array order wins. */
defineProps({
  rule: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const emit = defineEmits(['update', 'remove', 'move'])

// Index is comparisonType 0-7, as in the legacy DCIImageConfiguration switch
const OPERATION_OPTIONS = [
  { label: 'Less than', value: 0 },
  { label: 'Less than or equals', value: 1 },
  { label: 'Equals', value: 2 },
  { label: 'Greater than or equals', value: 3 },
  { label: 'Greater than', value: 4 },
  { label: 'Not equals', value: 5 },
  { label: 'Like', value: 6 },
  { label: 'Not like', value: 7 },
]
</script>

<template>
  <div class="rule-card">
    <div class="rule-card-row">
      <Select
        :model-value="rule.comparisonType"
        :options="OPERATION_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        class="rule-operation"
        @update:model-value="emit('update', { comparisonType: $event })"
      />
      <InputText
        :model-value="rule.compareValue"
        size="small"
        placeholder="Value"
        class="rule-value"
        @update:model-value="emit('update', { compareValue: $event })"
      />
      <div class="rule-controls">
        <Button
          aria-label="Move rule up"
          icon="pi pi-chevron-up"
          size="small"
          text
          severity="secondary"
          :disabled="index === 0"
          @click="emit('move', -1)"
        />
        <Button
          aria-label="Move rule down"
          icon="pi pi-chevron-down"
          size="small"
          text
          severity="secondary"
          :disabled="index === count - 1"
          @click="emit('move', 1)"
        />
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          @click="emit('remove')"
          aria-label="Remove rule"
        />
      </div>
    </div>
    <div class="rule-card-row">
      <ImagePickerButton
        :model-value="rule.image"
        label="Select image"
        class="rule-image"
        @update:model-value="emit('update', { image: $event })"
      />
      <InputText
        :model-value="rule.comment"
        size="small"
        placeholder="Comment (optional)"
        class="rule-comment"
        @update:model-value="emit('update', { comment: $event })"
      />
    </div>
  </div>
</template>

<style scoped>
.rule-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.625rem 0.75rem;
}

.rule-card-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rule-operation {
  width: 12rem;
  flex-shrink: 0;
}

.rule-value {
  flex: 1;
  min-width: 0;
}

.rule-controls {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: auto;
  flex-shrink: 0;
}

.rule-image {
  flex: 1.2;
  min-width: 0;
}

.rule-comment {
  flex: 1;
  min-width: 0;
}
</style>
