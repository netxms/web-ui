// Server of the demo image: the built bundle plus /api answered from the mock fixtures.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { parseModuleList } from '../src/modules/parseModuleList.js'
import { createMockHandler } from '../vite-plugin-mock-api.js'

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url))
const PORT = Number(process.env.PORT) || 80

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
}

const handleApi = createMockHandler({ modules: parseModuleList(process.env.VITE_MODULES) })

function sendFile(res, file) {
  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}

function isFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false
}

http
  .createServer((req, res) => {
    if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
      req.url = req.url.slice('/api'.length) || '/'
      handleApi(req, res)
      return
    }

    let urlPath
    try {
      urlPath = decodeURIComponent(req.url.split('?')[0])
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    const file = path.join(DIST_DIR, path.normalize(urlPath))
    if (file.startsWith(DIST_DIR + path.sep) && isFile(file)) {
      sendFile(res, file)
    } else if (urlPath.startsWith('/assets/')) {
      res.statusCode = 404
      res.end()
    } else {
      // History-mode router: every other path is a client-side route.
      sendFile(res, path.join(DIST_DIR, 'index.html'))
    }
  })
  .listen(PORT, () => console.log(`Demo console on port ${PORT}`))

// As PID 1 in the container, node has no default SIGTERM handler, so `docker stop` would wait
// out its timeout.
process.on('SIGTERM', () => process.exit(0))
