import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'
import skipFormatting from 'eslint-config-prettier/flat'

/** PrimeVue components that render a form control the label rules should recognise. */
const PRIMEVUE_CONTROLS = [
  'InputText',
  'InputNumber',
  'Textarea',
  'Select',
  'MultiSelect',
  'Checkbox',
  'RadioButton',
  'ToggleSwitch',
  'SelectButton',
  'DatePicker',
  'Password',
  'ColorPicker',
]

// `marked` has no built-in sanitizer: every markdown render must go through
// renderCommentsMarkdown(), which runs it through DOMPurify.
const MARKDOWN_IMPORT_PATHS = [
  {
    name: 'marked',
    message:
      'Use renderCommentsMarkdown() from @/utils/commentsUtils instead - it sanitizes with DOMPurify. Raw marked output in a v-html sink is stored XSS.',
  },
  {
    name: 'dompurify',
    message:
      'Sanitize via renderCommentsMarkdown() from @/utils/commentsUtils so every markdown path shares one configuration.',
  },
]

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,js,mjs,jsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '.claude/**']),

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // Injected by vite.config.js `define` for the About dialog.
        __APP_VERSION__: 'readonly',
        __APP_BUILD_DATE__: 'readonly',
      },
    },
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  ...pluginVueA11y.configs['flat/recommended'],

  {
    // Rules that reached zero findings are `error` so they cannot regress.
    name: 'app/accessibility',
    files: ['src/**/*.vue'],
    rules: {
      // Stays at `warn`: it cannot see through `FormField`, which renders the `<label for>` and
      // hands the id to its slot, so correctly labelled fields are still reported.
      'vuejs-accessibility/form-control-has-label': [
        'warn',
        { controlComponents: PRIMEVUE_CONTROLS },
      ],

      // `some`: a label either wraps its control or points at it by id (the default wants both).
      // `controlComponents` tells both label rules these PrimeVue wrappers render a real control.
      'vuejs-accessibility/label-has-for': [
        'error',
        { required: { some: ['nesting', 'id'] }, controlComponents: PRIMEVUE_CONTROLS },
      ],

      'vuejs-accessibility/iframe-has-title': 'error',
      'vuejs-accessibility/anchor-has-content': 'error',
      'vuejs-accessibility/mouse-events-have-key-events': 'error',
      'vuejs-accessibility/no-static-element-interactions': 'error',
      'vuejs-accessibility/click-events-have-key-events': 'error',

      // Focusing a modal's first field is intended; the rule cannot tell it from a focus steal.
      'vuejs-accessibility/no-autofocus': 'off',
    },
  },

  {
    // Components are never registered globally, so a tag without an import renders as an
    // unknown element with no error.
    name: 'app/no-undef-components',
    files: ['src/**/*.vue'],
    rules: {
      'vue/no-undef-components': ['error', { ignorePatterns: ['router-link', 'router-view'] }],
    },
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    // Live integration specs run under `// @vitest-environment node`; noRawMarked scans the
    // source tree from disk and needs `process.cwd()` under the default jsdom environment.
    name: 'app/node-env-tests',
    files: ['src/**/__tests__/*.live.spec.js', 'src/**/__tests__/noRawMarked.spec.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // Flat config does not merge one rule's options across blocks, so core and module files get one
  // no-restricted-imports block each (disjoint file sets, both carrying the markdown paths).
  // Kept after the oxlint block so rule de-duplication cannot switch them off.
  {
    // Core reaches modules only through `@/modules` and brands only through `@/brands`: a direct
    // import would pull a module, or another brand's assets, into the build.
    name: 'app/restricted-imports-core',
    files: ['src/**/*.{vue,js}'],
    ignores: ['src/modules/**', 'src/brands/**', 'src/utils/commentsUtils.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: MARKDOWN_IMPORT_PATHS,
          patterns: [
            {
              group: ['@/modules/*', '@/modules/**'],
              message:
                'Import modules only through @/modules; see CLAUDE.md, Enterprise modules.',
            },
            {
              group: ['@/brands/*', '@/brands/**'],
              message:
                'Import brands only through @/brands, which serves the brand VITE_BUILD_VARIANT selects.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'app/restricted-imports-modules',
    files: ['src/modules/**/*.{vue,js}', 'src/brands/**/*.{vue,js}'],
    rules: {
      'no-restricted-imports': ['error', { paths: MARKDOWN_IMPORT_PATHS }],
    },
  },

  skipFormatting,
])
