// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DCF_ANOMALY_LLM_TUNING,
  DCF_DETECT_ANOMALIES,
  anomalyCellInfo,
  anomalyModelStatus,
  anomalyTrainingWarnings,
  anomalyTuningSummary,
  defaultAnomalyDetection,
  hardBoundsError,
  hasConfiguredAnomalyDetection,
  hasLiveAnomalyDetection,
  serializeAnomalyDetection,
} from '../dciAnomaly'
import { DCI_DATA_TYPES } from '../dciFormat'

/** As the server sends it: settings, the flags, and read-only state. */
function serverAnomaly(overrides = {}) {
  return {
    sensitivity: 3.5,
    direction: 'both',
    mode: 'auto',
    minTrainingDays: 7,
    provider: { id: 'slot' },
    detector: { id: 'cusum', k: 1, h: 5 },
    enabled: true,
    llmTuning: false,
    trainingIssues: ['sparseSamples'],
    model: { timestamp: '2026-11-26T03:00:00Z', mode: 'value', learning: false, trainingDays: 30 },
    ...overrides,
  }
}

describe('serializeAnomalyDetection', () => {
  it('sends only the editable settings', () => {
    const out = serializeAnomalyDetection({
      type: 'item',
      flags: DCF_DETECT_ANOMALIES,
      anomalyDetection: serverAnomaly({
        hardBounds: { min: 0, max: 100 },
        baselineStart: '2026-11-02T14:00:00Z',
        tuning: { sensitivity: 4 },
      }),
    })
    expect(out.anomalyDetection).toEqual({
      enabled: true,
      llmTuning: false,
      sensitivity: 3.5,
      direction: 'both',
      mode: 'auto',
      minTrainingDays: 7,
      hardBounds: { min: 0, max: 100 },
    })
  })

  // The server applies anomalyDetection after flags: a stale bit would be undone, and a stale
  // object would undo a flag change.
  it('sets both flag bits to agree with the settings, leaving other bits alone', () => {
    const other = 0x40000
    const on = serializeAnomalyDetection({
      type: 'item',
      flags: other,
      anomalyDetection: serverAnomaly({ enabled: true, llmTuning: true }),
    })
    expect(on.flags).toBe(other | DCF_DETECT_ANOMALIES | DCF_ANOMALY_LLM_TUNING)

    const off = serializeAnomalyDetection({
      type: 'item',
      flags: other | DCF_DETECT_ANOMALIES | DCF_ANOMALY_LLM_TUNING,
      anomalyDetection: serverAnomaly({ enabled: false, llmTuning: false }),
    })
    expect(off.flags).toBe(other)
  })

  it('turns AI tuning off with detection, as the server does', () => {
    const out = serializeAnomalyDetection({
      type: 'item',
      flags: DCF_DETECT_ANOMALIES | DCF_ANOMALY_LLM_TUNING,
      anomalyDetection: serverAnomaly({ enabled: false, llmTuning: true }),
    })
    expect(out.anomalyDetection.llmTuning).toBe(false)
    expect(out.flags).toBe(0)
  })

  it('removes hard bounds with null, and clears one side with an explicit null', () => {
    const cleared = serializeAnomalyDetection({
      type: 'item',
      anomalyDetection: serverAnomaly({ hardBounds: null }),
    })
    expect(cleared.anomalyDetection.hardBounds).toBeNull()

    const oneSided = serializeAnomalyDetection({
      type: 'item',
      anomalyDetection: serverAnomaly({ hardBounds: { max: 95 } }),
    })
    expect(oneSided.anomalyDetection.hardBounds).toEqual({ min: null, max: 95 })
  })

  it('leaves hard bounds out when they were never set', () => {
    const out = serializeAnomalyDetection({ type: 'item', anomalyDetection: serverAnomaly() })
    expect('hardBounds' in out.anomalyDetection).toBe(false)
  })

  it('leaves a document from a server without anomalyDetection untouched', () => {
    const data = { type: 'item', flags: DCF_DETECT_ANOMALIES | DCF_ANOMALY_LLM_TUNING, name: 'x' }
    expect(serializeAnomalyDetection(data)).toBe(data)
  })

  it('leaves partial patches without anomalyDetection untouched', () => {
    const data = { status: 'disabled' }
    expect(serializeAnomalyDetection(data)).toBe(data)
  })

  it('drops the object from a table DCI', () => {
    const out = serializeAnomalyDetection({
      type: 'table',
      flags: 0,
      anomalyDetection: defaultAnomalyDetection(),
    })
    expect(out).toEqual({ type: 'table', flags: 0 })
  })

  it('writes the defaults of a new DCI with detection off', () => {
    const out = serializeAnomalyDetection({
      type: 'item',
      flags: DCF_DETECT_ANOMALIES,
      anomalyDetection: defaultAnomalyDetection(),
    })
    expect(out.flags).toBe(0)
    expect(out.anomalyDetection).toEqual(defaultAnomalyDetection())
  })
})

