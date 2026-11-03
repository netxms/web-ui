import { ref, computed, watch, watchEffect } from 'vue'
import { updatePrimaryPalette } from '@primeuix/themes'
import {
  THEMES,
  DEFAULT_THEME_ID,
  THEME_PICKER_ENABLED,
  applyThemeVars,
  resolveThemeId,
} from '@/themes'
import { userPrefs } from '@/utils/appStorage'

const DARK_CLASS = 'app-dark'

const theme = ref(userPrefs.get('theme', 'light'))

const isDark = computed(() => theme.value === 'dark')

watchEffect(() => {
  document.documentElement.classList.toggle(DARK_CLASS, isDark.value)
})

// The toggle names what a click does, not the current state.
const themeIcon = computed(() => (isDark.value ? 'pi pi-sun' : 'pi pi-moon'))
const themeLabel = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'))

function toggleTheme() {
  setTheme(isDark.value ? 'light' : 'dark')
}

function setTheme(value) {
  theme.value = value
  userPrefs.set('theme', value)
}

const isRtl = ref(userPrefs.get('rtl', false) === true)

watchEffect(() => {
  document.documentElement.dir = isRtl.value ? 'rtl' : 'ltr'
})

function toggleRtl() {
  isRtl.value = !isRtl.value
  userPrefs.set('rtl', isRtl.value)
}

const colorTheme = ref(resolveThemeId(userPrefs.get('colorTheme', DEFAULT_THEME_ID)))

/** @param {string} id - a key of THEMES */
function setColorTheme(id) {
  const t = THEMES[id]
  if (!t) return
  colorTheme.value = id
  userPrefs.set('colorTheme', id)
  updatePrimaryPalette(t.palette)
  applyThemeVars(id)
}

const isHeaderDark = computed(() => isDark.value || THEMES[colorTheme.value]?.headerTone === 'dark')

watch(userPrefs.revision, () => {
  theme.value = userPrefs.get('theme', 'light')
  isRtl.value = userPrefs.get('rtl', false) === true
  const id = resolveThemeId(userPrefs.get('colorTheme', DEFAULT_THEME_ID))
  if (id !== colorTheme.value) setColorTheme(id)
})

export function useTheme() {
  return {
    theme,
    isDark,
    themeIcon,
    themeLabel,
    setTheme,
    toggleTheme,
    isRtl,
    toggleRtl,
    colorTheme,
    setColorTheme,
    isHeaderDark,
    THEMES,
    THEME_PICKER_ENABLED,
  }
}
