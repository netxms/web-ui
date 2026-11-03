import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MOCKS_DIR = fileURLToPath(new URL('./mocks', import.meta.url))
const DEFAULT_MODULES_DIR = fileURLToPath(new URL('./src/modules', import.meta.url))

/**
 * Fails a `VITE_DEMO_CONTENT=false` build in which a file under `mocks/` reached the bundle;
 * seeds stay out only when imported through src/api/demoSeeds.js. Module mocks fail every build.
 *
 * @param {{ enabled: boolean, mocksDir?: string, modulesDir?: string }} options
 */
export default function netxmsDemo({
  enabled,
  mocksDir = DEFAULT_MOCKS_DIR,
  modulesDir = DEFAULT_MODULES_DIR,
}) {
  const mocksRoot = `${mocksDir.split(path.sep).join('/')}/`
  const modulesRoot = `${modulesDir.split(path.sep).join('/')}/`

  function isModuleMock(file) {
    return file.startsWith(modulesRoot) && file.slice(modulesRoot.length).split('/')[1] === 'mocks'
  }

  return {
    name: 'netxms-demo',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        // `moduleIds` also lists modules tree-shaking emptied, so go by rendered length.
        for (const [moduleFile, rendered] of Object.entries(output.modules ?? {})) {
          if (rendered.renderedLength === 0) continue
          const file = moduleFile.split('?')[0].split(path.sep).join('/')
          if (isModuleMock(file)) {
            this.error(
              `Module mock ${file} reached the bundle. Module mocks serve the dev server only.`,
            )
          }
          if (!enabled && file.startsWith(mocksRoot)) {
            this.error(
              `Demo content ${file} reached the bundle, but VITE_DEMO_CONTENT=false. Import ` +
                'demo seeds only through src/api/demoSeeds.js.',
            )
          }
        }
      }
    },
  }
}
