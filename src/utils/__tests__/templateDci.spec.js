// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'
import {
  findTemplateTableDci,
  isTemplateDci,
  resolveTemplateDcis,
  substituteCaptureGroups,
} from '../templateDci'

const CONTEXT = 42

/** Current values of the context object, in the server's order. */
const DCIS = [
  { id: 1, name: 'System.CPU.Usage', description: 'CPU usage', userTag: 'cpu', isTable: false },
  { id: 2, name: 'Net.Interface.BytesIn(1)', description: 'Inbound traffic on eth0', userTag: '' },
  { id: 3, name: 'Net.Interface.BytesIn(2)', description: 'Inbound traffic on eth1', userTag: '' },
  { id: 4, name: 'FileSystem.Volumes', description: 'Volumes', userTag: 'fs', isTable: true },
  { id: 5, name: 'System.Memory.Usage', description: 'Memory usage', userTag: 'mem' },
]

const template = (fields) => ({
  nodeId: 0,
  dciId: 0,
  name: '',
  dciName: '',
  dciDescription: '',
  dciTag: '',
  regexMatch: false,
  multiMatch: false,
  ...fields,
})

const resolve = (list, dcis = DCIS, context = CONTEXT) => resolveTemplateDcis(list, dcis, context)

describe('isTemplateDci', () => {
  it('treats node 0 and the context sentinel as templates', () => {
    expect(isTemplateDci({ nodeId: 0 })).toBe(true)
    expect(isTemplateDci({ nodeId: CONTEXT_OBJECT_ID })).toBe(true)
    expect(isTemplateDci({ nodeId: 7 })).toBe(false)
  })
})

describe('resolveTemplateDcis', () => {
  it('passes concrete entries through untouched, keeping their list position', () => {
    const concrete = { nodeId: 7, dciId: 70, name: 'Fixed' }
    const list = [concrete, template({ dciDescription: 'cpu usage' })]
    const [first, second] = resolve(list)
    expect(first).toBe(concrete)
    expect(second).toMatchObject({ nodeId: CONTEXT, dciId: 1 })
  })

  describe('plain match', () => {
    it('compares the name case-insensitively', () => {
      expect(resolve([template({ dciName: 'system.cpu.usage' })])[0].dciId).toBe(1)
    })

    it('falls back to the description, then the user tag', () => {
      expect(resolve([template({ dciDescription: 'MEMORY USAGE' })])[0].dciId).toBe(5)
      expect(resolve([template({ dciTag: 'Mem' })])[0].dciId).toBe(5)
    })

    it('ignores empty patterns instead of matching everything', () => {
      expect(resolve([template({})])).toEqual([])
    })

    it('accepts table DCIs', () => {
      expect(resolve([template({ dciTag: 'fs' })])[0].dciId).toBe(4)
    })

    it('is not a substring match', () => {
      expect(resolve([template({ dciDescription: 'CPU' })])).toEqual([])
    })
  })

  describe('regex match', () => {
    it('finds an unanchored match on the name', () => {
      const [entry] = resolve([template({ dciName: 'CPU', regexMatch: true })])
      expect(entry.dciId).toBe(1)
    })

    it('falls back to the description, then the tag', () => {
      expect(resolve([template({ dciDescription: 'eth1$', regexMatch: true })])[0].dciId).toBe(3)
      expect(resolve([template({ dciTag: '^me', regexMatch: true })])[0].dciId).toBe(5)
    })

    it('skips table DCIs', () => {
      expect(resolve([template({ dciName: 'Volumes', regexMatch: true })])).toEqual([])
    })

    it('throws on an invalid pattern, which the caller reports for the whole chart', () => {
      expect(() => resolve([template({ dciName: '([', regexMatch: true })])).toThrow(SyntaxError)
    })

    it('accepts a leading Java (?i) flag', () => {
      expect(resolve([template({ dciName: '(?i)system\\.cpu', regexMatch: true })])[0].dciId).toBe(
        1,
      )
    })
  })

  describe('multiMatch', () => {
    it('stops at the first match without it', () => {
      const out = resolve([template({ dciName: 'BytesIn', regexMatch: true })])
      expect(out.map((e) => e.dciId)).toEqual([2])
    })

    it('keeps every match with it, in the context object order', () => {
      const out = resolve([template({ dciName: 'BytesIn', regexMatch: true, multiMatch: true })])
      expect(out.map((e) => e.dciId)).toEqual([2, 3])
    })
  })

  describe('display name', () => {
    it('uses the entry name when set', () => {
      expect(resolve([template({ dciTag: 'cpu', name: 'Load' })])[0].name).toBe('Load')
    })

    it('falls back to the matched DCI description', () => {
      expect(resolve([template({ dciTag: 'cpu' })])[0].name).toBe('CPU usage')
    })

    it('substitutes capture groups in regex mode', () => {
      const [entry] = resolve([
        template({ dciName: 'BytesIn\\((\\d+)\\)', regexMatch: true, name: 'In \\1' }),
      ])
      expect(entry.name).toBe('In 1')
    })
  })

  it('drops template entries without a context object', () => {
    const concrete = { nodeId: 7, dciId: 70 }
    expect(resolveTemplateDcis([concrete, template({ dciTag: 'cpu' })], null, null)).toEqual([
      concrete,
    ])
  })
})

describe('substituteCaptureGroups', () => {
  const match = ['whole', 'one', 'two']

  it('replaces groups, and a group the match lacks with nothing', () => {
    expect(substituteCaptureGroups('\\1-\\2-\\3', match)).toBe('one-two-')
  })

  it('reads \\\\ as a backslash and keeps other escapes as written', () => {
    expect(substituteCaptureGroups('a\\\\b\\n', match)).toBe('a\\b\\n')
  })

  it('drops a trailing lone backslash', () => {
    expect(substituteCaptureGroups('end\\', match)).toBe('end')
  })
})

describe('findTemplateTableDci', () => {
  it('finds the first table DCI whose field contains the pattern', () => {
    expect(findTemplateTableDci({ dciName: 'Volumes' }, DCIS)?.id).toBe(4)
  })

  it('is case-sensitive without regexMatch, like Pattern.quote', () => {
    expect(findTemplateTableDci({ dciName: 'volumes' }, DCIS)).toBeNull()
  })

  it('ignores DCIs that are not tables', () => {
    expect(findTemplateTableDci({ dciDescription: 'CPU' }, DCIS)).toBeNull()
  })

  it('matches a regex with regexMatch', () => {
    expect(findTemplateTableDci({ dciTag: '^f', regexMatch: true }, DCIS)?.id).toBe(4)
  })

  it('returns null without a template or without patterns', () => {
    expect(findTemplateTableDci(null, DCIS)).toBeNull()
    expect(findTemplateTableDci({}, DCIS)).toBeNull()
  })
})
