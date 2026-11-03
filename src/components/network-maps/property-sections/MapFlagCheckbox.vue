<script setup>
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import { hasMapFlag } from '@/utils/networkMapUtils'

/** One MF_* flag checkbox bound to the `draft.flags` bitmask. */
// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  bit: { type: Number, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const checked = computed(() => hasMapFlag(props.draft.flags, props.bit))

function setFlag(value) {
  const current = props.draft.flags ?? 0
  props.draft.flags = value ? current | props.bit : current & ~props.bit
}
</script>

<template>
  <div class="map-flag">
    <div class="prop-inline">
      <Checkbox
        :model-value="checked"
        :input-id="`mf-${bit}`"
        :binary="true"
        :disabled="disabled"
        @update:model-value="setFlag($event)"
      />
      <label :for="`mf-${bit}`" :class="{ 'label-disabled': disabled }">{{ label }}</label>
    </div>
    <small v-if="hint" class="prop-hint">{{ hint }}</small>
  </div>
</template>

<style scoped>
.map-flag {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.label-disabled {
  color: var(--p-text-muted-color);
}

.prop-hint {
  margin-left: 1.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
</style>