describe('hardBoundsError', () => {
  it('flags only a minimum above the maximum', () => {
    expect(hardBoundsError({ min: 10, max: 5 })).not.toBe('')
    expect(hardBoundsError({ min: 5, max: 5 })).toBe('')
    expect(hardBoundsError({ min: 10 })).toBe('')
    expect(hardBoundsError(undefined)).toBe('')
  })
})

describe('anomalyTrainingWarnings', () => {
  const ids = (form, saved) => anomalyTrainingWarnings(form, saved).map((w) => w.id)

  it('says only that values are not stored when retention is none', () => {
    expect(ids({ retentionType: 'none', sampleSaveInterval: 5 }, null)).toEqual([
      'storageDisabled',
    ])
  })

  it('warns about a custom retention shorter than 37 days, as entered', () => {
    const warnings = anomalyTrainingWarnings(
      { retentionType: 'custom', retentionTime: '30', sampleSaveInterval: 1 },
      null,
    )
    expect(warnings.map((w) => w.id)).toEqual(['shortRetention'])
    expect(warnings[0].text).toContain('kept for 30 days')
    expect(ids({ retentionType: 'custom', retentionTime: '37' }, null)).toEqual([])
    // Macros cannot be judged.
    expect(ids({ retentionType: 'custom', retentionTime: '%{days}' }, null)).toEqual([])
  })

  it('takes the server default retention from the saved document, while it stays default', () => {
    const saved = {
      retentionType: 'default',
      anomalyDetection: serverAnomaly({ trainingIssues: ['shortRetention'] }),
    }
    expect(ids({ retentionType: 'default' }, saved)).toEqual(['shortRetention'])
    expect(ids({ retentionType: 'custom', retentionTime: '90' }, saved)).toEqual([])
  })

  it('warns about sparse samples from the form and read errors from the server', () => {
    const saved = {
      retentionType: 'default',
      anomalyDetection: serverAnomaly({ trainingIssues: ['dataReadError', 'sparseSamples'] }),
    }
    expect(ids({ retentionType: 'default', sampleSaveInterval: 1 }, saved)).toEqual([
      'dataReadError',
    ])
    expect(ids({ retentionType: 'default', sampleSaveInterval: 3 }, null)).toEqual([
      'sparseSamples',
    ])
  })
})

describe('anomalyModelStatus', () => {
  it('describes a model not trained yet and one still learning', () => {
    expect(anomalyModelStatus(serverAnomaly({ model: undefined }))).toBe('Not trained yet')
    expect(
      anomalyModelStatus(serverAnomaly({ model: { learning: true, trainingDays: 3 } })),
    ).toBe('Learning: 3 of 7 days collected')
  })

  it('describes a trained model and a restarted baseline', () => {
    const text = anomalyModelStatus(
      serverAnomaly({
        model: { mode: 'rate', learning: false, trainingDays: 1, individualWeekdays: true },
        baselineStart: '2026-11-02T14:00:00Z',
      }),
    )
    expect(text).toMatch(/^Trained .* on 1 day /)
    expect(text).toContain('analyzing rate of change')
    expect(text).toContain('some days of week on their own')
    expect(text).toContain('Baseline restarted')
  })
})

