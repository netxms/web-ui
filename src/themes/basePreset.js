import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Structural (non-color) token overrides for every theme. Separate from `index.js`, which
 * imports the brand that imports this: one module would be an import cycle.
 */
export const BASE_PRESET = definePreset(Aura, {
  components: {
    dialog: {
      header: {
        padding: '0.75rem 1.25rem',
      },
      title: {
        fontSize: '1.125rem',
      },
      content: {
        padding: '0.75rem 1.25rem 1.5rem 1.25rem',
      },
      footer: {
        padding: '0.75rem 1.25rem 0.75rem 0.5rem',
      },
    },
  },
})
