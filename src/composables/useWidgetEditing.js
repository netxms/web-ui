import { inject, provide, ref } from 'vue'

const WIDGET_EDITING_KEY = Symbol('widget-editing')

const NOT_EDITING = { editMode: ref(false), updateConfig: () => {} }

/**
 * For widgets with in-place controls that belong to the dashboard (status map layout, sort).
 * `updateConfig` patches the canvas's unsaved working copy: Save keeps it, Discard drops it.
 *
 * @param {{ editMode: import('vue').Ref<boolean>, updateConfig: (patch: object) => void }} editing
 */
export function provideWidgetEditing(editing) {
  provide(WIDGET_EDITING_KEY, editing)
}

/**
 * @returns {{ editMode: import('vue').Ref<boolean>, updateConfig: (patch: object) => void }}
 */
export function useWidgetEditing() {
  return inject(WIDGET_EDITING_KEY, NOT_EDITING)
}
