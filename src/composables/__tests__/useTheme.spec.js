import { describe, it, expect, vi } from 'vitest'
import { useTheme } from '@/composables/useTheme'

// Palette switching needs a live PrimeVue theme service; only the header tone is under test.
vi.mock('@primeuix/themes', async (importOriginal) => ({
  ...(await importOriginal()),
  updatePrimaryPalette: vi.fn(),
}))

describe('dark mode toggle', () => {
  it('describes the switch, not the state, and shows the target mode', () => {
    const { setTheme, themeLabel, themeIcon } = useTheme()
    setTheme('light')
    expect(themeLabel.value).toBe('Switch to dark mode')
    expect(themeIcon.value).toBe('pi pi-moon')
    setTheme('dark')
    expect(themeLabel.value).toBe('Switch to light mode')
    expect(themeIcon.value).toBe('pi pi-sun')
    setTheme('light')
  })
})

describe('isHeaderDark', () => {
  it('follows the theme header tone in light mode', () => {
    const { setTheme, setColorTheme, isHeaderDark } = useTheme()
    setTheme('light')
    setColorTheme('emerald')
    expect(isHeaderDark.value).toBe(false)
    setColorTheme('flame')
    expect(isHeaderDark.value).toBe(true)
  })

  it('is dark for every theme in dark mode, where a light header takes the dark surface', () => {
    const { setTheme, setColorTheme, isHeaderDark } = useTheme()
    setColorTheme('emerald')
    setTheme('dark')
    expect(isHeaderDark.value).toBe(true)
    setTheme('light')
  })
})
