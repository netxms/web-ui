import { ref, computed, watch } from 'vue'
import { userPrefs } from '@/utils/appStorage'
import { SEVERITY_ORDER, severityLabels, severityRank } from '@/utils/alarmDisplay'

/** `minSeverity` value meaning "never notify". */
export const NOTIFY_OFF = 'off'

/** Major and above. */
const DEFAULT_MIN_SEVERITY = 3

const DEFAULT_POSITION = 'top-right'

const MIN_SEVERITY_KEY = 'alarms.notify.minSeverity'
const POSITION_KEY = 'alarms.notify.position'

export const NOTIFY_POSITIONS = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
]

export const MIN_SEVERITY_OPTIONS = [
  { value: NOTIFY_OFF, label: 'Off (never show)' },
  ...SEVERITY_ORDER.map((key, rank) => ({
    value: rank,
    label: rank === 0 ? 'All severities' : `${severityLabels[key]} and above`,
  })).reverse(),
]

/** Anything unrecognized falls back to the default rather than disabling notifications. */
function readMinSeverity() {
  const stored = userPrefs.get(MIN_SEVERITY_KEY, DEFAULT_MIN_SEVERITY)
  if (stored === NOTIFY_OFF) return NOTIFY_OFF
  const rank = Number(stored)
  return Number.isInteger(rank) && rank >= 0 && rank < SEVERITY_ORDER.length
    ? rank
    : DEFAULT_MIN_SEVERITY
}

function readPosition() {
  const stored = userPrefs.get(POSITION_KEY, DEFAULT_POSITION)
  return NOTIFY_POSITIONS.some((p) => p.value === stored) ? stored : DEFAULT_POSITION
}

const minSeverity = ref(readMinSeverity())
const position = ref(readPosition())

const enabled = computed(() => minSeverity.value !== NOTIFY_OFF)

function setMinSeverity(value) {
  minSeverity.value = value === NOTIFY_OFF ? NOTIFY_OFF : Number(value)
  userPrefs.set(MIN_SEVERITY_KEY, minSeverity.value)
}

function setPosition(value) {
  if (!NOTIFY_POSITIONS.some((p) => p.value === value)) return
  position.value = value
  userPrefs.set(POSITION_KEY, value)
}

/** @param {{severity?: number|string}} alarm */
function shouldNotify(alarm) {
  if (!enabled.value) return false
  return severityRank(alarm?.severity) >= minSeverity.value
}

export function reloadAlarmNotificationPrefs() {
  minSeverity.value = readMinSeverity()
  position.value = readPosition()
}

watch(userPrefs.revision, reloadAlarmNotificationPrefs)

export function useAlarmNotifications() {
  return {
    minSeverity,
    position,
    enabled,
    setMinSeverity,
    setPosition,
    shouldNotify,
  }
}
