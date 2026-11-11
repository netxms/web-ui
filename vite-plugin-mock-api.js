import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_MOCKS_DIR = fileURLToPath(new URL('./mocks', import.meta.url))
const DEFAULT_MODULES_DIR = fileURLToPath(new URL('./src/modules', import.meta.url))

/**
 * Request handler for `/api` (the request URL without the `/api` prefix), answering from mock
 * folders: each enabled module's `<modulesDir>/<id>/mocks/` that exists, in `modules` order, then
 * core `mocks/`. Every folder runs its full lookup before the next, so a module's wildcard wins
 * over a core exact file.
 *
 * @param {{ modules?: string[], mocksDir?: string, modulesDir?: string }} options
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createMockHandler({
  modules = [],
  mocksDir = DEFAULT_MOCKS_DIR,
  modulesDir = DEFAULT_MODULES_DIR,
} = {}) {
  const mockDirs = [
    ...modules.map((id) => path.join(modulesDir, id, 'mocks')).filter((dir) => fs.existsSync(dir)),
    mocksDir,
  ]

  // Keeps JS mock state (e.g. counters) across requests.
  const jsModuleCache = new Map()

  /** Second line of defence behind the request-path normalization. */
  function isInside(dir, filePath) {
    const rel = path.relative(dir, path.resolve(filePath))
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  }

  async function loadJsMock(filePath) {
    if (!jsModuleCache.has(filePath)) {
      const mod = await import(pathToFileURL(filePath).href)
      jsModuleCache.set(filePath, mod.default)
    }
    return jsModuleCache.get(filePath)
  }

  /** @returns {Promise<boolean>} whether `dir` answered the request */
  async function serveFrom(dir, urlPath, method, req, res) {
    // JS mocks take priority over static JSON. These `_` wildcards are tried after the exact path:
    //   parent/_        for the last segment  (…/urls/{id})
    //   parent/_/child  for the id before it  (…/chains/{id}/rules)
    //   every numeric segment as `_`, JS only (.../objects/{id}/floor-plan/passive-elements/{id})
    const parts = urlPath.split('/')
    const wildcardPath = [...parts.slice(0, -1), '_'].join('/')
    const parentWildcardPath =
      parts.length >= 2 ? [...parts.slice(0, -2), '_', parts[parts.length - 1]].join('/') : null
    const idsWildcardPath = parts.map((part) => (/^\d+$/.test(part) ? '_' : part)).join('/')
    const jsCandidates = [
      path.join(dir, `${urlPath}.${method}.js`),
      path.join(dir, `${urlPath}.js`),
      path.join(dir, urlPath, `index.${method}.js`),
      path.join(dir, urlPath, 'index.js'),
      path.join(dir, `${wildcardPath}.${method}.js`),
      path.join(dir, `${wildcardPath}.js`),
      path.join(dir, wildcardPath, `index.${method}.js`),
      path.join(dir, wildcardPath, 'index.js'),
      ...(parentWildcardPath
        ? [
            path.join(dir, `${parentWildcardPath}.${method}.js`),
            path.join(dir, `${parentWildcardPath}.js`),
          ]
        : []),
      path.join(dir, `${idsWildcardPath}.${method}.js`),
      path.join(dir, `${idsWildcardPath}.js`),
    ]

    for (const filePath of jsCandidates) {
      if (isInside(dir, filePath) && fs.existsSync(filePath)) {
        try {
          const handler = await loadJsMock(filePath)
          const data = typeof handler === 'function' ? await handler(req, res) : handler
          if (res.writableEnded) return true
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
          return true
        } catch (err) {
          console.error(`[mock-api] Error in JS mock ${filePath}:`, err)
        }
      }
    }

    // Fall back to static JSON files (also with _ wildcard for last segment)
    const candidates = [
      path.join(dir, `${urlPath}.${method}.json`),
      path.join(dir, `${urlPath}.json`),
      path.join(dir, urlPath, `index.${method}.json`),
      path.join(dir, urlPath, 'index.json'),
      path.join(dir, `${wildcardPath}.${method}.json`),
      path.join(dir, `${wildcardPath}.json`),
      ...(parentWildcardPath
        ? [
            path.join(dir, `${parentWildcardPath}.${method}.json`),
            path.join(dir, `${parentWildcardPath}.json`),
          ]
        : []),
    ]

    for (const filePath of candidates) {
      if (isInside(dir, filePath) && fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8')
        res.setHeader('Content-Type', 'application/json')
        res.end(data)
        return true
      }
    }
    return false
  }

  async function handle(req, res) {
    const rawPath = req.url.split('?')[0].replace(/^\//, '')
    const method = req.method.toUpperCase()

    // Unnormalized `..` segments would escape the mock folders: arbitrary file read, and via
    // import() arbitrary module execution on the dev machine.
    let urlPath
    try {
      urlPath = decodeURIComponent(rawPath)
    } catch {
      res.statusCode = 400
      res.end('Bad request')
      return
    }
    if (urlPath.split(/[/\\]/).includes('..') || path.isAbsolute(urlPath)) {
      res.statusCode = 400
      res.end('Bad request')
      return
    }

    for (const dir of mockDirs) {
      if (await serveFrom(dir, urlPath, method, req, res)) return
    }

    console.warn(`[mock-api] No mock found for ${method} ${req.url}`)
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'No mock data for this endpoint' }))
  }

  return handle
}

/** Serves `/api` from mock folders on the dev server; see {@link createMockHandler}. */
export default function mockApiPlugin(options) {
  const handle = createMockHandler(options)
  return {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use('/api', handle)
    },
  }
}
