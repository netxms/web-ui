<script setup>
// Layers of the open map, for someone watching it: show and hide them, and bring one forward
// (the rest dim) by clicking it or by walking the list with the arrow keys.
import { computed, nextTick, ref } from 'vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{ name: string, count: number, hidden: boolean }>>} */
  layers: { type: Array, required: true },
  unlayeredCount: { type: Number, default: 0 },
  /** The layer brought forward, or null. */
  focusedLayer: { type: String, default: null },
  /** False on the geographical canvas, which cannot dim. */
  canFocus: { type: Boolean, default: true },
  /** Layers can be assigned here (graph canvas, a server that stores them). */
  canEdit: { type: Boolean, default: false },
  selectionCount: { type: Number, default: 0 },
})

const emit = defineEmits([
  'toggle',
  'show-all',
  'hide-all',
  'focus',
  'hover',
  'new-from-selection',
  'rename',
  'delete',
  'close',
])

const anyHidden = computed(() => props.layers.some((l) => l.hidden))
const allHidden = computed(() => props.layers.every((l) => l.hidden))

const rowButtons = ref([])

/** Hidden layers cannot be brought forward, so the walk passes over them. */
function focusable(layer) {
  return props.canFocus && !layer.hidden
}

function onRowClick(layer) {
  emit('focus', props.focusedLayer === layer.name ? null : layer.name)
}

async function walk(from, step) {
  const rows = props.layers
  for (let i = from + step; i >= 0 && i < rows.length; i += step) {
    if (!focusable(rows[i])) continue
    emit('focus', rows[i].name)
    await nextTick()
    rowButtons.value[i]?.focus()
    return
  }
}

function onRowKeydown(event, index) {
  if (event.key === 'ArrowDown') walk(index, 1)
  else if (event.key === 'ArrowUp') walk(index, -1)
  else if (event.key === 'Home') walk(-1, 1)
  else if (event.key === 'End') walk(props.layers.length, -1)
  else if (event.key === 'Escape') {
    // Keyboard focus previews its row, so that goes too.
    emit('focus', null)
    emit('hover', null)
  } else return
  event.preventDefault()
}

const rowMenuRef = ref(null)
const rowMenuLayer = ref(null)
const rowMenuItems = computed(() => [
  {
    label: 'Rename...',
    icon: 'pi pi-pencil',
    command: () => emit('rename', rowMenuLayer.value),
  },
  {
    label: 'Delete Layer',
    icon: 'pi pi-trash',
    command: () => emit('delete', rowMenuLayer.value),
  },
])

function openRowMenu(event, name) {
  rowMenuLayer.value = name
  rowMenuRef.value?.toggle(event)
}
</script>

<template>
  <section class="layers-panel" aria-label="Layers">
    <header class="layers-panel__header">
      <span class="layers-panel__title">Layers</span>
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        aria-label="Close layers"
        @click="emit('close')"
      />
    </header>

    <template v-if="layers.length">
      <div class="layers-panel__bulk">
        <Button
          label="Show all"
          text
          size="small"
          :disabled="!anyHidden"
          @click="emit('show-all')"
        />
        <Button
          label="Hide all"
          text
          size="small"
          :disabled="allHidden"
          @click="emit('hide-all')"
        />
      </div>

      <ul class="layers-panel__list" aria-label="Map layers">
        <li
          v-for="(layer, index) in layers"
          :key="layer.name"
          class="layer-row"
          :class="{
            'layer-row--focused': layer.name === focusedLayer,
            'layer-row--hidden': layer.hidden,
          }"
        >
          <Button
            :icon="layer.hidden ? 'pi pi-eye-slash' : 'pi pi-eye'"
            text
            rounded
            size="small"
            severity="secondary"
            class="layer-row__eye"
            :aria-label="`${layer.hidden ? 'Show' : 'Hide'} layer ${layer.name}`"
            :aria-pressed="!layer.hidden"
            @click="emit('toggle', layer.name)"
          />
          <button
            :ref="(el) => (rowButtons[index] = el)"
            type="button"
            class="layer-row__main"
            :disabled="!focusable(layer)"
            :aria-pressed="layer.name === focusedLayer"
            @click="onRowClick(layer)"
            @keydown="onRowKeydown($event, index)"
            @mouseenter="emit('hover', layer.name)"
            @mouseleave="emit('hover', null)"
            @focus="emit('hover', layer.name)"
            @blur="emit('hover', null)"
          >
            <span class="layer-row__name">{{ layer.name }}</span>
            <span class="layer-row__count">{{ layer.count }}</span>
          </button>
          <Button
            v-if="canEdit"
            icon="pi pi-ellipsis-v"
            text
            rounded
            size="small"
            severity="secondary"
            class="layer-row__menu"
            :aria-label="`Layer ${layer.name} actions`"
            aria-haspopup="true"
            @click="openRowMenu($event, layer.name)"
          />
        </li>
      </ul>

      <div class="layers-panel__unlayered">
        <span>No layer</span>
        <span class="layer-row__count">{{ unlayeredCount }}</span>
      </div>
      <p v-if="canFocus" class="layers-panel__hint">
        Click a layer to bring it forward.
      </p>
    </template>

    <div v-else class="layers-panel__empty">
      <p>No layers on this map yet.</p>
      <p v-if="canEdit">
        Select elements on the map, then make a layer from them. Layers let viewers show and hide
        parts of a busy map.
      </p>
    </div>

    <footer v-if="canEdit" class="layers-panel__footer">
      <Button
        label="New layer from selection"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        :disabled="!selectionCount"
        @click="emit('new-from-selection')"
      />
      <span v-if="!selectionCount" class="layers-panel__footer-hint">
        Select elements on the map first.
      </span>
    </footer>

    <Menu ref="rowMenuRef" :model="rowMenuItems" :popup="true" />
  </section>
</template>

<style scoped>
.layers-panel {
  display: flex;
  flex-direction: column;
  width: 15rem;
  max-height: min(32rem, 70vh);
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  font-size: 0.8125rem;
}

.layers-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.25rem 0.25rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.layers-panel__title {
  font-weight: 600;
}

.layers-panel__bulk {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem 0;
}

.layers-panel__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem 0.25rem;
  list-style: none;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  border-radius: 6px;
}

.layer-row--focused {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.layer-row--hidden .layer-row__main {
  color: var(--p-text-muted-color);
}

.layer-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.25rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.layer-row__main:disabled {
  cursor: default;
}

.layer-row__main:not(:disabled):hover {
  background: var(--p-content-hover-background);
}

.layer-row__main:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.layer-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-row__count {
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

.layers-panel__unlayered {
  display: flex;
  justify-content: space-between;
  margin: 0 0.25rem;
  padding: 0.35rem 0.75rem 0.35rem 2.6rem;
  border-top: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
}

.layers-panel__hint,
.layers-panel__empty {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  line-height: 1.4;
}

.layers-panel__empty p {
  margin: 0 0 0.375rem;
}

.layers-panel__footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid var(--p-surface-border);
}

.layers-panel__footer-hint {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
</style>