describe('anomalyTuningSummary', () => {
  it('lists what the AI suggested', () => {
    expect(
      anomalyTuningSummary({ sensitivity: 4.5, direction: 'up', hardBounds: { min: 0 } }),
    ).toBe('sensitivity 4.5, Up only, hard bounds at least 0')
    expect(anomalyTuningSummary(null)).toBeNull()
    expect(anomalyTuningSummary({})).toBeNull()
  })
})

describe('anomalyCellInfo', () => {
  const value = (anomaly, extra = {}) => ({
    dataType: DCI_DATA_TYPES.FLOAT,
    unitName: '%',
    multiplier: 0,
    flags: 0,
    value: '81.3',
    anomaly,
    ...extra,
  })

  it('is empty for a DCI without detection', () => {
    expect(anomalyCellInfo(value(undefined))).toMatchObject({ kind: 'off', text: '', rank: 0 })
  })

  it('says why a model cannot learn, else that it is learning', () => {
    expect(
      anomalyCellInfo(value({ learning: true, trainingIssues: ['storageDisabled'] })),
    ).toMatchObject({ kind: 'blocked', text: 'Cannot learn (collected values are not stored)' })
    expect(
      anomalyCellInfo(value({ learning: true, trainingIssues: ['dataReadError'] })).text,
    ).toBe('Cannot learn (collected values cannot be read)')
    expect(anomalyCellInfo(value({ learning: true }))).toMatchObject({
      kind: 'learning',
      text: 'Learning',
    })
  })

  it('reports a value out of hard bounds while learning', () => {
    expect(anomalyCellInfo(value({ learning: true, type: 'range' }))).toMatchObject({
      kind: 'anomaly',
      text: 'Out of expected range',
    })
  })

  it('names the anomaly with the expected range in the DCI unit', () => {
    const info = anomalyCellInfo(
      value({
        learning: false,
        type: 'range',
        mode: 'value',
        score: 5.624,
        expectedLow: 61,
        expectedHigh: 68.4,
        slot: 'Thursday 09:00-10:00',
      }),
    )
    expect(info.kind).toBe('anomaly')
    // The unit follows a thin space.
    expect(info.text).toMatch(/^Out of expected range \(expected 61\.00\s% \.\. 68\.40\s%\)$/)
    expect(info.tooltip).toBe('Compared with: Thursday 09:00-10:00\nScore: 5.62')
  })

  it('shows the expected rate of change in rate mode', () => {
    const info = anomalyCellInfo(
      value({ learning: false, type: 'none', mode: 'rate', expectedLow: 1, expectedHigh: 2 }),
    )
    expect(info.kind).toBe('normal')
    expect(info.text).toMatch(/^expected rate of change .* per second$/)
  })

  it('notes training issues that only lower accuracy in the tooltip', () => {
    const info = anomalyCellInfo(
      value({ learning: false, type: 'none', trainingIssues: ['sparseSamples'] }),
    )
    expect(info.text).toBe('')
    expect(info.tooltip).toContain('Not every collected value is stored')
  })

  it('ranks anomalies first, then cannot learn, learning and normal', () => {
    const ranks = [
      value({ learning: false, type: 'step' }),
      value({ learning: true, trainingIssues: ['storageDisabled'] }),
      value({ learning: true }),
      value({ learning: false, type: 'none' }),
      value(undefined),
    ].map((v) => anomalyCellInfo(v).rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
    expect(new Set(ranks).size).toBe(5)
  })
})

describe('row predicates', () => {
  it('tells which rows can have their profile regenerated', () => {
    expect(hasLiveAnomalyDetection({ anomaly: { learning: true } })).toBe(true)
    expect(hasLiveAnomalyDetection({ anomalyDetected: false })).toBe(false)
    expect(hasConfiguredAnomalyDetection({ type: 'item', anomalyDetection: { enabled: true } })).toBe(
      true,
    )
    expect(
      hasConfiguredAnomalyDetection({ type: 'item', anomalyDetection: { enabled: false } }),
    ).toBe(false)
    expect(hasConfiguredAnomalyDetection({ type: 'item', flags: DCF_DETECT_ANOMALIES })).toBe(false)
  })
})
