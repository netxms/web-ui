import { inject, provide } from 'vue'

const EDITOR_KEY = Symbol('widget-editor')

/**
 * `form` is a reactive working copy of the widget config that editors mutate directly; the
 * dialog owns save/cancel.
 *
 * @param {{ form: object, widgetType: string }} context
 */
export function provideWidgetEditor(context) {
  provide(EDITOR_KEY, context)
}

/** @returns {{ form: object, widgetType: string }} */
export function useWidgetEditor() {
  const ctx = inject(EDITOR_KEY, null)
  if (!ctx) throw new Error('useWidgetEditor must be used inside WidgetPropertiesDialog')
  return ctx
}
