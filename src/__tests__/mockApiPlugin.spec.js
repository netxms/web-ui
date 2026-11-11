// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mockApiPlugin from '../../vite-plugin-mock-api.js'

let root
let mocksDir
let modulesDir

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'netxms-mock-api-'))
  mocksDir = path.join(root, 'mocks')
  modulesDir = path.join(root, 'modules')

  write(path.join(mocksDir, 'v1', 'shared.json'), '{"from":"core"}')
  write(path.join(mocksDir, 'v1', 'core-only.json'), '{"from":"core"}')
  write(path.join(mocksDir, 'v1', 'objects', '7.json'), '{"from":"core exact"}')
  write(
    path.join(mocksDir, 'v1', 'objects', '_', 'plan', 'items', '_.js'),
    'export default () => ({ from: "ids wildcard" })\n',
  )
  write(
    path.join(mocksDir, 'v1', 'objects', '9', 'plan', 'items', '_.js'),
    'export default () => ({ from: "object 9" })\n',
  )

  write(path.join(modulesDir, 'alpha', 'index.js'), 'export default {}\n')
  write(path.join(modulesDir, 'alpha', 'mocks', 'v1', 'shared.json'), '{"from":"alpha"}')
  write(
    path.join(modulesDir, 'alpha', 'mocks', 'v1', 'objects', '_.js'),
    'export default () => ({ from: "alpha wildcard" })\n',
  )
  write(path.join(modulesDir, 'beta', 'mocks', 'v1', 'shared.json'), '{"from":"beta"}')
  // A module without a mocks folder is skipped.
  write(path.join(modulesDir, 'gamma', 'index.js'), 'export default {}\n')

  // Must stay unreachable from any URL.
  write(path.join(root, 'secret.json'), '{"secret":true}')
  write(path.join(modulesDir, 'alpha', 'secret.json'), '{"secret":true}')
})

afterAll(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

/** @returns {(url: string, method?: string) => Promise<{ status: number, body: string }>} */
function server(modules) {
  let middleware
  mockApiPlugin({ modules, mocksDir, modulesDir }).configureServer({
    middlewares: {
      use(prefix, fn) {
        expect(prefix).toBe('/api')
        middleware = fn
      },
    },
  })
  return async (url, method = 'GET') => {
    const res = {
      statusCode: 200,
      writableEnded: false,
      body: '',
      setHeader() {},
      end(body = '') {
        this.body = body
        this.writableEnded = true
      },
    }
    await middleware({ url, method }, res, () => {})
    return { status: res.statusCode, body: res.body }
  }
}

describe('mockApiPlugin', () => {
  it('serves an enabled module mock before core', async () => {
    const get = server(['alpha'])
    expect(await get('/v1/shared')).toEqual({ status: 200, body: '{"from":"alpha"}' })
  })

  it('falls through to core when the module has no match', async () => {
    const get = server(['alpha'])
    expect(await get('/v1/core-only')).toEqual({ status: 200, body: '{"from":"core"}' })
  })

  it('tries enabled modules in the listed order', async () => {
    expect((await server(['beta', 'alpha'])('/v1/shared')).body).toBe('{"from":"beta"}')
  })

  it('ignores the mocks of a module that is not enabled', async () => {
    expect((await server([])('/v1/shared')).body).toBe('{"from":"core"}')
    expect((await server(['beta'])('/v1/objects/9')).status).toBe(404)
  })

  it('skips an enabled module without a mocks folder', async () => {
    expect((await server(['gamma'])('/v1/shared')).body).toBe('{"from":"core"}')
  })

  it('lets a module wildcard win over a core exact file', async () => {
    expect((await server(['alpha'])('/v1/objects/7')).body).toBe('{"from":"alpha wildcard"}')
    expect((await server([])('/v1/objects/7')).body).toBe('{"from":"core exact"}')
  })

  it('takes every numeric segment as a wildcard when nothing closer matches', async () => {
    const get = server([])
    expect((await get('/v1/objects/12/plan/items/5', 'PATCH')).body).toBe('{"from":"ids wildcard"}')
    expect((await get('/v1/objects/9/plan/items/5', 'PATCH')).body).toBe('{"from":"object 9"}')
    // Named segments stay as they are.
    expect((await get('/v1/objects/12/plan/other/5')).status).toBe(404)
  })

  it('answers 404 when no folder has a match', async () => {
    expect((await server(['alpha'])('/v1/nothing')).status).toBe(404)
  })

  it.each([
    '/v1/../../secret',
    '/../secret',
    '/v1/%2e%2e/%2e%2e/secret',
    '/v1/..%2F..%2Fsecret',
    '/v1/..%5C..%5Csecret',
  ])('rejects traversal in %s', async (url) => {
    const res = await server(['alpha'])(url)
    expect(res.status).toBe(400)
    expect(res.body).not.toContain('secret')
  })
})
