// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import netxmsModules, { parseModuleList } from '../../vite-plugin-netxms-modules.js'

const VIRTUAL_ID = 'virtual:netxms-modules'
let modulesDir

beforeAll(() => {
  modulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netxms-modules-'))
  fs.mkdirSync(path.join(modulesDir, 'alpha'))
  fs.writeFileSync(path.join(modulesDir, 'alpha', 'index.js'), 'export default {}\n')
  // A folder without a manifest is not a module and must not be offered as one.
  fs.mkdirSync(path.join(modulesDir, 'not-a-module'))
})

afterAll(() => {
  fs.rmSync(modulesDir, { recursive: true, force: true })
})

describe('parseModuleList', () => {
  it('reads an unset or empty value as no modules', () => {
    expect(parseModuleList(undefined)).toEqual([])
    expect(parseModuleList('')).toEqual([])
  })

  it('trims entries and drops empty ones', () => {
    expect(parseModuleList(' alpha , ,beta,')).toEqual(['alpha', 'beta'])
  })

  it('drops duplicates, keeping the first position', () => {
    expect(parseModuleList('alpha,beta,alpha')).toEqual(['alpha', 'beta'])
  })
})

describe('netxmsModules', () => {
  function load(modules) {
    const plugin = netxmsModules({ modules, modulesDir })
    return plugin.load(plugin.resolveId(VIRTUAL_ID))
  }

  it('resolves the virtual id to a private id', () => {
    const plugin = netxmsModules({ modules: [], modulesDir })
    expect(plugin.resolveId(VIRTUAL_ID)).toBe(`\0${VIRTUAL_ID}`)
  })

  it('generates an empty list when no module is enabled', () => {
    expect(load([])).toContain('export default []')
  })

  it('imports exactly the enabled manifests', () => {
    const code = load(['alpha'])
    const file = path.join(modulesDir, 'alpha', 'index.js').split(path.sep).join('/')
    expect(code).toContain(`import m0 from ${JSON.stringify(file)}`)
    expect(code).toContain('export default [m0]')
  })

  it('leaves every other id to the rest of the pipeline', () => {
    const plugin = netxmsModules({ modules: [], modulesDir })
    expect(plugin.resolveId('vue')).toBeUndefined()
    expect(plugin.load('/some/file.js')).toBeUndefined()
  })

  it('fails on an unknown id and lists the modules that exist', () => {
    expect(() => netxmsModules({ modules: ['bogus'], modulesDir })).toThrow(
      /unknown module "bogus"\. Available: alpha$/,
    )
  })

  describe('bundle guard', () => {
    // generateBundle runs only when Vite writes a build, so this is the check every
    // `yarn build` makes, whatever import form brought a module file in.
    function generate(modules, moduleIds) {
      const plugin = netxmsModules({ modules, modulesDir })
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
    const fileIn = (...parts) => path.join(modulesDir, ...parts)

    it('fails when a file of a module the build does not enable reaches the bundle', () => {
      const view = fileIn('alpha', 'views', 'AlphaView.vue')
      expect(generate([], ['/src/main.js', `${view}?vue&type=script`])).toThrow(
        /module "alpha" .*AlphaView\.vue.* VITE_MODULES/,
      )
    })

    it('lets enabled modules, the registry and core files through', () => {
      const ids = [
        '/src/main.js',
        '\0virtual:netxms-modules',
        fileIn('index.js'),
        fileIn('parseModuleList.js'),
        fileIn('alpha', 'index.js'),
        fileIn('alpha', 'views', 'AlphaView.vue'),
      ]
      expect(generate(['alpha'], ids)).not.toThrow()
    })
  })

  it('refuses ids that are not plain lowercase folder names', () => {
    // Both ids lead to a real manifest here, so only the id check can turn them away.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'netxms-odd-modules-'))
    const dir = path.join(root, 'modules')
    try {
      for (const folder of [path.join(root, 'alpha'), path.join(dir, 'ALPHA')]) {
        fs.mkdirSync(folder, { recursive: true })
        fs.writeFileSync(path.join(folder, 'index.js'), 'export default {}\n')
      }
      expect(() => netxmsModules({ modules: ['../alpha'], modulesDir: dir })).toThrow(
        /unknown module "\.\.\/alpha"/,
      )
      expect(() => netxmsModules({ modules: ['ALPHA'], modulesDir: dir })).toThrow(
        /unknown module "ALPHA"/,
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
