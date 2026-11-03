/**
 * Port of the desktop client's DataFormatter format-string path ("1.24 kB/s", not "1240 B/s").
 *
 * A format string follows Java `String.format` rules, with NetXMS extensions right after the
 * `%`: `{m}` / `{multipliers}` scales the value (Ki, Mi, ... for " (IEC)" units; m, u, n, ...
 * for small values), `{u}` / `{units}` appends the unit, and `*` is shorthand for `{m}`. An
 * empty format string means `%{m,u}s`, or `%{u}s` when the DCI switches multipliers off.
 *
 * Not ported: MIB enum substitution, and the `%a`, `%b`, `%c`, `%h`, `%n` and `%t...`
 * conversions, which come out as invalid formats.
 */

import { formatDateTime } from './timeFormat'

/** DCI data types as the current-values endpoint sends them (DCI_DT_*, nms_common.h). */
export const DCI_DATA_TYPES = Object.freeze({
  INT32: 0,
  UINT32: 1,
  INT64: 2,
  UINT64: 3,
  STRING: 4,
  FLOAT: 5,
  NULL: 6,
  COUNTER32: 7,
  COUNTER64: 8,
})

/** The DCI's multiplier choice, bits 16-17 of its flags (DciValue.MULTIPLIERS_*). */
export const DCI_MULTIPLIERS = Object.freeze({ DEFAULT: 0, YES: 1, NO: 2 })

const DCF_MULTIPLIERS_MASK = 0x30000

const THIN_SPACE = '\u2009'
const FORMAT_WITH_MULTIPLIERS = '%{m,u}s'
const FORMAT_WITHOUT_MULTIPLIERS = '%{u}s'

const withThinSpace = (suffix) => (suffix ? THIN_SPACE + suffix : '')

const DECIMAL_MULTIPLIERS = [1, 1e3, 1e6, 1e9, 1e12, 1e15]
const DECIMAL_MULTIPLIERS_SMALL = [1e-15, 1e-12, 1e-9, 1e-6, 1e-3, 1]
const BINARY_MULTIPLIERS = [1, 2 ** 10, 2 ** 20, 2 ** 30, 2 ** 40, 2 ** 50]
const SUFFIX = ['', 'k', 'M', 'G', 'T', 'P'].map(withThinSpace)
const BINARY_SUFFIX = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi'].map(withThinSpace)
const SUFFIX_SMALL = ['f', 'p', 'n', '\u03bc', 'm', ''].map(withThinSpace)

/** Units that are never scaled (MeasurementUnit.UNITS_WITHOUT_MULTIPLIERS). */
const UNITS_WITHOUT_MULTIPLIERS = new Set(['%', '\u00b0C', '\u00b0F', 'dBm', 'rpm', 'RPM'])

const LONG_MAX = 2n ** 63n - 1n
const LONG_MIN = -(2n ** 63n)

/**
 * " (IEC)" selects binary multipliers and, like " (Metric)", is not part of the displayed name.
 * @param {string} [name] - unit name as stored on the DCI ("B (IEC)", "bps", ...)
 * @returns {{ name: string, binary: boolean }}
 */
export function measurementUnit(name) {
  const text = name ?? ''
  return {
    name: text.replaceAll(' (IEC)', '').replaceAll(' (Metric)', ''),
    binary: text.includes(' (IEC)'),
  }
}

/**
 * Collection errors are the caller's to show; they replace the value.
 * @param {object} dciValue - DCIValue ({ value, dataType, unitName, multiplier, flags })
 * @param {string} [formatString] - empty for the default
 * @param {string} [locale] - number locale; the browser's when absent
 * @returns {string}
 */
export function formatDciValue(dciValue, formatString, locale) {
  return formatDataValue(dciValue.value, {
    formatString,
    dataType: dciValue.dataType ?? DCI_DATA_TYPES.STRING,
    // A desktop DciValue always has a unit, with an empty name when the DCI sets none.
    unit: measurementUnit(dciValue.unitName),
    multiplierPower: dciValue.multiplier ?? 0,
    useMultipliers: ((dciValue.flags ?? 0) & DCF_MULTIPLIERS_MASK) >> 16,
    locale,
  })
}

