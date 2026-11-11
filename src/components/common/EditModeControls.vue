<script setup>
import Button from 'primevue/button'
import { Undo2, Redo2 } from 'lucide-vue-next'

/** View/Edit switch with Undo, Redo, Discard and Save, for an editor with an explicit edit mode. */
defineProps({
  /** Accessible name of the View/Edit switch, e.g. "Map mode" */
  modeLabel: { type: String, default: 'Mode' },
  editMode: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits(['enter-edit', 'exit-edit', 'save', 'discard', 'undo', 'redo'])
</script>

<template>
  <div class="edit-controls">
    <template v-if="editMode">
      <Transition name="dirty-fade">
        <span v-if="dirty" class="dirty-indicator">
          <i class="pi pi-circle-fill" />
          Unsaved
        </span>
      </Transition>
      <Button
        size="small"
        severity="secondary"
        text
        rounded
        :disabled="!canUndo || saving"
        aria-label="Undo"
        v-tooltip.bottom="'Undo (Ctrl+Z)'"
        @click="emit('undo')"
      >
        <template #icon>
          <Undo2 :size="15" />
        </template>
      </Button>
      <Button
        size="small"
        severity="secondary"
        text
        rounded
        :disabled="!canRedo || saving"
        aria-label="Redo"
        v-tooltip.bottom="'Redo (Ctrl+Shift+Z)'"
        @click="emit('redo')"
      >
        <template #icon>
          <Redo2 :size="15" />
        </template>
      </Button>
      <div class="edit-controls-divider" />
      <Button
        label="Discard"
        size="small"
        severity="secondary"
        text
        :disabled="!dirty || saving"
        v-tooltip.bottom="'Revert all unsaved changes'"
        @click="emit('discard')"
      />
      <Button
        label="Save"
        icon="pi pi-check"
        size="small"
        :disabled="!dirty"
        :loading="saving"
        v-tooltip.bottom="'Save (Ctrl+S)'"
        @click="emit('save')"
      />
      <div class="edit-controls-divider" />
    </template>
    <div class="mode-switch" role="group" :aria-label="modeLabel">
      <button
        type="button"
        class="mode-switch-btn"
        :class="{ active: !editMode }"
        :disabled="saving"
        @click="editMode && emit('exit-edit')"
      >
        View
      </button>
      <button
        type="button"
        class="mode-switch-btn"
        :class="{ active: editMode }"
        :disabled="saving"
        @click="!editMode && emit('enter-edit')"
      >
        Edit
      </button>
    </div>
  </div>
</template>

<style scoped>
.edit-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.3rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.edit-controls-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.125rem;
  flex-shrink: 0;
}

.dirty-indicator {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.375rem;
  white-space: nowrap;
}

.dirty-indicator .pi-circle-fill {
  font-size: 0.5rem;
  color: var(--p-amber-500);
}

.dirty-fade-enter-active,
.dirty-fade-leave-active {
  transition: opacity 0.15s ease;
}

.dirty-fade-enter-from,
.dirty-fade-leave-to {
  opacity: 0;
}

.mode-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--p-surface-ground);
}

.mode-switch-btn {
  border: 1px solid transparent;
  border-radius: 5px;
  background: none;
  padding: 0.2rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.mode-switch-btn:hover:not(.active):not(:disabled) {
  color: var(--p-text-color);
}

.mode-switch-btn.active {
  background: var(--p-surface-card);
  border-color: var(--p-surface-border);
  color: var(--p-text-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  cursor: default;
}

.mode-switch-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
