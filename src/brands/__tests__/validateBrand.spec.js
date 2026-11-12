// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { validateBrand } from '../validateBrand'

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

function validBrand() {
  const palette = Object.fromEntries(SHADES.map((shade) => [shade, '#123456']))
  return {
    id: 'acme',
    productName: 'Acme',
    logo: { color: '/acme.svg', white: '/acme-white.svg' },
    header: { divider: false },
    login: { logo: null },
    about: { productLine: 'Acme Console', copyright: null },
    whatsNew: false,
    vendorMark: true,
    themes: {
      main: {
        id: 'main',
        label: 'Main',
        swatch: '#123456',
        palette,
        preset: {},
        headerTone: 'dark',
        vars: {},
      },
    },
    defaultTheme: 'main',
  }
}

describe('validateBrand', () => {
  it('accepts a complete manifest', () => {
    expect(() => validateBrand(validBrand())).not.toThrow()
  })

  it.each([
    [
      'product name',
      (b) => {
        b.productName = ''
      },
      /productName/,
    ],
    [
      'white logo',
      (b) => {
        delete b.logo.white
      },
      /logo/,
    ],
    [
      'login logo',
      (b) => {
        b.login.logo = 'gold'
      },
      /login\.logo/,
    ],
    [
      'About product line',
      (b) => {
        delete b.about.productLine
      },
      /about\.productLine/,
    ],
    [
      'flag',
      (b) => {
        b.vendorMark = 'yes'
      },
      /vendorMark/,
    ],
    [
      'header divider',
      (b) => {
        delete b.header
      },
      /header\.divider/,
    ],
    [
      'default theme',
      (b) => {
        b.defaultTheme = 'other'
      },
      /defaultTheme "other"/,
    ],
    [
      'palette shade',
      (b) => {
        delete b.themes.main.palette['950']
      },
      /theme main: palette 950/,
    ],
    [
      'header tone',
      (b) => {
        b.themes.main.headerTone = 'grey'
      },
      /theme main: headerTone/,
    ],
    [
      'theme id',
      (b) => {
        b.themes.main.id = 'other'
      },
      /theme main: id/,
    ],
  ])('rejects a manifest with a bad %s', (_name, breakIt, message) => {
    const manifest = validBrand()
    breakIt(manifest)
    expect(() => validateBrand(manifest)).toThrow(message)
  })
})