/**
 * A mapping table value (`mappedValue`, set by callers of `useDciValueMapping`) replaces the
 * whole result, unit and multiplier included.
 * @param {object} dciValue - DCIValue, optionally with `mappedValue`
 * @param {string} [formatString] - empty for the default
 * @param {string} [locale] - number locale; the browser's when absent
 * @returns {string}
 */
export function displayDciValue(dciValue, formatString, locale) {
  return dciValue.mappedValue ?? formatDciValue(dciValue, formatString, locale)
}

/**
 * @param {string} value - value as the server sends it
 * @param {object} [options]
 * @param {string} [options.formatString] - empty for the default
 * @param {number} [options.dataType] - DCI_DATA_TYPES value; STRING when absent
 * @param {{ name: string, binary: boolean } | null} [options.unit] - from measurementUnit()
 * @param {number} [options.multiplierPower] - fixed multiplier (1 = k, 2 = M, -1 = m); 0 picks one
 * @param {number} [options.useMultipliers] - DCI_MULTIPLIERS value; NO also overrides `{m}`
 * @param {string} [options.locale] - number locale; the browser's when absent
 * @returns {string}
 */
export function formatDataValue(value, options = {}) {
  if (value == null || value === '') return ''
  const {
    formatString,
    dataType = DCI_DATA_TYPES.STRING,
    unit = null,
    multiplierPower = 0,
    useMultipliers = DCI_MULTIPLIERS.DEFAULT,
    locale,
  } = options
  const numeric = dataType !== DCI_DATA_TYPES.STRING && dataType !== DCI_DATA_TYPES.NULL
  let text = String(value)
  // Negative zero (aggregated min/max buckets) is not displayed as "-0".
  if (numeric && text.startsWith('-') && parseJavaDouble(text) === 0) text = text.slice(1)
  const ctx = { text, dataType, numeric, unit, multiplierPower, locale }

  const format =
    formatString ||
    (useMultipliers === DCI_MULTIPLIERS.DEFAULT || useMultipliers === DCI_MULTIPLIERS.YES
      ? FORMAT_WITH_MULTIPLIERS
      : FORMAT_WITHOUT_MULTIPLIERS)

  let out = ''
  const n = format.length
  for (let i = 0; i < n; i++) {
    if (format[i] !== '%' || i + 1 === n) {
      out += format[i]
      continue
    }
    i++
    if (format[i] === '%') {
      out += '%'
      continue
    }

    let multipliers = false
    let units = false
    if (format[i] === '*') {
      i++
      multipliers = true
    } else if (format[i] === '{' && i + 1 !== n) {
      const end = format.indexOf('}', i)
      if (end !== -1 && end + 1 < n) {
        for (const item of format.slice(i + 1, end).split(',')) {
          const key = item.trim().toLowerCase()
          if (key === 'u' || key === 'units') units = unit != null
          else if (key === 'm' || key === 'multipliers') multipliers = true
        }
        i = end + 1
      }
    }
    // The DCI's explicit "no multipliers" overrides the format string.
    if (useMultipliers === DCI_MULTIPLIERS.NO) multipliers = false

    let j = i
    while (j < n && !isLetter(format[j])) j++
    // t / T prefix the date and time conversions.
    if (j + 1 < n && (format[j] === 't' || format[j] === 'T') && isLetter(format[j + 1])) j++
    const spec = '%' + format.slice(i, j + 1)
    out += formatConversion(ctx, spec, format[j], multipliers, units)
    i = j
  }
  return out
}

function isLetter(ch) {
  return /\p{L}/u.test(ch)
}

function invalidFormat(spec) {
  return `<INVALID FORMAT> (${spec.trim()})`
}

function formatConversion(ctx, spec, conversion, multipliers, units) {
  if (units && (ctx.unit.name === 'Uptime' || ctx.unit.name === 'Epoch time')) {
    const seconds = Math.trunc(parseJavaDouble(ctx.text) ?? Number.NaN)
    if (!Number.isFinite(seconds)) return invalidFormat(spec)
    if (ctx.unit.name === 'Uptime') return formatUptime(seconds)
    return formatDateTime(seconds, { unixSeconds: true }) ?? ''
  }
  const v = conversion ? valueForFormat(ctx, multipliers, conversion) : null
  const formatted = v ? javaFormat(spec, v.value, ctx.locale) : null
  if (formatted == null) return invalidFormat(spec)
  let out = formatted + v.suffix
  if (units) {
    if (!v.suffix && ctx.unit.name) out += THIN_SPACE
    out += ctx.unit.name
  }
  return out
}

