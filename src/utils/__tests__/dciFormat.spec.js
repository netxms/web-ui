// @vitest-environment node
// The "desktop DataFormatterTest" cases are copied from netxms-client DataFormatterTest.java,
// which pins Locale.US; these pass 'en-US'.
import { describe, it, expect } from 'vitest'
import {
  DCI_DATA_TYPES as DT,
  DCI_MULTIPLIERS as MUL,
  formatDataValue,
  formatDciValue,
  displayDciValue,
  measurementUnit,
} from '@/utils/dciFormat'
import { formatDateTime } from '@/utils/timeFormat'

const T = '\u2009'

/** Desktop test helper: default format string, given type, unit and multiplier choice. */
function format(value, dataType, unit, useMultipliers = MUL.DEFAULT) {
  return formatDataValue(value, {
    dataType,
    unit: unit == null ? null : measurementUnit(unit),
    useMultipliers,
    locale: 'en-US',
  })
}

/** Explicit format string, en-US. */
function fmt(formatString, value, dataType = DT.INT32, unit = null, extra = {}) {
  return formatDataValue(value, {
    formatString,
    dataType,
    unit: unit == null ? null : measurementUnit(unit),
    locale: 'en-US',
    ...extra,
  })
}

describe('measurementUnit', () => {
  it('strips the (IEC) and (Metric) markers and flags binary units', () => {
    expect(measurementUnit('B (IEC)')).toEqual({ name: 'B', binary: true })
    expect(measurementUnit('bps (Metric)')).toEqual({ name: 'bps', binary: false })
    expect(measurementUnit(undefined)).toEqual({ name: '', binary: false })
  })
})

describe('formatDataValue: desktop DataFormatterTest', () => {
  it('rounds float values below one instead of showing six raw decimals', () => {
    expect(format('0.680000', DT.FLOAT, 'A')).toBe(`0.68${T}A`)
    expect(format('-0.680000', DT.FLOAT, 'A')).toBe(`-0.68${T}A`)
    expect(format('0.680000', DT.FLOAT, null)).toBe('0.68')
    expect(format('0.000000', DT.FLOAT, 'A')).toBe(`0.00${T}A`)
    expect(format('3.030000', DT.FLOAT, 'A')).toBe(`3.03${T}A`)
    expect(format('0.005000', DT.FLOAT, 'A')).toBe(`5.00${T}mA`)
    expect(format('0.005000', DT.FLOAT, null)).toBe('0.005')
    expect(format('0.000123', DT.FLOAT, null)).toBe('0.00012')
    expect(format('0.680000', DT.FLOAT, '%')).toBe(`0.68${T}%`)
  })

  it('formats floats without multipliers', () => {
    expect(format('3.030000', DT.FLOAT, 'A', MUL.NO)).toBe(`3.03${T}A`)
    expect(format('0.680000', DT.FLOAT, 'A', MUL.NO)).toBe(`0.68${T}A`)
    expect(format('0.005000', DT.FLOAT, 'A', MUL.NO)).toBe(`0.005${T}A`)
    expect(format('1234.567000', DT.FLOAT, 'A', MUL.NO)).toBe(`1,234.57${T}A`)
    expect(format('1234567', DT.INT32, 'A', MUL.NO)).toBe(`1234567${T}A`)
  })

  it('keeps two decimals on floats but does not pad scaled integers', () => {
    expect(format('1.000000', DT.FLOAT, null)).toBe('1.00')
    expect(format('2.400000', DT.FLOAT, null)).toBe('2.40')
    expect(format('2.40', DT.FLOAT, null)).toBe('2.40')
    expect(format('12.500000', DT.FLOAT, '%')).toBe(`12.50${T}%`)
    expect(format('1500', DT.FLOAT, 'A')).toBe(`1.50${T}kA`)
    expect(format('1500', DT.FLOAT, 'A', MUL.NO)).toBe(`1,500.00${T}A`)
    expect(format('1000', DT.INT32, 'A')).toBe(`1${T}kA`)
    expect(format('1500', DT.INT32, 'A')).toBe(`1.5${T}kA`)
  })

  it('scales integers', () => {
    expect(format('1234567', DT.INT32, 'A')).toBe(`1.23${T}MA`)
    expect(format('999', DT.INT32, 'A')).toBe(`999${T}A`)
    expect(format('0', DT.INT32, 'A')).toBe(`0${T}A`)
  })
})

describe('formatDataValue: NetXMS extensions', () => {
  it('reads the server traffic format %{u,m}s', () => {
    expect(fmt('%{u,m}s', '1240', DT.INT64, 'B/s')).toBe(`1.24${T}kB/s`)
  })

  it('uses binary multipliers for (IEC) units', () => {
    expect(format('1536', DT.INT64, 'B (IEC)')).toBe(`1.5${T}KiB`)
  })

  it('treats * as multipliers without units', () => {
    expect(fmt('%*s', '1500', DT.INT32, 'A')).toBe(`1.5${T}k`)
  })

  it('applies a fixed multiplier power', () => {
    expect(fmt('', '1234567', DT.INT32, 'B', { multiplierPower: 2 })).toBe(`1.23${T}MB`)
  })

  it('lets the DCI switch multipliers off even when the format asks for them', () => {
    expect(fmt('%{m,u}s', '1500', DT.INT32, 'A', { useMultipliers: MUL.NO })).toBe(`1500${T}A`)
  })

  it('formats uptime and epoch units instead of the conversion', () => {
    expect(format('93784', DT.INT32, 'Uptime')).toBe('1 day, 02:03:04')
    expect(format('59', DT.INT32, 'Uptime')).toBe('00:00:59')
    expect(format('1700000000', DT.INT64, 'Epoch time')).toBe(
      formatDateTime(1700000000, { unixSeconds: true }),
    )
  })

  it('keeps literal text and %%', () => {
    expect(fmt('Load: %s%%', '42', DT.STRING)).toBe('Load: 42%')
  })

  it('shows nothing for an empty value and drops the sign of negative zero', () => {
    expect(format('', DT.INT32, 'A')).toBe('')
    expect(format('-0.000000', DT.FLOAT, null)).toBe('0.00')
  })
})

