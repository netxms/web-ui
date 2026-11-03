import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VIRTUAL_ID = 'virtual:netxms-brand'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const DEFAULT_BRANDS_DIR = fileURLToPath(new URL('./src/brands', import.meta.url))
const BRAND_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export const DEFAULT_BRAND = 'netxms'

/**
 * Serves `virtual:netxms-brand` as a re-export of only the `src/brands/<VITE_BUILD_VARIANT>/`
 * manifest (empty or `default` means NetXMS), writes its title and favicon into index.html, and
 * fails a build in which another brand's file reached the bundle. Files directly in
 * `src/brands/` are shared.
 *
 * @param {{ brand?: string, brandsDir?: string }} [options]
 */
export default function netxmsBrand({ brand, brandsDir = DEFAULT_BRANDS_DIR } = {}) {
  const id = !brand || brand === 'default' ? DEFAULT_BRAND : brand
  const dir = path.join(brandsDir, id)
  const manifest = path.join(dir, 'index.js')
  if (!BRAND_ID_PATTERN.test(id) || !fs.existsSync(manifest)) {
    const available = listBrands(brandsDir).join(', ') || '(none)'
    throw new Error(`VITE_BUILD_VARIANT names unknown brand "${id}". Available: ${available}`)
  }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8'))
  const brandsRoot = `${toPosix(brandsDir)}/`

  return {
    name: 'netxms-brand',
    resolveId(source) {
      return source === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(loadId) {
      if (loadId !== RESOLVED_ID) return undefined
      return `export { default } from ${JSON.stringify(toPosix(manifest))}\n`
    },
    transformIndexHtml(html) {
      return rewriteIndexHtml(html, meta, dir)
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        for (const moduleFile of output.moduleIds ?? []) {
          const file = toPosix(moduleFile.split('?')[0])
          if (!file.startsWith(brandsRoot)) continue
          const [brandId, ...rest] = file.slice(brandsRoot.length).split('/')
          if (rest.length === 0 || brandId === id) continue
          this.error(
            `Brand "${brandId}" reached the bundle through ${file}, but VITE_BUILD_VARIANT ` +
              `selects "${id}". Core code must reach brands only via @/brands.`,
          )
        }
      }
    },
  }
}

/** Title from `htmlTitle` (default `productName`); favicon links only when the brand has one. */
function rewriteIndexHtml(html, meta, dir) {
  const title = escapeHtml(meta.htmlTitle ?? meta.productName)
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  if (meta.favicon) {
    // SVG last: browsers that render SVG icons pick it, the rest fall back to the PNG.
    const links = []
    if (meta.favicon.png) {
      const href = dataUri(path.join(dir, meta.favicon.png), 'image/png')
      links.push(`<link rel="icon" type="image/png" sizes="32x32" href="${href}">`)
    }
    if (meta.favicon.svg) {
      const href = dataUri(path.join(dir, meta.favicon.svg), 'image/svg+xml')
      links.push(`<link rel="icon" type="image/svg+xml" href="${href}">`)
    }
    out = out.replace(/<link rel="icon"[^>]*>/, links.join('\n    '))
  }
  return out
}

function dataUri(file, type) {
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toPosix(file) {
  return file.split(path.sep).join('/')
}

/** Folder names under `dir` that hold a manifest, for the unknown-brand error. */
function listBrands(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.js')))
    .map((entry) => entry.name)
    .sort()
}
