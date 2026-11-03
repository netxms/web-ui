import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { THEMES, DEFAULT_THEME_ID, applyThemeVars, resolveThemeId } from '@/themes'
import { userPrefs } from '@/utils/appStorage'

import App from './App.vue'
import router from './router'
import { queryClientOptions } from '@/queries/config'

import 'primeicons/primeicons.css'
import '@/assets/styles/main.css'

const app = createApp(App)

// Applied before mount so the first paint has the right colors. A saved id this brand does not
// offer falls back to the default.
const savedThemeId = resolveThemeId(userPrefs.get('colorTheme', DEFAULT_THEME_ID))
const initialPreset = THEMES[savedThemeId].preset
applyThemeVars(savedThemeId)

// Dev Lab font experiments survive reloads; release builds drop the module.
if (import.meta.env.DEV) {
  import('@/utils/devFontLab').then(({ restoreTypography }) => restoreTypography())
}

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin, queryClientOptions)
app.use(PrimeVue, {
  theme: {
    preset: initialPreset,
    options: {
      darkModeSelector: '.app-dark',
    },
  },
})
app.use(ConfirmationService)
app.use(ToastService)

app.directive('tooltip', Tooltip)

app.config.globalProperties.$plural = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

/**
 * Rethrown on a fresh task so it surfaces as an uncaught exception with its original stack.
 * ErrorBoundary owns the recovery UI.
 */
app.config.errorHandler = (err, _instance, info) => {
  if (err instanceof Error) {
    err.vueErrorInfo = info
  }
  setTimeout(() => {
    throw err
  })
}

app.mount('#app')

// Not awaited: mounting must not wait on a network round trip.
import('@/stores/authStore').then(({ useAuthStore }) => {
  useAuthStore().checkSession()
})
