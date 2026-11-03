// Period ids are the legacy `AvailabilityChartConfig` constants stored in dashboard elements;
// do not renumber. An even id is a period that runs up to now, an odd one is closed.
// Weeks start on ISO Monday (legacy depended on the JVM locale).
export const AVAILABILITY_PERIOD = Object.freeze({
  TODAY: 0,
  YESTERDAY: 1,
  THIS_WEEK: 2,
  LAST_WEEK: 3,
  THIS_MONTH: 4,
  LAST_MONTH: 5,
  THIS_YEAR: 6,
  LAST_YEAR: 7,
  CUSTOM: 8,
})

/** Options for the period select, in the legacy dialog's order. */
export const AVAILABILITY_PERIOD_OPTIONS = [
  { value: AVAILABILITY_PERIOD.TODAY, label: 'Today' },
  { value: AVAILABILITY_PERIOD.YESTERDAY, label: 'Yesterday' },
  { value: AVAILABILITY_PERIOD.THIS_WEEK, label: 'This week' },
  { value: AVAILABILITY_PERIOD.LAST_WEEK, label: 'Last week' },
  { value: AVAILABILITY_PERIOD.THIS_MONTH, label: 'This month' },
  { value: AVAILABILITY_PERIOD.LAST_MONTH, label: 'Last month' },
  { value: AVAILABILITY_PERIOD.THIS_YEAR, label: 'This year' },
  { value: AVAILABILITY_PERIOD.LAST_YEAR, label: 'Last year' },
  { value: AVAILABILITY_PERIOD.CUSTOM, label: 'Last N days' },
]

/**
 * @param {number} period
 * @returns {boolean}
 */
export function isOpenEnded(period) {
  return Number(period ?? 0) % 2 === 0
}

/**
 * @param {number} period
 * @param {number} [numberOfDays]
 * @returns {string}
 */
export function periodLabel(period, numberOfDays = 1) {
  if (Number(period) === AVAILABILITY_PERIOD.CUSTOM) {
    const days = Math.max(1, Number(numberOfDays) || 1)
    return days === 1 ? 'Last day' : `Last ${days} days`
  }
  return (
    AVAILABILITY_PERIOD_OPTIONS.find((option) => option.value === Number(period))?.label ??
    'Unknown period'
  )
}

function startOfDay(date) {
  const out = new Date(date)
  out.setHours(0, 0, 0, 0)
  return out
}

function addDays(date, days) {
  const out = new Date(date)
  out.setDate(out.getDate() + days)
  return out
}

/** Monday 00:00 of the week containing `date`. */
function startOfWeek(date) {
  const out = startOfDay(date)
  // getDay() is 0 for Sunday, so Sunday is six days into its own ISO week, not none.
  const offset = (out.getDay() + 6) % 7
  return addDays(out, -offset)
}

function startOfMonth(date, monthOffset = 0) {
  const out = new Date(date)
  out.setDate(1)
  out.setMonth(out.getMonth() + monthOffset)
  out.setHours(0, 0, 0, 0)
  return out
}

function startOfYear(date, yearOffset = 0) {
  const out = new Date(date)
  out.setMonth(0, 1)
  out.setFullYear(out.getFullYear() + yearOffset)
  out.setHours(0, 0, 0, 0)
  return out
}

/** One second before `date`, which is how the legacy periods close on a boundary. */
function justBefore(date) {
  return new Date(date.getTime() - 1000)
}

/**
 * Absolute bounds rather than server-relative offsets: calendar boundaries depend on the
 * user's timezone, which only the client knows.
 *
 * @param {number} period - one of AVAILABILITY_PERIOD
 * @param {number} [numberOfDays=1] - day count for the custom period
 * @param {Date} [now]
 * @returns {{ from: string, to: string }} ISO 8601 bounds
 */
export function availabilityRange(period, numberOfDays = 1, now = new Date()) {
  const id = Number(period ?? 0)
  const days = Math.max(1, Number(numberOfDays) || 1)

  let from
  let to = now

  switch (id) {
    case AVAILABILITY_PERIOD.YESTERDAY: {
      const midnightToday = startOfDay(now)
      from = addDays(midnightToday, -1)
      to = justBefore(midnightToday)
      break
    }
    case AVAILABILITY_PERIOD.THIS_WEEK: {
      from = startOfWeek(now)
      break
    }
    case AVAILABILITY_PERIOD.LAST_WEEK: {
      const thisWeek = startOfWeek(now)
      from = addDays(thisWeek, -7)
      to = justBefore(thisWeek)
      break
    }
    case AVAILABILITY_PERIOD.THIS_MONTH: {
      from = startOfMonth(now)
      break
    }
    case AVAILABILITY_PERIOD.LAST_MONTH: {
      const thisMonth = startOfMonth(now)
      from = startOfMonth(now, -1)
      to = justBefore(thisMonth)
      break
    }
    case AVAILABILITY_PERIOD.THIS_YEAR: {
      from = startOfYear(now)
      break
    }
    case AVAILABILITY_PERIOD.LAST_YEAR: {
      const thisYear = startOfYear(now)
      from = startOfYear(now, -1)
      to = justBefore(thisYear)
      break
    }
    case AVAILABILITY_PERIOD.CUSTOM: {
      // N days including today, as legacy does.
      from = addDays(startOfDay(now), 1 - days)
      break
    }
    default: {
      from = startOfDay(now)
      break
    }
  }

  return { from: from.toISOString(), to: to.toISOString() }
}
