<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const detailFields = computed(() => {
  const n = props.node
  return [
    { label: 'OID', value: n.oid },
    { label: 'Name', value: n.name },
    { label: 'Type', value: n.type },
    { label: 'Status', value: n.status },
    { label: 'Access', value: n.access },
    { label: 'Index', value: n.index },
    { label: 'Display Hint', value: n.displayHint },
    { label: 'Textual Convention', value: n.textualConvention },
    { label: 'Description', value: n.description },
  ].filter((f) => f.value != null && f.value !== '')
})

const enumValues = computed(() => (props.node.enumValues?.length ? props.node.enumValues : null))
</script>

<template>
  <div class="mib-object-details">
    <div class="details-grid">
      <template v-for="field in detailFields" :key="field.label">
        <span class="detail-label">{{ field.label }}</span>
        <span
          class="detail-value"
          :class="{ 'detail-value--description': field.label === 'Description' }"
          >{{ field.value }}</span
        >
      </template>
    </div>
    <div v-if="enumValues" class="enum-section">
      <span class="detail-label">Enum Values</span>
      <div class="enum-table">
        <div v-for="ev in enumValues" :key="ev.value" class="enum-row">
          <span class="enum-val">{{ ev.value }}</span>
          <span class="enum-name">{{ ev.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.details-grid {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: 0.25rem 0.75rem;
  align-items: baseline;
}

.detail-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.detail-value {
  font-size: 0.8125rem;
  color: var(--p-text-color);
  word-break: break-word;
}

.detail-value--description {
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--p-text-muted-color);
  grid-column: 1 / -1;
  padding: 0.25rem 0 0.25rem 0;
  border-top: 1px dashed var(--p-surface-border);
  margin-top: 0.125rem;
}

.enum-section {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.enum-table {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.25rem;
  background: var(--p-surface-ground);
  border-radius: 4px;
  border: 1px solid var(--p-surface-border);
}

.enum-row {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
}

.enum-val {
  color: var(--p-text-muted-color);
  width: 2rem;
  text-align: right;
}

.enum-name {
  color: var(--p-text-color);
}
</style>