/**
 * The argument a conversion receives (DataFormatter.getValueForFormat): a
 * string, a number (Java double) or a BigInt (Java long), plus the multiplier
 * suffix. Null where Java fails to parse the value.
 */
function valueForFormat(ctx, multipliers, conversion) {
  if (!ctx.numeric) return { value: ctx.text, suffix: '' }
  let v
  if (multipliers) {
    v = valueWithMultipliers(ctx)
  } else {
    v = { value: ctx.text, suffix: '' }
    // Floats arrive with six fixed decimals; convert them so they round correctly.
    if (ctx.dataType === DCI_DATA_TYPES.FLOAT) v.value = parseJavaDouble(ctx.text) ?? ctx.text
  }
  switch (conversion) {
    case 's':
    case 'S':
      if (typeof v.value === 'number') v.value = formatNumberInstance(v.value, ctx)
      return v
    case 'e':
    case 'E':
    case 'f':
    case 'g':
    case 'G':
      if (typeof v.value === 'string') v.value = parseJavaDouble(v.value)
      return v.value === null ? null : v
    case 'd':
    case 'o':
    case 'x':
    case 'X':
      if (typeof v.value === 'string') {
        v.value = parseJavaLong(v.value) ?? doubleToLong(parseJavaDouble(v.value))
      } else if (typeof v.value === 'number') {
        v.value = doubleToLong(v.value)
      }
      return v.value === null ? null : v
    default:
      return v
  }
}

/** DataFormatter.getValueWithMultipliers. */
function valueWithMultipliers(ctx) {
  const d = parseJavaDouble(ctx.text)
  if (d === null) return { value: ctx.text, suffix: '' }
  const { unit } = ctx
  const binary = unit != null && unit.binary
  let power = unit != null ? ctx.multiplierPower : 0
  const small =
    (d > -0.01 && d < 0.01 && d !== 0 && power <= 0 && unit != null && usesMultipliers(unit)) ||
    power < 0
  let table = small ? DECIMAL_MULTIPLIERS_SMALL : binary ? BINARY_MULTIPLIERS : DECIMAL_MULTIPLIERS

  let i = 0
  if (power !== 0) {
    if (small) power = 5 + power
    i = Math.min(power, table.length - 1)
  } else if (unit == null || usesMultipliers(unit)) {
    for (i = table.length - 1; i >= 0; i--) {
      if (d >= table[i] || d <= -table[i]) break
    }
  } else {
    table = DECIMAL_MULTIPLIERS
  }

  // Between -1 and 1 with no multiplier that applies: the value as is.
  if (i < 0) return { value: d, suffix: '' }
  const suffix = small ? SUFFIX_SMALL[i] : binary ? BINARY_SUFFIX[i] : SUFFIX[i]
  return { value: d / table[i], suffix }
}

function usesMultipliers(unit) {
  return !UNITS_WITHOUT_MULTIPLIERS.has(unit.name)
}

/** `%s` of a number: the desktop's NumberFormat.getNumberInstance() settings. */
function formatNumberInstance(d, ctx) {
  const precision = calculatePrecision(Math.abs(d))
  // Two decimals are enough above 1; smaller values keep two significant digits.
  const max = precision > 0 ? Math.min(precision + 1, 8) : 2
  // Floats always show two decimals; integers scaled by a multiplier are not padded.
  const min = ctx.dataType === DCI_DATA_TYPES.FLOAT ? 2 : 0
  return numberFormat(ctx.locale, min, max).format(d)
}

/** DataFormatter.calculatePrecision: decimal places before the first significant digit. */
function calculatePrecision(number) {
  if (number === 0 || number >= 1) return 0
  let i
  for (i = 1; i < 1000; i++) {
    if ((number *= 10) >= 1) break
  }
  return i
}

// Map labels format on every drag frame; building an Intl formatter per value is the slow part.
const numberFormats = new Map()

function numberFormat(locale, min, max) {
  const key = `${locale ?? ''}|${min}|${max}`
  let nf = numberFormats.get(key)
  if (!nf) {
    // Java DecimalFormat defaults: grouping on, half-even rounding.
    nf = new Intl.NumberFormat(locale, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: true,
      roundingMode: 'halfEven',
    })
    numberFormats.set(key, nf)
  }
  return nf
}

