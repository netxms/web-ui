const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const HEX = /^#[0-9a-f]{6}$/i

/**
 * Throw when a brand manifest lacks something the console reads unconditionally. Used by the
 * manifest specs, not at runtime.
 *
 * @param {object} manifest
 */
export function validateBrand(manifest) {
  const problems = []
  const b = manifest ?? {}
  if (!b.id) problems.push('id')
  if (typeof b.productName !== 'string' || !b.productName) problems.push('productName')
  if (!b.logo?.color || !b.logo?.white) problems.push('logo.color / logo.white')
  if (typeof b.header?.divider !== 'boolean') problems.push('header.divider')
  if (!b.login || ![null, 'color', 'white'].includes(b.login.logo)) problems.push('login.logo')
  if (typeof b.about?.productLine !== 'string') problems.push('about.productLine')
  if (b.about && b.about.copyright !== null && typeof b.about.copyright !== 'string') {
    problems.push('about.copyright')
  }
  for (const flag of ['whatsNew', 'vendorMark']) {
    if (typeof b[flag] !== 'boolean') problems.push(flag)
  }
  const themes = b.themes ?? {}
  if (!Object.hasOwn(themes, b.defaultTheme ?? '')) {
    problems.push(`defaultTheme "${b.defaultTheme}" is not in themes`)
  }
  for (const [key, theme] of Object.entries(themes)) {
    if (theme.id !== key) problems.push(`theme ${key}: id`)
    if (!theme.label || !theme.swatch || !theme.preset) {
      problems.push(`theme ${key}: label / swatch / preset`)
    }
    if (!['dark', 'light'].includes(theme.headerTone)) problems.push(`theme ${key}: headerTone`)
    const missing = SHADES.filter((shade) => !HEX.test(theme.palette?.[shade] ?? ''))
    if (missing.length) problems.push(`theme ${key}: palette ${missing.join(', ')}`)
  }
  if (problems.length) {
    throw new Error(`Brand "${b.id ?? '?'}" is invalid: ${problems.join('; ')}`)
  }
}
