<script setup>
import { computed, ref, toRef } from 'vue'
import Button from 'primevue/button'
import { getTypeDef } from '@/utils/dashboardElements'
import { useInViewport } from '@/composables/useInViewport'
import { provideWidgetActive } from '@/composables/useWidgetActive'
import { provideWidgetEditing } from '@/composables/useWidgetEditing'
import { WIDGET_COMPONENTS } from './widgetRegistry'

const props = defineProps({
  widget: { type: Object, required: true },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove', 'settings', 'update-config'])

// Off-screen widgets stop refreshing; each widget ANDs the flag into its query's `enabled`.
// `initial: true`: the first load still happens, and false would blank a visible widget until
// the observer's first callback.
const root = ref(null)
provideWidgetActive(useInViewport(root, { initial: true }))

// Widgets with their own controls (the status map's layout and sort) change their config here
// while editing; the canvas applies it to its working copy.
provideWidgetEditing({
  editMode: toRef(props, 'editMode'),
  updateConfig: (patch) => emit('update-config', props.widget.id, patch),
})

const typeDef = computed(() => getTypeDef(props.widget.type))
const title = computed(() => props.widget.config?.title ?? '')
const headerLabel = computed(() => title.value || typeDef.value.label)

const widgetComponent = computed(() => WIDGET_COMPONENTS[props.widget.type] ?? null)

const isInline = computed(() => typeDef.value.inline === true)

// As in legacy, untitled widgets have no header outside edit mode, where it is the drag handle.
const showHeader = computed(() => !isInline.value && (props.editMode || !!title.value))

const headerStyle = computed(() => {
  const cfg = props.widget.config ?? {}
  const style = {}
  if (cfg.titleBackground) style.background = cfg.titleBackground
  if (cfg.titleForeground) style.color = cfg.titleForeground
  return style
})

const placeholderNote = computed(() =>
  typeDef.value.backendReady === false
    ? 'Waiting for server support'
    : 'Not yet implemented in this console',
)
</script>

<template>
  <div
    ref="root"
    class="dashboard-widget"
    :class="{ 'edit-mode': editMode, 'is-inline': isInline }"
  >
    <div
      v-if="showHeader"
      class="widget-header"
      :class="{ 'drag-handle': editMode }"
      :style="headerStyle"
    >
      <i :class="typeDef.icon" class="widget-type-icon" />
      <span class="widget-title">{{ headerLabel }}</span>
      <Button
        aria-label="Widget settings"
        v-if="editMode"
        icon="pi pi-cog"
        size="small"
        text
        severity="secondary"
        class="widget-settings-btn"
        @click.stop="emit('settings', widget.id)"
      />
      <Button
        aria-label="Remove widget"
        v-if="editMode"
        icon="pi pi-times"
        size="small"
        text
        severity="danger"
        class="widget-remove-btn"
        @click.stop="emit('remove', widget.id)"
      />
    </div>

    <!-- Edit mode handle for inline (label/separator) widgets -->
    <div v-if="editMode && isInline" class="inline-edit-overlay drag-handle">
      <i class="pi pi-arrows-alt" />
      <Button
        aria-label="Widget settings"
        icon="pi pi-cog"
        size="small"
        text
        severity="secondary"
        class="widget-settings-btn"
        @click.stop="emit('settings', widget.id)"
      />
      <Button
        aria-label="Remove widget"
        icon="pi pi-times"
        size="small"
        text
        severity="danger"
        class="widget-remove-btn"
        @click.stop="emit('remove', widget.id)"
      />
    </div>

    <div class="widget-body">
      <component :is="widgetComponent" v-if="widgetComponent" :widget="widget" />
      <div v-else class="widget-placeholder">
        <i :class="typeDef.icon" class="placeholder-icon" />
        <span>{{ typeDef.label }}</span>
        <small>{{ placeholderNote }}</small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.15s;
}

.dashboard-widget.edit-mode {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  cursor: grab;
}

.dashboard-widget.edit-mode:active {
  cursor: grabbing;
}

.widget-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  color: var(--p-text-color);
  flex-shrink: 0;
  min-height: 2rem;
}

.widget-type-icon {
  font-size: 0.75rem;
  color: inherit;
  opacity: 0.6;
  flex-shrink: 0;
}

.widget-title {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 600;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-settings-btn,
.widget-remove-btn {
  flex-shrink: 0;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.widget-body {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  padding: 0.375rem 0.25rem;
}

.dashboard-widget.is-inline {
  background: transparent;
  border: none;
  border-radius: 0;
}

.dashboard-widget.is-inline .widget-body {
  padding: 0;
}

.dashboard-widget.is-inline.edit-mode {
  border: 1px dashed var(--p-primary-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--p-primary-color) 4%, transparent);
  position: relative;
}

.inline-edit-overlay {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem;
  z-index: 2;
  background: var(--p-surface-card);
  border-radius: 0 6px 0 6px;
  border-left: 1px solid var(--p-surface-border);
  border-bottom: 1px solid var(--p-surface-border);
}

.inline-edit-overlay > .pi {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.widget-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 100%;
  padding: 1rem;
  color: var(--p-text-muted-color);
  text-align: center;
}

.placeholder-icon {
  font-size: 1.75rem;
  opacity: 0.3;
}

.widget-placeholder span {
  font-size: 0.8125rem;
  font-weight: 600;
  opacity: 0.5;
}

.widget-placeholder small {
  font-size: 0.75rem;
  font-style: italic;
  opacity: 0.4;
}
</style>
