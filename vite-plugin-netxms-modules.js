import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleList } from './src/modules/parseModuleList.js'

export { parseModuleList }

const VIRTUAL_ID = 'virtual:netxms-modules'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const DEFAULT_MODULES_DIR = fileURLToPath(new URL('./src/modules', import.meta.url))
const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * Serves `virtual:netxms-modules` as static imports of only the listed manifests. An unknown id
 * throws while the config loads; a file of a disabled module reaching the bundle fails the build
 * (the lint rule sees only static `@/modules/<id>` imports, this sees them all).
 *
 * @param {{ modules: string[], modulesDir?: string }} options
 */
export default function netxmsModules({ modules, modulesDir = DEFAULT_MODULES_DIR }) {
  const manifests = modules.map((id) => {
    const file = path.join(modulesDir, id, 'index.js')
    if (!MODULE_ID_PATTERN.test(id) || !fs.existsSync(file)) {
      const available = listModules(modulesDir).join(', ') || '(none)'
      throw new Error(`VITE_MODULES names unknown module "${id}". Available: ${available}`)
    }
    return file.split(path.sep).join('/')
  })
  const enabled = new Set(modules)
  const modulesRoot = `${modulesDir.split(path.sep).join('/')}/`

  return {
    name: 'netxms-modules',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      const imports = manifests.map((file, i) => `import m${i} from ${JSON.stringify(file)}`)
      const names = manifests.map((_, i) => `m${i}`).join(', ')
      return `${imports.join('\n')}\nexport default [${names}]\n`
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        for (const moduleFile of output.moduleIds ?? []) {
          const file = moduleFile.split('?')[0].split(path.sep).join('/')
          if (!file.startsWith(modulesRoot)) continue
          const [moduleId, ...rest] = file.slice(modulesRoot.length).split('/')
          if (rest.length === 0 || enabled.has(moduleId)) continue
          this.error(
            `Enterprise module "${moduleId}" reached the bundle through ${file}, but ` +
              'VITE_MODULES does not enable it. Core code must reach modules only via @/modules.',
          )
        }
      }
    },
  }
}

/** Folder names under `dir` that hold a manifest, for the unknown-module error. */
function listModules(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.js')))
    .map((entry) => entry.name)
    .sort()
}