describe('formatDataValue: printf conversions', () => {
  it('formats floats', () => {
    expect(fmt('%.1f', '3.14159', DT.FLOAT)).toBe('3.1')
    expect(fmt('%08.2f', '-3.5', DT.FLOAT)).toBe('-0003.50')
    expect(fmt('%e', '1234.5', DT.FLOAT)).toBe('1.234500e+03')
    expect(fmt('%g', '1234.5', DT.FLOAT)).toBe('1234.50')
    expect(fmt('%g', '0.00001234', DT.FLOAT)).toBe('1.23400e-05')
  })

  it('formats integers', () => {
    expect(fmt('%d', '42', DT.INT32)).toBe('42')
    expect(fmt('%d', '42.7', DT.FLOAT)).toBe('42')
    expect(fmt('%,d', '1234567', DT.INT64)).toBe('1,234,567')
    expect(fmt('%+d', '5', DT.INT32)).toBe('+5')
    expect(fmt('%(d', '-5', DT.INT32)).toBe('(5)')
    expect(fmt('%x', '255', DT.INT32)).toBe('ff')
    expect(fmt('%#X', '255', DT.INT32)).toBe('0XFF')
    expect(fmt('%x', '-1', DT.INT64)).toBe('ffffffffffffffff')
  })

  it('clamps unsigned 64-bit values above the Java long range (desktop parity)', () => {
    expect(fmt('%d', '18446744073709551615', DT.UINT64)).toBe('9223372036854775807')
  })

  it('pads and truncates strings', () => {
    expect(fmt('[%5s]', '42', DT.STRING)).toBe('[   42]')
    expect(fmt('[%-5s]', '42', DT.STRING)).toBe('[42   ]')
    expect(fmt('%.2s', 'abcdef', DT.STRING)).toBe('ab')
  })

  it('marks invalid or unsupported conversions instead of throwing', () => {
    expect(fmt('%d', '42', DT.STRING)).toBe('<INVALID FORMAT> (%d)')
    expect(fmt('%q', '1', DT.INT32)).toBe('<INVALID FORMAT> (%q)')
    expect(fmt('x%5', '1', DT.INT32)).toBe('x<INVALID FORMAT> (%5)')
    expect(fmt('%tH', '5', DT.INT32)).toBe('<INVALID FORMAT> (%tH)')
    expect(fmt('%{m', '5', DT.INT32)).toBe('<INVALID FORMAT> (%{m)')
    expect(fmt('%-d', '5', DT.INT32)).toBe('<INVALID FORMAT> (%-d)')
    expect(fmt('%d', 'abc', DT.INT32)).toBe('<INVALID FORMAT> (%d)')
  })

  it('rejects absurd widths and precisions instead of building huge strings', () => {
    expect(fmt('%999999999s', '1', DT.STRING)).toBe('<INVALID FORMAT> (%999999999s)')
    expect(fmt('%.999999999f', '1', DT.FLOAT)).toBe('<INVALID FORMAT> (%.999999999f)')
    expect(fmt('%10s|', '1', DT.STRING)).toBe('         1|')
  })

  it('uses the locale separators for defaults and conversions alike', () => {
    const de = { locale: 'de-DE' }
    expect(fmt('', '1234.567', DT.FLOAT, 'A', { ...de, useMultipliers: MUL.NO })).toBe(
      `1.234,57${T}A`,
    )
    expect(fmt('%.2f', '1234.567', DT.FLOAT, null, de)).toBe('1234,57')
    expect(fmt('%,.2f', '1234.567', DT.FLOAT, null, de)).toBe('1.234,57')
  })
})

describe('formatDciValue', () => {
  it('takes unit, multiplier power and the multiplier choice from the payload', () => {
    const base = { value: '1500', dataType: DT.INT32, unitName: 'A' }
    expect(formatDciValue(base, '', 'en-US')).toBe(`1.5${T}kA`)
    expect(formatDciValue({ ...base, flags: 0x20000 }, '', 'en-US')).toBe(`1500${T}A`)
    const fixedPower = { value: '1234567', dataType: DT.INT32, unitName: 'B', multiplier: 2 }
    expect(formatDciValue(fixedPower, '', 'en-US')).toBe(`1.23${T}MB`)
    expect(formatDciValue({ value: '2048', dataType: DT.INT64, unitName: 'B (IEC)' })).toBe(
      `2${T}KiB`,
    )
  })

  it('applies the data source format string', () => {
    expect(formatDciValue({ value: '42', dataType: DT.STRING }, 'RX %s')).toBe('RX 42')
  })
})

describe('displayDciValue', () => {
  const base = { value: '1500', dataType: DT.INT32, unitName: 'A' }

  it('formats a value that has no mapped value', () => {
    expect(displayDciValue(base, '', 'en-US')).toBe(`1.5${T}kA`)
    expect(displayDciValue({ ...base, mappedValue: null }, '', 'en-US')).toBe(`1.5${T}kA`)
  })

  it('shows the mapped value in place of the whole result, unit included', () => {
    expect(displayDciValue({ ...base, mappedValue: 'Overload' }, '', 'en-US')).toBe('Overload')
    expect(displayDciValue({ ...base, mappedValue: 'Overload' }, 'RX %s')).toBe('Overload')
  })
})
