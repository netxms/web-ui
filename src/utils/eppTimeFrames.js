// Time frames of an event processing rule. The server sends `{ time, date }` integers:
// time: (startHH * 100 + startMM) * 10000 + (endHH * 100 + endMM)
// date: bits 1-31 = day of month, bit 0 = last day, bits 31-37 = DOW (Sun=31),
//       bits 39-50 = months (Jan=39)
// Decoded, startTime/endTime are minutes from midnight; "any time" is 0-1439. A 0 dayOfWeek or
// month means "no restriction" and is encoded as all bits set.

export const DOW_OPTIONS = [
  { label: 'Mon', bit: 2 },
  { label: 'Tue', bit: 4 },
  { label: 'Wed', bit: 8 },
  { label: 'Thu', bit: 16 },
  { label: 'Fri', bit: 32 },
  { label: 'Sat', bit: 64 },
  { label: 'Sun', bit: 1 },
]

export const MONTH_OPTIONS = [
  { label: 'Jan', bit: 1 },
  { label: 'Feb', bit: 2 },
  { label: 'Mar', bit: 4 },
  { label: 'Apr', bit: 8 },
  { label: 'May', bit: 16 },
  { label: 'Jun', bit: 32 },
  { label: 'Jul', bit: 64 },
  { label: 'Aug', bit: 128 },
  { label: 'Sep', bit: 256 },
  { label: 'Oct', bit: 512 },
  { label: 'Nov', bit: 1024 },
  { label: 'Dec', bit: 2048 },
]

const MONTH_NAMES_SHORT = MONTH_OPTIONS.map((m) => m.label)
const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Sun, Mon, Tue, Wed, Thu, Fri, Sat
const DOW_BITS = [1, 2, 4, 8, 16, 32, 64]

export function isAnyTime(frame) {
  return frame.startTime === 0 && frame.endTime === 1439
}

/** @returns {Set<number|'L'>} */
export function parseDayOfMonth(str) {
  const days = new Set()
  if (!str?.trim()) return days
  for (const part of str.split(',')) {
    const t = part.trim()
    if (t.toUpperCase() === 'L') {
      days.add('L')
      continue
    }
    if (t.includes('-')) {
      const [a, b] = t.split('-').map(Number)
      if (!isNaN(a) && !isNaN(b)) for (let d = a; d <= Math.min(b, 31); d++) days.add(d)
    } else {
      const n = parseInt(t, 10)
      if (!isNaN(n) && n >= 1 && n <= 31) days.add(n)
    }
  }
  return days
}

export function formatDayOfMonthSet(days) {
  const nums = [...days].filter((d) => d !== 'L').sort((a, b) => a - b)
  const parts = []
  let i = 0
  while (i < nums.length) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    if (j - i >= 2) {
      parts.push(`${nums[i]}-${nums[j]}`)
      i = j + 1
    } else {
      parts.push(String(nums[i]))
      i++
    }
  }
  if (days.has('L')) parts.push('L')
  return parts.join(', ')
}

export function encodeTimeFrame({ startTime, endTime, dayOfWeek, dayOfMonth, month }) {
  const sh = Math.floor(startTime / 60),
    sm = startTime % 60
  const eh = Math.floor(endTime / 60),
    em = endTime % 60
  const time = (sh * 100 + sm) * 10000 + (eh * 100 + em)

  let date = 0

  const days = parseDayOfMonth(dayOfMonth)
  if (days.size === 0) {
    for (let d = 0; d <= 31; d++) date = setBit(date, d)
  } else {
    for (const d of days) date = setBit(date, d === 'L' ? 0 : d)
  }

  // The server keeps day 31 and Sunday both in bit 31.
  const effectiveDow = dayOfWeek === 0 ? 127 : dayOfWeek
  for (let i = 0; i < 7; i++) {
    if (effectiveDow & DOW_BITS[i]) date = setBit(date, 31 + i)
  }

  const effectiveMonth = month === 0 ? 4095 : month
  for (let i = 0; i < 12; i++) {
    if (effectiveMonth & (1 << i)) date = setBit(date, 39 + i)
  }

  return { time, date }
}