const localeSymbolCache = new Map()

/** Decimal and grouping separators of a locale (Java formats with the default locale). */
function localeSymbols(locale) {
  const key = locale ?? ''
  let symbols = localeSymbolCache.get(key)
  if (!symbols) {
    const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567.5)
    symbols = {
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
    }
    localeSymbolCache.set(key, symbols)
  }
  return symbols
}

const JAVA_DOUBLE = /^[+-]?(?:NaN|Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?)$/

/** Double.parseDouble without hex floats; null where Java throws. */
function parseJavaDouble(text) {
  const trimmed = String(text).trim()
  if (!JAVA_DOUBLE.test(trimmed)) return null
  return Number(trimmed.replace(/[fFdD]$/, ''))
}

/** Long.parseLong; null where Java throws (not an integer, or out of range). */
function parseJavaLong(text) {
  if (!/^[+-]?\d+$/.test(text)) return null
  const value = BigInt(text)
  return value > LONG_MAX || value < LONG_MIN ? null : value
}

/** Java's (long) cast of a double: truncates, NaN is 0, out of range clamps. */
function doubleToLong(d) {
  if (d === null) return null
  if (Number.isNaN(d)) return 0n
  if (d >= 2 ** 63) return LONG_MAX
  if (d <= -(2 ** 63)) return LONG_MIN
  return BigInt(Math.trunc(d))
}

/** DateFormatFactory.formatTimeDifference(seconds, true): "3 days, 04:05:06". */
function formatUptime(seconds) {
  const days = Math.trunc(seconds / 86400)
  let rest = seconds
  let out = ''
  if (days > 0) {
    out = `${days} ${days === 1 ? 'day' : 'days'}, `
    rest -= days * 86400
  }
  const hours = Math.trunc(rest / 3600)
  rest -= hours * 3600
  const minutes = Math.trunc(rest / 60)
  return out + [hours, minutes, rest % 60].map((v) => (v < 10 ? `0${v}` : String(v))).join(':')
}

// Java String.format, for the conversions a DCI value can reach

const SPEC_PATTERN = /^%(?:1\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z])$/

// A typo such as %999999999s would otherwise build a string too long to allocate.
const MAX_FIELD = 100

/** One conversion applied to one argument; null where Java would throw. */
function javaFormat(spec, value, locale) {
  const match = SPEC_PATTERN.exec(spec)
  if (!match) return null
  const [, flagText, widthText, precisionText, conversion] = match
  const flags = new Set(flagText)
  const width = widthText ? Number(widthText) : 0
  const precision = precisionText != null ? Number(precisionText) : -1
  if (flags.size !== flagText.length || width > MAX_FIELD || precision > MAX_FIELD) return null
  if ((flags.has('-') || flags.has('0')) && !width) return null
  if ((flags.has('-') && flags.has('0')) || (flags.has('+') && flags.has(' '))) return null

  let text
  switch (conversion) {
    case 's':
    case 'S':
      text = formatString(value, flags, precision)
      if (text != null && conversion === 'S') text = text.toUpperCase()
      break
    case 'd':
      text = formatDecimalInteger(value, flags, width, precision, locale)
      break
    case 'o':
    case 'x':
    case 'X':
      text = formatRadixInteger(value, flags, width, precision, conversion)
      break
    case 'e':
    case 'E':
    case 'f':
    case 'g':
    case 'G':
      text = formatFloat(value, flags, width, precision, conversion, locale)
      break
    default:
      return null
  }
  if (text == null) return null
  if (text.length >= width) return text
  return flags.has('-') ? text.padEnd(width) : text.padStart(width)
}

function formatString(value, flags, precision) {
  // '-' is the only flag Java accepts for a plain string.
  if ([...flags].some((flag) => flag !== '-')) return null
  const text = String(value)
  return precision >= 0 ? text.slice(0, precision) : text
}

function formatDecimalInteger(value, flags, width, precision, locale) {
  if (typeof value !== 'bigint' || precision >= 0 || flags.has('#')) return null
  const negative = value < 0n
  let digits = (negative ? -value : value).toString()
  if (flags.has(',')) digits = groupDigits(digits, localeSymbols(locale).group)
  return withSign(digits, negative, flags, width)
}

