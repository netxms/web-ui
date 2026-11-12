// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DATA_EXPORT_TIME_PRESETS,
  buildExportRequest,
  buildSelectionRequest,
  collectTagPatterns,
  createDataExportForm,
  exportFileName,
  exportPollInterval,
  formatExportSize,
  isExportFinished,
  metricKey,
  nextExcluded,
  parsePatterns,
  previewChange,
  selectionOf,
  selectionProblem,
} from '../dataExport'

const NOW = 1_800_000_000

describe('createDataExportForm', () => {
  it('starts like the legacy view: every tag group but interfaces, one day, raw samples', () => {
    const form = createDataExportForm()
    expect(form.groups).toEqual(['eed', 'power', 'cooling', 'env', 'water', 'heat'])
    expect(form.time).toEqual({ preset: 'last1d' })
    expect(form.tier).toBe('raw')
    expect(form.anonymize).toBe(false)
    expect(form.keepMapping).toBe(false)
    expect(form.rootId).toBe(0)
  })

  it('takes a root object id, from a route string too', () => {
    expect(createDataExportForm('42').rootId).toBe(42)
    expect(createDataExportForm('nonsense').rootId).toBe(0)
  })
})

describe('time presets', () => {
  it('offers rolling windows of an hour and up, and no custom entry', () => {
    const ids = DATA_EXPORT_TIME_PRESETS.map((preset) => preset.id)
    expect(ids).not.toContain('last10m')
    expect(ids).not.toContain('custom')
    expect(ids).toContain('last1h')
    expect(ids).toContain('last1d')
    expect(ids).toContain('last1y')
  })
})

describe('tag patterns', () => {
  it('splits the extra patterns on commas and drops blanks', () => {
    expect(parsePatterns(' custom.*, ,site.power? ,')).toEqual(['custom.*', 'site.power?'])
    expect(parsePatterns('')).toEqual([])
    expect(parsePatterns(undefined)).toEqual([])
  })

  it('lists checked groups in vocabulary order, then extra patterns, without duplicates', () => {
    const form = {
      ...createDataExportForm(1),
      groups: ['power', 'iface'],
      extraPatterns: 'custom.*, power.*',
    }
    expect(collectTagPatterns(form)).toEqual(['iface.*', 'power.*', 'custom.*'])
  })
})

describe('selectionProblem', () => {
  it('wants a root object first', () => {
    expect(selectionProblem(createDataExportForm())).toMatch(/root object/)
  })

  it('wants at least one pattern', () => {
    const form = { ...createDataExportForm(5), groups: [], extraPatterns: ' , ' }
    expect(selectionProblem(form)).toMatch(/tag group or pattern/)
  })

  it('is satisfied by extra patterns alone', () => {
    const form = { ...createDataExportForm(5), groups: [], extraPatterns: 'custom.*' }
    expect(selectionProblem(form)).toBeNull()
  })
})

describe('requests', () => {
  const form = { ...createDataExportForm(7), groups: ['eed'], tier: 'hourly' }

  it('sends the window as Unix seconds ending now', () => {
    expect(buildSelectionRequest(selectionOf(form), NOW)).toEqual({
      rootObjectId: 7,
      tagPatterns: ['eed.*'],
      timeFrom: NOW - 86400,
      timeTo: NOW,
      tier: 'hourly',
    })
  })

  it('passes a custom range through', () => {
    const custom = { ...form, time: { preset: 'custom', from: 1000, to: 5000 } }
    const request = buildSelectionRequest(selectionOf(custom), NOW)
    expect(request.timeFrom).toBe(1000)
    expect(request.timeTo).toBe(5000)
  })

  it('lets the server resolve the patterns when there is no preview', () => {
    const request = buildExportRequest(form, null, NOW)
    expect(request).not.toHaveProperty('dciList')
    expect(request.format).toBe('csv')
    expect(request.tagPatterns).toEqual(['eed.*'])
  })

  it('sends the checked preview rows as an explicit list', () => {
    const dciList = [{ ownerId: 10, dciId: 3 }]
    expect(buildExportRequest(form, dciList, NOW).dciList).toEqual(dciList)
  })

  it('asks for a mapping file only with anonymization', () => {
    expect(buildExportRequest({ ...form, keepMapping: true }, null, NOW)).toMatchObject({
      anonymize: false,
      keepMapping: false,
    })
    expect(
      buildExportRequest({ ...form, anonymize: true, keepMapping: true }, null, NOW),
    ).toMatchObject({ anonymize: true, keepMapping: true })
  })
})

