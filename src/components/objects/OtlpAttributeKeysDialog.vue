<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

/** Picks the OTLP attribute keys that identify an instance; emits them in the metric's order. */
const props = defineProps({
  visible: { type: Boolean, required: true },
  metricName: { type: String, default: '' },
  keys: { type: Array, default: () => [] },
  initial: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'select'])

const checked = ref([])

watch(
  () => props.visible,
  (v) => {
    if (v) checked.value = props.keys.filter((k) => props.initial.includes(k))
  },
  { immediate: true },
)

function confirm() {
  emit(
    'select',
    props.keys.filter((k) => checked.value.includes(k)),
  )
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Instance Key Attributes"
    modal
    :style="{ width: '480px' }"
    :breakpoints="{ '600px': '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <p class="intro">
      Select the attribute keys of <code>{{ metricName }}</code> that uniquely identify an instance.
      The metric name is always part of the key.
    </p>
    <ul class="key-list">
      <li v-for="(key, index) in keys" :key="key" class="key-row">
        <Checkbox v-model="checked" :value="key" :input-id="`otlp-key-${index}`" />
        <label :for="`otlp-key-${index}`">{{ key }}</label>
      </li>
    </ul>

    <template #footer>
      <Button label="Cancel" severity="secondary" size="small" @click="close" />
      <Button label="OK" size="small" @click="confirm" />
    </template>
  </Dialog>
</template>

<style scoped>
.intro {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  line-height: 1.4;
}

.intro code {
  overflow-wrap: anywhere;
}

.key-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 6px);
}

.key-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.75rem;
}

.key-row label {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  cursor: pointer;
  overflow-wrap: anywhere;
}
</style>
