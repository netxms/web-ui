<script setup>
import { ref, computed, useId } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Popover from 'primevue/popover'
import { isDefaultOrder, orderColumns } from '@/utils/columnOrder'

/**
 * "Columns (N)" button with its show/hide popover, for a `defineTableColumnStore` store: bind
 * `v-model` to `visibleColumnIds`, and `v-model:order` to `columnOrder` for a reorderable table.
 * Changes are staged until Apply. Mandatory columns are always shown and counted.
 */

// Two root nodes (the button and the popover): attributes go to the button.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  /** `{ id, label, mandatory? }`, in display order. */
  columns: { type: Array, required: true },
  /** Mandatory ones optional. */
  modelValue: { type: Array, required: true },
  /** Empty = default order. Leave unbound for a fixed order. */
  order: { type: Array, default: null },
})

const emit = defineEmits(['update:modelValue', 'update:order'])

const idPrefix = useId()
const popover = ref(null)
const pending = ref([])
const pendingOrder = ref([])

const listedColumns = computed(() =>
  props.order ? orderColumns(props.columns, pendingOrder.value) : props.columns,
)

const orderIsDefault = computed(() => isDefaultOrder(props.columns, pendingOrder.value))

const shownCount = computed(
  () => props.columns.filter((c) => c.mandatory || props.modelValue.includes(c.id)).length,
)

const mandatoryIds = computed(() => props.columns.filter((c) => c.mandatory).map((c) => c.id))

const isTicked = (col) => col.mandatory || pending.value.includes(col.id)

const allTicked = computed(() => props.columns.every(isTicked))
const someTicked = computed(
  () => !allTicked.value && props.columns.some((c) => !c.mandatory && isTicked(c)),
)

function open(event) {
  pending.value = [...props.modelValue]
  pendingOrder.value = [...(props.order ?? [])]
  popover.value.toggle(event)
}

function toggle(col) {
  if (col.mandatory) return
  pending.value = pending.value.includes(col.id)
    ? pending.value.filter((id) => id !== col.id)
    : [...pending.value, col.id]
}

function toggleAll() {
  pending.value = allTicked.value ? [...mandatoryIds.value] : props.columns.map((c) => c.id)
}

function restoreOrder() {
  pendingOrder.value = []
}

function apply() {
  emit('update:modelValue', [...pending.value])
  if (props.order && pendingOrder.value.join() !== props.order.join()) {
    emit('update:order', [...pendingOrder.value])
  }
  popover.value.hide()
}

function cancel() {
  popover.value.hide()
}
</script>

<template>
  <Button
    v-bind="$attrs"
    icon="pi pi-table"
    :label="`Columns (${shownCount})`"
    size="small"
    severity="secondary"
    class="column-chooser-button"
    @click="open"
  />

  <Popover ref="popover">
    <div class="column-chooser-panel">
      <div class="column-chooser-selectall">
        <Checkbox
          :input-id="`${idPrefix}-all`"
          :model-value="allTicked"
          :indeterminate="someTicked"
          binary
          @change="toggleAll"
        />
        <label :for="`${idPrefix}-all`">Show all / Hide all</label>
      </div>
      <div class="column-chooser-list">
        <div v-for="col in listedColumns" :key="col.id" class="column-chooser-option">
          <Checkbox
            :input-id="`${idPrefix}-${col.id}`"
            :model-value="isTicked(col)"
            :disabled="col.mandatory"
            binary
            @change="toggle(col)"
          />
          <label :for="`${idPrefix}-${col.id}`">{{ col.label }}</label>
        </div>
      </div>
      <div v-if="order" class="column-chooser-order">
        <Button
          label="Restore default order"
          icon="pi pi-undo"
          size="small"
          severity="secondary"
          text
          :disabled="orderIsDefault"
          @click="restoreOrder"
        />
      </div>
      <div class="column-chooser-footer">
        <Button label="Cancel" size="small" severity="secondary" @click="cancel" />
        <Button label="Apply" size="small" @click="apply" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.column-chooser-button {
  flex-shrink: 0;
}

.column-chooser-panel {
  display: flex;
  flex-direction: column;
  width: 220px;
}

.column-chooser-selectall {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.column-chooser-selectall label {
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  user-select: none;
}

.column-chooser-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.column-chooser-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.75rem;
}

.column-chooser-option label {
  cursor: pointer;
  font-size: 0.875rem;
  user-select: none;
}

.column-chooser-order {
  padding: 0.25rem 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
}

.column-chooser-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--p-content-border-color);
}
</style>
