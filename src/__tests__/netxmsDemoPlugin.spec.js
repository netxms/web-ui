// @vitest-environment node
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import netxmsDemo from '../../vite-plugin-netxms-demo.js'

const mocksDir = path.join(path.sep, 'repo', 'mocks')
const mockFile = path.join(mocksDir, 'v1', 'network-maps', '600.json')
const modulesDir = path.join(path.sep, 'repo', 'src', 'modules')
const moduleMockFile = path.join(modulesDir, 'alpha', 'mocks', 'v1', 'objects', '7.json')

/** @param {Record<string, number>} renderedLengths - module id -> rendered length */
function generate(enabled, renderedLengths) {
  const plugin = netxmsDemo({ enabled, mocksDir, modulesDir })
  const modules = Object.fromEntries(
    Object.entries(renderedLengths).map(([id, renderedLength]) => [id, { renderedLength }]),
  )
  const bundle = {
    'index.js': { type: 'chunk', modules },
    'index.css': { type: 'asset' },
  }
  const context = {
    error(message) {
      throw new Error(message)
    },
  }
  return () => plugin.generateBundle.call(context, {}, bundle)
}

describe('netxmsDemo plugin', () => {
  it('fails a release build that bundles a mocks file', () => {
    expect(generate(false, { '/src/main.js': 10, [`${mockFile}?import`]: 500 })).toThrow(
      /600\.json.* VITE_DEMO_CONTENT=false/,
    )
  })

  it('lets a release build through when tree-shaking emptied the mocks file', () => {
    expect(generate(false, { '/src/main.js': 10, [mockFile]: 0 })).not.toThrow()
  })

  it('lets a release build without mocks through', () => {
    const lookalike = path.join(path.sep, 'repo', 'mocks-other.js')
    expect(generate(false, { '/src/main.js': 10, [lookalike]: 10 })).not.toThrow()
  })

  it('lets a demo build bundle mocks', () => {
    expect(generate(true, { '/src/main.js': 10, [mockFile]: 500 })).not.toThrow()
  })

  it.each([true, false])('fails a build that bundles a module mock (demo %s)', (enabled) => {
    expect(generate(enabled, { '/src/main.js': 10, [`${moduleMockFile}?import`]: 500 })).toThrow(
      /Module mock .*alpha\/mocks\/v1\/objects\/7\.json/,
    )
  })

  it('lets a build through when tree-shaking emptied the module mock', () => {
    expect(generate(true, { [moduleMockFile]: 0 })).not.toThrow()
  })

  it('lets a build bundle module code outside its mocks folder', () => {
    const moduleFile = path.join(modulesDir, 'alpha', 'mocks.js')
    expect(generate(true, { [moduleFile]: 500 })).not.toThrow()
  })
})
