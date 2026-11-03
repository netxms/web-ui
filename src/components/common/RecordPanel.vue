<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'
import Button from 'primevue/button'
import { useResizeHandle } from '@/composables/useResizeHandle'

/**
 * One record's details as a resizable right-hand panel (like AiChatPanel), so the list stays
 * reachable. The parent owns the width (`update:width`). The default slot lays out with the
 * `.record-list` / `.record-row` / `.record-label` / `.record-value` classes; the `footer`
 * slot stays in view.
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  icon: { type: String, default: null },
  /** px */
  width: { type: Number, default: undefined },
  min: { type: Number, default: 360 },
  max: { type: Number, default: 1100 },
  resizeLabel: { type: String, default: 'Resize panel' },
})

const emit = defineEmits(['update:visible', 'update:width'])

// Never the only source of the width: unset, the panel shrink-wraps each record differently.
// The stylesheet carries the same default.
const panelStyle = computed(() =>
  Number.isFinite(props.width) ? { width: `${props.width}px` } : null,
)

function close() {
  emit('update:visible', false)
}

function onKeydown(event) {
  if (event.key === 'Escape') close()
}

watch(
  () => props.visible,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

const { isResizing, handleBindings: resizeBindings } = useResizeHandle({
  size: () => props.width,
  setSize: (px) => emit('update:width', px),
  min: () => props.min,
  max: () => props.max,
  label: props.resizeLabel,
})
</script>

<template>
  <div
    class="record-panel"
    :class="{ 'is-open': visible, 'is-resizing': isResizing }"
    :style="panelStyle"
    role="complementary"
    :aria-hidden="!visible"
    :inert="!visible"
  >
    <div class="record-resize-handle" v-bind="resizeBindings" />

    <header class="record-header">
      <span class="record-title">
        <i v-if="icon" :class="icon" />
        {{ title }}
      </span>
      <Button
        icon="pi pi-times"
        text
        severity="secondary"
        size="small"
        aria-label="Close"
        v-tooltip.bottom="'Close'"
        @click="close"
      />
    </header>

    <div class="record-body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="record-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.record-panel {
  position: fixed;
  top: 58px;
  right: 0;
  /* Also set inline from the parent; the default keeps the size predictable without it. */
  width: 560px;
  height: calc(100vh - 58px);
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-overlay);
  border-left: 1px solid var(--p-surface-border);
  box-shadow: -4px 0 20px color-mix(in srgb, #000 18%, transparent);
  transform: translateX(100%);
  transition: transform 0.25s ease;
}

.record-panel.is-open {
  transform: translateX(0);
}

.record-panel.is-resizing {
  transition: none;
  user-select: none;
}

.record-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
}

/* The handle is a transparent strip, so focus reuses the hover fill; an outline would be
   clipped by the panel edge. */
.record-resize-handle:hover,
.record-resize-handle:focus-visible,
.is-resizing .record-resize-handle {
  background: var(--p-primary-color);
  outline: none;
}

.record-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.record-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.9375rem;
}

.record-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.record-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}
</style>

<!-- Unscoped: these lay out what the parent passes in the slot. -->
<style>
/* Label beside value, like the Status view's info-list. Rows pair up once the panel is wide;
   long text and JSON span the full width. */
.record-panel .record-list {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  column-gap: 2.5rem;
  align-items: start;
}

.record-panel .record-row {
  display: grid;
  /* minmax(0, 1fr): an unbreakable value (a GUID) would otherwise widen the row. */
  grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: baseline;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.record-panel .record-row--wide {
  grid-column: 1 / -1;
}

.record-panel .record-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.record-panel .record-value {
  margin: 0;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
  word-break: break-word;
}
</style>
