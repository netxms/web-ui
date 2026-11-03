import { formatDateTimeMedium } from '@/utils/timeFormat'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * @param {string} field
 * @returns {{ type: 'any' | 'fixed' | 'step', value?: number, step?: number } | null}
 */
function parseCronField(field) {
  if (field === '*') return { type: 'any' }
  const stepMatch = field.match(/^\*\/(\d+)$/)
  if (stepMatch) return { type: 'step', step: parseInt(stepMatch[1], 10) }
  if (/^\d+$/.test(field)) return { type: 'fixed', value: parseInt(field, 10) }
  return null
}

/**
 * @param {{ recurrent: boolean, schedule?: string, scheduledExecutionTime?: string }} task
 * @returns {string}
 */
export function describeSchedule(task) {
  if (!task.recurrent) {
    if (!task.scheduledExecutionTime) return '—'
    return formatDateTimeMedium(task.scheduledExecutionTime, { fallback: '—' })
  }

  const cron = (task.schedule ?? '').trim()
  if (!cron) return '—'

  const parts = cron.split(/\s+/)
  if (parts.length !== 5) return cron

  const [minF, hourF, dayF, monthF, wdayF] = parts.map(parseCronField)

  if (!minF || !hourF || !dayF || !monthF || !wdayF) return cron

  const timeStr = (h, m) => {
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    return `${hh}:${mm}`
  }

  // Every minute: * * * * *
  if (
    minF.type === 'any' &&
    hourF.type === 'any' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    return 'Every minute'
  }

  // Every N minutes: */N * * * *
  if (
    minF.type === 'step' &&
    hourF.type === 'any' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    return minF.step === 1 ? 'Every minute' : `Every ${minF.step} minutes`
  }

  // Every hour at minute 0: 0 * * * *
  if (
    minF.type === 'fixed' &&
    minF.value === 0 &&
    hourF.type === 'any' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    return 'Every hour'
  }

  // Every N hours: 0 */N * * *
  if (
    minF.type === 'fixed' &&
    minF.value === 0 &&
    hourF.type === 'step' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    return hourF.step === 1 ? 'Every hour' : `Every ${hourF.step} hours`
  }

  // Every day at fixed time: M H * * *
  if (
    minF.type === 'fixed' &&
    hourF.type === 'fixed' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    return `Every day at ${timeStr(hourF.value, minF.value)}`
  }

  // Every specific weekday: M H * * W
  if (
    minF.type === 'fixed' &&
    hourF.type === 'fixed' &&
    dayF.type === 'any' &&
    monthF.type === 'any' &&
    wdayF.type === 'fixed'
  ) {
    const day = WEEKDAY_NAMES[wdayF.value] ?? `weekday ${wdayF.value}`
    return `Every ${day} at ${timeStr(hourF.value, minF.value)}`
  }

  // Every Nth day of month: M H D * *
  if (
    minF.type === 'fixed' &&
    hourF.type === 'fixed' &&
    dayF.type === 'fixed' &&
    monthF.type === 'any' &&
    wdayF.type === 'any'
  ) {
    const d = dayF.value
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
    return `On the ${d}${suffix} of every month at ${timeStr(hourF.value, minF.value)}`
  }

  return cron
}

/**
 * @param {{ running: boolean, completed: boolean, disabled: boolean }} task
 * @returns {{ label: string, severity: string, icon: string }}
 */
export function taskExecutionStatus(task) {
  if (task.running) return { label: 'Running', severity: 'info', icon: 'pi pi-spin pi-spinner' }
  if (task.completed) return { label: 'Completed', severity: 'success', icon: 'pi pi-check-circle' }
  return { label: 'Pending', severity: 'secondary', icon: 'pi pi-clock' }
}