describe('previewChange', () => {
  const base = selectionOf({ ...createDataExportForm(7), groups: ['eed'] })

  it('keeps nothing when there is no preview', () => {
    expect(previewChange(null, base)).toBe('keep')
  })

  it('keeps the preview when nothing it depends on changed', () => {
    expect(previewChange(base, { ...base, time: { ...base.time } })).toBe('keep')
  })

  it('clears it when the root or the patterns change', () => {
    expect(previewChange(base, { ...base, rootId: 8 })).toBe('clear')
    expect(previewChange(base, { ...base, tagPatterns: ['eed.*', 'power.*'] })).toBe('clear')
  })

  it('refreshes it when only the window or tier changes', () => {
    expect(previewChange(base, { ...base, tier: 'daily' })).toBe('refresh')
    expect(previewChange(base, { ...base, time: { preset: 'last1w' } })).toBe('refresh')
  })
})

describe('nextExcluded', () => {
  it('records unchecked visible rows', () => {
    const result = nextExcluded(new Set(), ['a', 'b', 'c'], new Set(['a', 'c']))
    expect([...result]).toEqual(['b'])
  })

  it('keeps the state of rows the filter hides', () => {
    // 'x' was unchecked and is filtered out; select-all over the visible rows must not check it.
    const result = nextExcluded(new Set(['x', 'a']), ['a', 'b'], new Set(['a', 'b']))
    expect([...result]).toEqual(['x'])
  })

  it('unchecks only the visible rows on clear', () => {
    const result = nextExcluded(new Set(), ['a', 'b'], new Set())
    expect([...result].sort()).toEqual(['a', 'b'])
  })
})

describe('export task state', () => {
  it('knows the terminal states', () => {
    expect(isExportFinished({ state: 'completed' })).toBe(true)
    expect(isExportFinished({ state: 'failed' })).toBe(true)
    expect(isExportFinished({ state: 'running' })).toBe(false)
    expect(isExportFinished(undefined)).toBe(false)
  })

  it('polls every second until the export finishes', () => {
    expect(exportPollInterval(undefined, null)).toBe(1000)
    expect(exportPollInterval({ state: 'running' }, null)).toBe(1000)
    expect(exportPollInterval({ state: 'completed' }, null)).toBe(false)
  })

  it('stops for a task that is gone or not ours, but rides out other failures', () => {
    expect(exportPollInterval(undefined, { status: 404 })).toBe(false)
    expect(exportPollInterval(undefined, { status: 403 })).toBe(false)
    expect(exportPollInterval({ state: 'running' }, { status: 0 })).toBe(1000)
  })
})

describe('files', () => {
  it('names downloads by local start time, without the vendor name', () => {
    const startedAt = new Date(2026, 9, 22, 9, 5, 7)
    expect(exportFileName(startedAt, 'archive')).toBe('data-export-20261022-090507.zip')
    expect(exportFileName(startedAt, 'mapping')).toBe('data-export-20261022-090507-mapping.csv')
  })

  it('formats sizes for the result line', () => {
    expect(formatExportSize(512)).toBe('512 bytes')
    expect(formatExportSize(2048)).toBe('2.0 KB')
    expect(formatExportSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatExportSize(undefined)).toBe('0 bytes')
  })

  it('keys metrics by owner and DCI', () => {
    expect(metricKey({ ownerId: 10, dciId: 3 })).toBe('10:3')
  })
})