function formatRadixInteger(value, flags, width, precision, conversion) {
  if (typeof value !== 'bigint' || precision >= 0) return null
  if (['+', ' ', ',', '('].some((flag) => flags.has(flag))) return null
  const octal = conversion === 'o'
  // Negative values print as their 64-bit two's complement, as a Java long does.
  let digits = BigInt.asUintN(64, value).toString(octal ? 8 : 16)
  const prefix = flags.has('#') ? (octal ? '0' : '0x') : ''
  if (flags.has('0')) digits = digits.padStart(width - prefix.length, '0')
  const text = prefix + digits
  return conversion === 'X' ? text.toUpperCase() : text
}

function formatFloat(value, flags, width, precision, conversion, locale) {
  if (typeof value !== 'number') return null
  const general = conversion === 'g' || conversion === 'G'
  const exponential = conversion === 'e' || conversion === 'E'
  if ((exponential && flags.has(',')) || (general && flags.has('#'))) return null
  if (Number.isNaN(value)) return 'NaN'
  const negative = value < 0 || Object.is(value, -0)
  const abs = Math.abs(value)
  if (abs === Infinity) {
    // Java pads infinity with spaces, never zeros.
    const spaced = new Set(flags)
    spaced.delete('0')
    return withSign('Infinity', negative, spaced, width)
  }

  const { decimal, group } = localeSymbols(locale)
  const digits = precision < 0 ? 6 : precision
  const grouping = flags.has(',')
  let magnitude
  if (conversion === 'f') {
    magnitude = localizeFixed(toFixed(abs, digits), grouping, flags.has('#'), decimal, group)
  } else if (exponential) {
    magnitude = toScientific(abs, digits, flags.has('#'), decimal)
  } else {
    // %g: `digits` significant digits, fixed notation from 1e-4 up to 10^digits.
    const significant = digits === 0 ? 1 : digits
    const exponent = abs === 0 ? 0 : Number(abs.toExponential(significant - 1).split('e')[1])
    magnitude =
      exponent >= -4 && exponent < significant
        ? localizeFixed(toFixed(abs, significant - 1 - exponent), grouping, false, decimal, group)
        : toScientific(abs, significant - 1, false, decimal)
  }
  if (conversion === 'E' || conversion === 'G') magnitude = magnitude.toUpperCase()
  return withSign(magnitude, negative, flags, width)
}

/** Sign, parentheses and zero padding shared by the decimal conversions. */
function withSign(magnitude, negative, flags, width) {
  let lead = ''
  if (negative) lead = flags.has('(') ? '(' : '-'
  else if (flags.has('+')) lead = '+'
  else if (flags.has(' ')) lead = ' '
  const trail = negative && flags.has('(') ? ')' : ''
  const body = flags.has('0')
    ? magnitude.padStart(width - lead.length - trail.length, '0')
    : magnitude
  return lead + body + trail
}

/** Number.toFixed without its limits (exponent notation from 1e21, 100 digits at most). */
function toFixed(abs, digits) {
  const fraction = Math.min(digits, 100)
  const text =
    abs >= 1e21
      ? BigInt(abs).toString() + (fraction ? '.' + '0'.repeat(fraction) : '')
      : abs.toFixed(fraction)
  return text + '0'.repeat(digits - fraction)
}

function localizeFixed(text, grouping, forcePoint, decimal, group) {
  const [whole, fraction] = text.split('.')
  const integer = grouping ? groupDigits(whole, group) : whole
  if (fraction != null) return integer + decimal + fraction
  return forcePoint ? integer + decimal : integer
}

/** Java's %e shape: at least two exponent digits ("1.5e+03"). */
function toScientific(abs, digits, forcePoint, decimal) {
  const [mantissa, exponent] = abs.toExponential(Math.min(digits, 100)).split('e')
  const point = forcePoint && !mantissa.includes('.') ? decimal : ''
  const sign = exponent.startsWith('-') ? '-' : '+'
  const power = exponent.replace(/^[+-]/, '').padStart(2, '0')
  return `${mantissa.replace('.', decimal)}${point}e${sign}${power}`
}

function groupDigits(digits, group) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, group)
}
