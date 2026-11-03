import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const modulesDir = path.join(root, 'src/modules')
const modules = fs
  .readdirSync(modulesDir, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && fs.existsSync(path.join(modulesDir, entry.name, 'index.js')),
  )
  .map((entry) => path.join('src/modules', entry.name))
  .sort()

// oxlint's recursive scan skips git-ignored checkouts; explicit folder arguments include them.
if (modules.length > 0) {
  const result = spawnSync('oxlint', [...modules, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error) console.error(`Could not run oxlint: ${result.error.message}`)
  process.exitCode = result.status ?? 1
}