// The mask runs past 2^32, beyond JavaScript's bitwise operators.
export function hasBit(n, pos) {
  return Math.floor(n / Math.pow(2, pos)) % 2 >= 1
}

function setBit(n, pos) {
  return hasBit(n, pos) ? n : n + Math.pow(2, pos)
}

export function decodeTimeFrame({ time, date }) {
  const startBCD = Math.floor((time ?? 0) / 10000)
  const endBCD = (time ?? 0) % 10000
  const startTime = Math.floor(startBCD / 100) * 60 + (startBCD % 100)
  const endTime = Math.floor(endBCD / 100) * 60 + (endBCD % 100)

  const domDays = new Set()
  if (hasBit(date, 0)) domDays.add('L')
  for (let d = 1; d <= 31; d++) {
    if (hasBit(date, d)) domDays.add(d)
  }
  const dayOfMonth = formatDayOfMonthSet(domDays)

  let dayOfWeek = 0
  for (let i = 0; i < 7; i++) {
    if (hasBit(date, 31 + i)) dayOfWeek |= DOW_BITS[i]
  }

  let month = 0
  for (let i = 0; i < 12; i++) {
    if (hasBit(date, 39 + i)) month |= 1 << i
  }

  return { startTime, endTime, dayOfMonth, dayOfWeek, month }
}

function ordinal(n) {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function formatDomLabel(str) {
  if (!str?.trim()) return null
  const days = parseDayOfMonth(str)
  // Every day plus the last is what "no restriction" decodes to.
  if (!days.size || (days.size === 32 && days.has('L'))) return null
  const nums = [...days].filter((d) => d !== 'L').sort((a, b) => a - b)
  const hasL = days.has('L')
  const parts = []
  let i = 0
  while (i < nums.length) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    if (j - i >= 2) {
      parts.push(`${ordinal(nums[i])}–${ordinal(nums[j])}`)
      i = j + 1
    } else {
      parts.push(ordinal(nums[i]))
      i++
    }
  }
  if (hasL) parts.push('last day')
  return parts.join(', ')
}

function formatMonthsLabel(mask) {
  if (!mask || mask === 4095) return null
  const indices = []
  for (let i = 0; i < 12; i++) {
    if (mask & (1 << i)) indices.push(i)
  }
  if (indices.length === 1) return MONTH_NAMES_FULL[indices[0]]
  const parts = []
  let i = 0
  while (i < indices.length) {
    let j = i
    while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1) j++
    if (j - i >= 2) {
      parts.push(`${MONTH_NAMES_SHORT[indices[i]]}–${MONTH_NAMES_SHORT[indices[j]]}`)
      i = j + 1
    } else {
      parts.push(MONTH_NAMES_SHORT[indices[i]])
      i++
    }
  }
  return parts.join(', ')
}

function formatDowLabel(mask) {
  if (!mask || mask === 127) return null
  if (mask === 62) return 'weekdays'
  if (mask === 65) return 'weekends'
  return DOW_OPTIONS.filter((d) => mask & d.bit)
    .map((d) => d.label)
    .join(', ')
}

function formatTimeLabel(frame) {
  if (isAnyTime(frame)) return null
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${fmt(frame.startTime)}–${fmt(frame.endTime)}`
}

/** A decoded frame in words, e.g. "08:00–17:00, weekdays only". */
export function frameLabel(frame) {
  const time = formatTimeLabel(frame)
  const dow = formatDowLabel(frame.dayOfWeek)
  const dom = formatDomLabel(frame.dayOfMonth)
  const months = formatMonthsLabel(frame.month)

  let main = time ?? ''

  if (dom && months) {
    const datePart = `${dom} of ${months}`
    main = main ? `${main}, ${datePart}` : datePart
  } else if (dom) {
    const domPart = `${dom} of each month`
    main = main ? `${main}, ${domPart}` : domPart
  } else if (months) {
    main = main ? `${main} in ${months}` : `in ${months}`
  }

  if (dow) {
    main = main ? `${main}, ${dow} only` : dow
  }

  if (!main) return 'Always'
  return main.charAt(0).toUpperCase() + main.slice(1)
}
