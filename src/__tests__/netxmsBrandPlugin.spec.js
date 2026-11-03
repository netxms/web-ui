// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import netxmsBrand from '../../vite-plugin-netxms-brand.js'

const VIRTUAL_ID = 'virtual:netxms-brand'
const HTML = [
  '<head>',
  '    <link rel="icon" href="/favicon.ico">',
  '    <title>NetXMS Console</title>',
  '  </head>',
].join('\n')
const posix = (file) => file.split(path.sep).join('/')
let brandsDir

function writeBrand(id, meta, files = {}) {
  const dir = path.join(brandsDir, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.js'), 'export default {}\n')
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify(meta))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
}

beforeAll(() => {
  brandsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netxms-brands-'))
  writeBrand('netxms', { productName: 'NetXMS', htmlTitle: 'NetXMS Console' })
  writeBrand(
    'acme',
    { productName: 'Acme <Ops> & Co', favicon: { svg: 'favicon.svg', png: 'favicon-32.png' } },
    { 'favicon.svg': '<svg/>', 'favicon-32.png': 'PNG' },
  )
  // A folder without a manifest is not a brand and must not be offered as one.
  fs.mkdirSync(path.join(brandsDir, 'not-a-brand'))
})

afterAll(() => {
  fs.rmSync(brandsDir, { recursive: true, force: true })
})

describe('netxmsBrand', () => {
  function load(brand) {
    const plugin = netxmsBrand({ brand, brandsDir })
    return plugin.load(plugin.resolveId(VIRTUAL_ID))
  }

  it('re-exports the selected manifest from a private id', () => {
    const plugin = netxmsBrand({ brand: 'acme', brandsDir })
    expect(plugin.resolveId(VIRTUAL_ID)).toBe(`\0${VIRTUAL_ID}`)
    const file = posix(path.join(brandsDir, 'acme', 'index.js'))
    expect(load('acme')).toBe(`export { default } from ${JSON.stringify(file)}\n`)
  })

  // Older envs may still say `default`.
  it.each([undefined, '', 'default'])('reads %j as the NetXMS brand', (value) => {
    expect(load(value)).toContain('/netxms/index.js')
  })

  it('leaves every other id to the rest of the pipeline', () => {
    const plugin = netxmsBrand({ brand: 'netxms', brandsDir })
    expect(plugin.resolveId('vue')).toBeUndefined()
    expect(plugin.load('/some/file.js')).toBeUndefined()
  })

  it('fails on an unknown brand and lists the brands that exist', () => {
    expect(() => netxmsBrand({ brand: 'bogus', brandsDir })).toThrow(
      /unknown brand "bogus"\. Available: acme, netxms$/,
    )
  })

  it('refuses ids that are not plain lowercase folder names', () => {
    expect(() => netxmsBrand({ brand: '../netxms', brandsDir })).toThrow(
      /unknown brand "\.\.\/netxms"/,
    )
    expect(() => netxmsBrand({ brand: 'ACME', brandsDir })).toThrow(/unknown brand "ACME"/)
  })

  describe('index.html', () => {
    const transform = (brand) => netxmsBrand({ brand, brandsDir }).transformIndexHtml(HTML)

    it('leaves the NetXMS page exactly as it is', () => {
      expect(transform('netxms')).toBe(HTML)
    })

    it('writes the product name as the title, escaped', () => {
      expect(transform('acme')).toContain('<title>Acme &lt;Ops&gt; &amp; Co</title>')
    })

    it('replaces the icon link with inline PNG and SVG favicons, PNG first', () => {
      const html = transform('acme')
      const png = Buffer.from('PNG').toString('base64')
      const svg = Buffer.from('<svg/>').toString('base64')
      expect(html).not.toContain('/favicon.ico')
      expect(html).toContain(
        `<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${png}">`,
      )
      expect(html).toContain(
        `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${svg}">`,
      )
      expect(html.indexOf('image/png')).toBeLessThan(html.indexOf('image/svg+xml'))
    })
  })

  describe('bundle guard', () => {
    // generateBundle runs only when Vite writes a build, so this is the check every
    // `yarn build` makes, whatever import form brought another brand's file in.
    function generate(brand, moduleIds) {
      const plugin = netxmsBrand({ brand, brandsDir })
      const bundle = {
        'index.js': { type: 'chunk', moduleIds },
        'index.css': { type: 'asset' },
      }
      const context = {
        error(message) {
          throw new Error(message)
        },
      }
      return () => plugin.generateBundle.call(context, {}, bundle)
    }
    const fileIn = (...parts) => path.join(brandsDir, ...parts)

    it('fails when a file of another brand reaches the bundle', () => {
      expect(generate('netxms', ['/src/main.js', fileIn('acme', 'logo.svg')])).toThrow(
        /Brand "acme" .*logo\.svg.* VITE_BUILD_VARIANT/,
      )
    })

    it('lets the selected brand, the shared files and core through', () => {
      const ids = [
        '/src/main.js',
        '\0virtual:netxms-brand',
        fileIn('index.js'),
        fileIn('vendor.js'),
        fileIn('acme', 'index.js'),
        `${fileIn('acme', 'logo.svg')}?url`,
      ]
      expect(generate('acme', ids)).not.toThrow()
    })
  })
})
