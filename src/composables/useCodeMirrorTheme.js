import { computed } from 'vue'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '@/composables/useTheme'

const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--p-surface-card)',
    color: 'var(--p-text-color)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--p-surface-ground)',
    color: 'var(--p-text-muted-color)',
    borderRight: '1px solid var(--p-surface-border)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--p-surface-hover)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--p-surface-hover) 50%, transparent)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--p-text-color)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
})

const darkOverrides = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--p-surface-card)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--p-surface-ground)',
      borderRight: '1px solid var(--p-surface-border)',
    },
  },
  { dark: true },
)

export function useCodeMirrorTheme() {
  const { isDark } = useTheme()

  const themeExtensions = computed(() => (isDark.value ? [oneDark, darkOverrides] : [lightTheme]))

  return { themeExtensions }
}
