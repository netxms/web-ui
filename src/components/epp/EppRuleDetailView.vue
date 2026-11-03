<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import EventPickerDialog from '@/components/epp/EventPickerDialog.vue'
import EventSelectField from '@/components/epp/EventSelectField.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { useServerActions } from '@/queries/useServerActionQueries'
import { useAlarmCategories } from '@/queries/useAlarmCategoryQueries'
import { useScriptLibrary } from '@/queries/useScriptQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import FormField from '@/components/common/FormField.vue'
import EppRuleChainCalls from '@/components/epp/EppRuleChainCalls.vue'
import { chainLabel } from '@/utils/eppChains'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'

const props = defineProps({
  rule: {
    type: Object,
    default: null,
  },
  chains: {
    type: Array,
    default: () => [],
  },
  chainId: {
    type: Number,
    default: 0,
  },
  /** `chain id → called chain ids`, for warning about a call that closes a loop. */
  callGraph: {
    type: Map,
    default: () => new Map(),
  },
  /** Read but not edit: the rule is shown in full with every control inert. */
  readonly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'saved'])

// nxcldefs.h
const RF_STOP_PROCESSING = 0x000001
const RF_NEGATED_SOURCE = 0x000002
const RF_NEGATED_EVENTS = 0x000004
const RF_GENERATE_ALARM = 0x000008
const RF_DISABLED = 0x000010
const RF_TERMINATE_BY_REGEXP = 0x000020
const RF_SEVERITY_INFO = 0x000100
const RF_SEVERITY_WARNING = 0x000200
const RF_SEVERITY_MINOR = 0x000400
const RF_SEVERITY_MAJOR = 0x000800
const RF_SEVERITY_CRITICAL = 0x001000
const RF_ALL_SEVERITIES =
  RF_SEVERITY_INFO |
  RF_SEVERITY_WARNING |
  RF_SEVERITY_MINOR |
  RF_SEVERITY_MAJOR |
  RF_SEVERITY_CRITICAL
const RF_CREATE_HELPDESK_TICKET = 0x002000
const RF_ACCEPT_CORRELATED_EVENTS = 0x004000
const RF_NEGATED_TIME_FRAMES = 0x008000
const RF_START_DOWNTIME = 0x010000
const RF_END_DOWNTIME = 0x020000
const RF_ADD_AI_COMMENT = 0x040000
const RF_CREATE_INCIDENT = 0x080000
const RF_AI_ANALYZE_INCIDENT = 0x100000
const RF_AI_AUTO_ASSIGN = 0x200000

const SEVERITY_FROM_EVENT = 5
const SEVERITY_TERMINATE = 6
const SEVERITY_RESOLVE = 7

const ALARM_ACTION_OPTIONS = [
  { label: 'Do not change alarms', value: 'no-action' },
  { label: 'Create new alarm', value: 'generate' },
  { label: 'Resolve alarms', value: 'resolve' },
  { label: 'Terminate alarms', value: 'terminate' },
]

const ALARM_SEVERITY_OPTIONS = [
  { label: 'Normal', value: 0 },
  { label: 'Warning', value: 1 },
  { label: 'Minor', value: 2 },
  { label: 'Major', value: 3 },
  { label: 'Critical', value: 4 },
  { label: 'Same as event', value: SEVERITY_FROM_EVENT },
]

const AI_DEPTH_OPTIONS = [
  { label: 'Quick', value: 0 },
  { label: 'Standard', value: 1 },
  { label: 'Thorough', value: 2 },
]

const DOWNTIME_OPTIONS = [
  { label: 'Do nothing', value: 'none' },
  { label: 'Start downtime', value: 'start' },
  { label: 'End downtime', value: 'end' },
]

const severityFlags = [
  { label: 'Normal', flag: RF_SEVERITY_INFO },
  { label: 'Warning', flag: RF_SEVERITY_WARNING },
  { label: 'Minor', flag: RF_SEVERITY_MINOR },
  { label: 'Major', flag: RF_SEVERITY_MAJOR },
  { label: 'Critical', flag: RF_SEVERITY_CRITICAL },
]

const DOW_OPTIONS = [
  { label: 'Mon', bit: 2 },
  { label: 'Tue', bit: 4 },
  { label: 'Wed', bit: 8 },
  { label: 'Thu', bit: 16 },
  { label: 'Fri', bit: 32 },
  { label: 'Sat', bit: 64 },
  { label: 'Sun', bit: 1 },
]

const MONTH_OPTIONS = [
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

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
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

const isNew = computed(() => props.rule === null)

function objToKvArray(obj) {
  return Object.entries(obj ?? {}).map(([key, value]) => ({ key, value }))
}

function newTimeFrame() {
  return {
    _key: Math.random(),
    startTime: 0,
    endTime: 1439,
    dayOfWeek: 0,
    dayOfMonth: '',
    month: 0,
  }
}

const expandedFrameKeys = ref([])

function isFrameExpanded(key) {
  return expandedFrameKeys.value.includes(key)
}

function expandFrame(key) {
  if (!expandedFrameKeys.value.includes(key))
    expandedFrameKeys.value = [...expandedFrameKeys.value, key]
}

function collapseFrame(key) {
  expandedFrameKeys.value = expandedFrameKeys.value.filter((k) => k !== key)
}

function addTimeFrame() {
  const frame = newTimeFrame()
  form.value.timeFrames.push(frame)
  expandFrame(frame._key)
}

function removeTimeFrame(i) {
  collapseFrame(form.value.timeFrames[i]._key)
  form.value.timeFrames.splice(i, 1)
}

function isAnyTime(frame) {
  return frame.startTime === 0 && frame.endTime === 1439
}

function setAnyTime(i, val) {
  if (val) {
    form.value.timeFrames[i].startTime = 0
    form.value.timeFrames[i].endTime = 1439
  } else {
    form.value.timeFrames[i].startTime = 480
    form.value.timeFrames[i].endTime = 1020
  }
}

function toggleDow(i, bit) {
  form.value.timeFrames[i].dayOfWeek ^= bit
}

function setAllDow(i) {
  form.value.timeFrames[i].dayOfWeek = 127
}

function clearAllDow(i) {
  form.value.timeFrames[i].dayOfWeek = 0
}

function toggleMonth(i, bit) {
  form.value.timeFrames[i].month ^= bit
}

function setAllMonths(i) {
  form.value.timeFrames[i].month = 4095
}

function clearAllMonths(i) {
  form.value.timeFrames[i].month = 0
}

function parseDayOfMonth(str) {
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

function formatDayOfMonthSet(days) {
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

function isDayOfMonthActive(str, day) {
  return parseDayOfMonth(str).has(day)
}

const isDragging = ref(false)
const dragIntent = ref(null)
const dragFrameIndex = ref(null)

function startDomDrag(fi, day) {
  isDragging.value = true
  dragFrameIndex.value = fi
  dragIntent.value = isDayOfMonthActive(form.value.timeFrames[fi].dayOfMonth, day)
    ? 'remove'
    : 'add'
  applyDomDrag(fi, day)
}

function applyDomDrag(fi, day) {
  if (!isDragging.value || fi !== dragFrameIndex.value) return
  const frame = form.value.timeFrames[fi]
  const days = parseDayOfMonth(frame.dayOfMonth)
  if (dragIntent.value === 'add') days.add(day)
  else days.delete(day)
  frame.dayOfMonth = formatDayOfMonthSet(days)
}

function stopDomDrag() {
  isDragging.value = false
  dragIntent.value = null
  dragFrameIndex.value = null
}

// Keyboard equivalent of one chip: the mouse path is a drag-paint whose mousedown carries
// `.prevent`. No focus equivalent of the paint, so tabbing across cannot rewrite the selection.
function toggleDayOfMonth(fi, day) {
  const frame = form.value.timeFrames[fi]
  const days = parseDayOfMonth(frame.dayOfMonth)
  if (days.has(day)) days.delete(day)
  else days.add(day)
  frame.dayOfMonth = formatDayOfMonthSet(days)
}

onMounted(() => document.addEventListener('mouseup', stopDomDrag))
onUnmounted(() => document.removeEventListener('mouseup', stopDomDrag))

// Server time frames are {time, date} integers:
// time: (startHH * 100 + startMM) * 10000 + (endHH * 100 + endMM)
// date: bits 1-31 = day of month, bit 0 = last day, bits 31-37 = DOW (Sun=31),
//       bits 39-50 = months (Jan=39)
// Internally startTime/endTime are minutes from midnight; "any time" is 0-1439. A 0 dayOfWeek or
// month means "no restriction" and is encoded as all bits set.

function encodeTimeFrame({ startTime, endTime, dayOfWeek, dayOfMonth, month }) {
  const sh = Math.floor(startTime / 60),
    sm = startTime % 60
  const eh = Math.floor(endTime / 60),
    em = endTime % 60
  const time = (sh * 100 + sm) * 10000 + (eh * 100 + em)

  let date = 0

  // Day of month: bit d for day d (1-31), bit 0 for last day
  const days = parseDayOfMonth(dayOfMonth)
  if (days.size === 0) {
    for (let d = 0; d <= 31; d++) date += Math.pow(2, d)
  } else {
    for (const d of days) {
      if (d === 'L') date += 1
      else date += Math.pow(2, d)
    }
  }

  // Day of week: our bits Sun=1,Mon=2,Tue=4,Wed=8,Thu=16,Fri=32,Sat=64 → server bits 31-37
  const ourDowBits = [1, 2, 4, 8, 16, 32, 64] // Sun, Mon, Tue, Wed, Thu, Fri, Sat
  const effectiveDow = dayOfWeek === 0 ? 127 : dayOfWeek
  for (let i = 0; i < 7; i++) {
    if (effectiveDow & ourDowBits[i]) date += Math.pow(2, 31 + i)
  }

  // Month: our bits Jan=1<<0 … Dec=1<<11 → server bits 39-50
  const effectiveMonth = month === 0 ? 4095 : month
  for (let i = 0; i < 12; i++) {
    if (effectiveMonth & (1 << i)) date += Math.pow(2, 39 + i)
  }

  return { time, date }
}

function hasBit(n, pos) {
  return Math.floor(n / Math.pow(2, pos)) % 2 >= 1
}

function decodeTimeFrame({ time, date }) {
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

  const ourDowBits = [1, 2, 4, 8, 16, 32, 64] // Sun, Mon, Tue, Wed, Thu, Fri, Sat
  let dayOfWeek = 0
  for (let i = 0; i < 7; i++) {
    if (hasBit(date, 31 + i)) dayOfWeek |= ourDowBits[i]
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
  if (!days.size) return null
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

function frameLabel(frame) {
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

function adjustTime(fi, field, unit, delta) {
  const frame = form.value.timeFrames[fi]
  const key = field === 'start' ? 'startTime' : 'endTime'
  let h = Math.floor(frame[key] / 60)
  let m = frame[key] % 60
  if (unit === 'h') h = (((h + delta) % 24) + 24) % 24
  else m = (((m + delta) % 60) + 60) % 60
  frame[key] = h * 60 + m
}

function setTimePart(fi, field, unit, val) {
  const frame = form.value.timeFrames[fi]
  const key = field === 'start' ? 'startTime' : 'endTime'
  const n = parseInt(val, 10)
  if (isNaN(n)) return
  if (unit === 'h') frame[key] = Math.max(0, Math.min(23, n)) * 60 + (frame[key] % 60)
  else frame[key] = Math.floor(frame[key] / 60) * 60 + Math.max(0, Math.min(59, n))
}

function buildForm(rule) {
  if (!rule) {
    return {
      flags: RF_ALL_SEVERITIES | RF_GENERATE_ALARM,
      sources: [],
      sourceExclusions: [],
      events: [],
      timeFrames: [],
      actions: [],
      timerCancellations: [],
      chainCalls: [],
      comments: '',
      downtimeTag: '',
      filterScript: '',
      actionScript: '',
      alarmSeverity: SEVERITY_FROM_EVENT,
      alarmMessage: '%m',
      alarmKey: '%i-%2',
      alarmTimeout: 0,
      alarmTimeoutEvent: 0,
      alarmCategories: [],
      pstorageSetActions: [],
      pstorageDeleteActions: [],
      customAttributeSetActions: [],
      customAttributeDeleteActions: [],
      rootCauseAnalysisScript: null,
      aiAgentInstructions: '',
      incidentDelay: 0,
      incidentTitle: '',
      incidentDescription: '',
      incidentAIAnalysisDepth: 1,
      incidentAIPrompt: '',
    }
  }
  return {
    ...rule,
    actions: (rule.actions ?? []).map((a) => ({ ...a })),
    timeFrames: (rule.timeFrames ?? []).map((f) => ({
      _key: Math.random(),
      ...decodeTimeFrame(f),
    })),
    timerCancellations: [...(rule.timerCancellations ?? [])],
    chainCalls: [...(rule.chainCalls ?? [])],
    alarmCategories: [...(rule.alarmCategories ?? [])],
    pstorageSetActions: objToKvArray(rule.pstorageSetActions),
    pstorageDeleteActions: [...(rule.pstorageDeleteActions ?? [])],
    customAttributeSetActions: objToKvArray(rule.customAttributeSetActions),
    customAttributeDeleteActions: [...(rule.customAttributeDeleteActions ?? [])],
    rootCauseAnalysisScript: rule.rootCauseAnalysisScript ?? null,
    incidentDelay: rule.incidentDelay ?? 0,
    incidentTitle: rule.incidentTitle ?? '',
    incidentDescription: rule.incidentDescription ?? '',
    incidentAIAnalysisDepth: rule.incidentAIAnalysisDepth ?? 1,
    incidentAIPrompt: rule.incidentAIPrompt ?? '',
  }
}

const form = ref(buildForm(props.rule))
const formSnapshot = ref(JSON.stringify(buildForm(props.rule)))

const isDirty = computed(() => isNew.value || JSON.stringify(form.value) !== formSnapshot.value)

function makeFlag(flag) {
  return computed({
    get: () => !!(form.value.flags & flag),
    set: (v) => {
      form.value.flags = v ? form.value.flags | flag : form.value.flags & ~flag
    },
  })
}

const isDisabled = makeFlag(RF_DISABLED)
const stopProcessing = makeFlag(RF_STOP_PROCESSING)
const acceptCorrelatedEvents = makeFlag(RF_ACCEPT_CORRELATED_EVENTS)
const negatedEvents = makeFlag(RF_NEGATED_EVENTS)
const negatedSources = makeFlag(RF_NEGATED_SOURCE)
const createHelpdeskTicket = makeFlag(RF_CREATE_HELPDESK_TICKET)
const addAiComment = makeFlag(RF_ADD_AI_COMMENT)
const terminateByRegexp = makeFlag(RF_TERMINATE_BY_REGEXP)
const negatedTimeFrames = makeFlag(RF_NEGATED_TIME_FRAMES)
const createIncident = makeFlag(RF_CREATE_INCIDENT)
const aiAnalyzeIncident = makeFlag(RF_AI_ANALYZE_INCIDENT)
const aiAutoAssign = makeFlag(RF_AI_AUTO_ASSIGN)

// AI settings are offered only on a server running the AI assistant: AI agent instructions
// crash an unfixed netxmsd without it. A setting the rule already uses stays visible (with a
// note) so it can be removed; visibility follows the rule as loaded, not the live form.
const { has: hasServerComponent, isLoading: isServerInfoLoading } = useServerComponents()
const aiAvailable = computed(() => hasServerComponent(SERVER_COMPONENTS.AI_ASSISTANT))
// The note waits for server-info, so a server that has the assistant never flashes it.
const showAiUnavailableNote = computed(() => !isServerInfoLoading.value && !aiAvailable.value)
const showAiComment = computed(() => aiAvailable.value || !!(props.rule?.flags & RF_ADD_AI_COMMENT))
const showAiIncidentAnalysis = computed(
  () => aiAvailable.value || !!(props.rule?.flags & RF_AI_ANALYZE_INCIDENT),
)
const showAiAgentInstructions = computed(
  () => aiAvailable.value || !!props.rule?.aiAgentInstructions,
)

const alarmActionType = computed({
  get: () => {
    if (!(form.value.flags & RF_GENERATE_ALARM)) return 'no-action'
    if (form.value.alarmSeverity === SEVERITY_TERMINATE) return 'terminate'
    if (form.value.alarmSeverity === SEVERITY_RESOLVE) return 'resolve'
    return 'generate'
  },
  set: (v) => {
    if (v === 'no-action') {
      form.value.flags &= ~RF_GENERATE_ALARM
    } else {
      form.value.flags |= RF_GENERATE_ALARM
      if (v === 'terminate') form.value.alarmSeverity = SEVERITY_TERMINATE
      else if (v === 'resolve') form.value.alarmSeverity = SEVERITY_RESOLVE
      else if (form.value.alarmSeverity >= SEVERITY_TERMINATE)
        form.value.alarmSeverity = SEVERITY_FROM_EVENT
    }
  },
})

const alarmGenerateSeverity = computed({
  get: () =>
    form.value.alarmSeverity <= SEVERITY_FROM_EVENT
      ? form.value.alarmSeverity
      : SEVERITY_FROM_EVENT,
  set: (v) => {
    form.value.alarmSeverity = v
  },
})

const downtimeControl = computed({
  get: () => {
    if (form.value.flags & RF_START_DOWNTIME) return 'start'
    if (form.value.flags & RF_END_DOWNTIME) return 'end'
    return 'none'
  },
  set: (v) => {
    form.value.flags &= ~(RF_START_DOWNTIME | RF_END_DOWNTIME)
    if (v === 'start') form.value.flags |= RF_START_DOWNTIME
    else if (v === 'end') form.value.flags |= RF_END_DOWNTIME
  },
})

function isSeverityChecked(flag) {
  return !!(form.value.flags & flag)
}

function toggleSeverity(flag) {
  form.value.flags ^= flag
}

const { data: eventTemplatesData } = useEventTemplates()
const eventTemplateMap = computed(() => {
  const map = {}
  for (const t of eventTemplatesData.value ?? []) map[t.code] = t
  return map
})

const showEventPicker = ref(false)

function removeEvent(code) {
  form.value.events = form.value.events.filter((c) => c !== code)
}

const { data: alarmCategoriesData } = useAlarmCategories()
const alarmCategoryMap = computed(() => {
  const map = {}
  for (const c of alarmCategoriesData.value ?? []) map[c.id] = c
  return map
})
// Picking adds at once, so options already on the rule are left out.
const alarmCategoryOptions = computed(() =>
  (alarmCategoriesData.value ?? [])
    .filter((c) => !form.value.alarmCategories.includes(c.id))
    .map((c) => ({ label: c.name, value: c.id })),
)

const selectedCategoryToAdd = ref(null)

// The reset waits a tick: PrimeVue's Select only re-reads the prop when it changes between
// renders.
async function addAlarmCategory({ value }) {
  if (value == null) return
  form.value.alarmCategories = [...form.value.alarmCategories, value]
  await nextTick()
  selectedCategoryToAdd.value = null
}

function removeAlarmCategory(id) {
  form.value.alarmCategories = form.value.alarmCategories.filter((c) => c !== id)
}

const { data: scriptLibraryData } = useScriptLibrary()
const scriptOptions = computed(() => [
  { label: '(none)', value: null },
  ...(scriptLibraryData.value ?? []).map((s) => ({ label: s.name, value: s.id })),
])

const sourcePickerVisible = ref(false)
const exclusionPickerVisible = ref(false)

const allSourceIds = computed(() => [
  ...(form.value.sources ?? []),
  ...(form.value.sourceExclusions ?? []),
])
const { objectsById } = useObjectsByIds(allSourceIds)

function onSourcePicked(node) {
  if (!form.value.sources.includes(node.id)) {
    form.value.sources = [...form.value.sources, node.id]
  }
}

function onExclusionPicked(node) {
  if (!form.value.sourceExclusions.includes(node.id)) {
    form.value.sourceExclusions = [...form.value.sourceExclusions, node.id]
  }
}

function removeSource(id) {
  form.value.sources = form.value.sources.filter((s) => s !== id)
}

function removeExclusion(id) {
  form.value.sourceExclusions = form.value.sourceExclusions.filter((s) => s !== id)
}

function sourceName(id) {
  return objectsById.value.get(id)?.name ?? `Object #${id}`
}

function exclusionName(id) {
  return objectsById.value.get(id)?.name ?? `Object #${id}`
}

const { data: serverActionsData } = useServerActions()
const serverActionsMap = computed(() => {
  const map = {}
  for (const a of serverActionsData.value ?? []) map[a.id] = a
  return map
})
const serverActionOptions = computed(() =>
  (serverActionsData.value ?? []).map((a) => ({ label: a.name, value: a.id })),
)

const selectedActionToAdd = ref(null)
const expandedActionRows = ref(new Set())

function addServerAction() {
  if (selectedActionToAdd.value == null) return
  form.value.actions = [
    ...form.value.actions,
    {
      id: selectedActionToAdd.value,
      timerDelay: '',
      timerKey: '',
      blockingTimerKey: '',
      snoozeTime: '',
      active: true,
    },
  ]
  selectedActionToAdd.value = null
}

function removeServerAction(index) {
  form.value.actions = form.value.actions.filter((_, i) => i !== index)
  const s = new Set(expandedActionRows.value)
  s.delete(index)
  expandedActionRows.value = s
}

function toggleActionRow(index) {
  const s = new Set(expandedActionRows.value)
  if (s.has(index)) s.delete(index)
  else s.add(index)
  expandedActionRows.value = s
}

function actionRowHint(action) {
  const parts = []
  if (action.timerDelay) parts.push(`delay: ${action.timerDelay}s`)
  if (action.snoozeTime) parts.push(`snooze: ${action.snoozeTime}s`)
  return parts.join(' | ')
}

const newTimerKey = ref('')

function addTimerCancellation() {
  const key = newTimerKey.value.trim()
  if (!key || form.value.timerCancellations.includes(key)) return
  form.value.timerCancellations = [...form.value.timerCancellations, key]
  newTimerKey.value = ''
}

function removeTimerCancellation(key) {
  form.value.timerCancellations = form.value.timerCancellations.filter((k) => k !== key)
}

const newPstorageKey = ref('')
const newPstorageValue = ref('')

function addPstorageSet() {
  const key = newPstorageKey.value.trim()
  if (!key) return
  const idx = form.value.pstorageSetActions.findIndex((e) => e.key === key)
  if (idx !== -1) {
    form.value.pstorageSetActions[idx].value = newPstorageValue.value
  } else {
    form.value.pstorageSetActions = [
      ...form.value.pstorageSetActions,
      { key, value: newPstorageValue.value },
    ]
  }
  newPstorageKey.value = ''
  newPstorageValue.value = ''
}

function removePstorageSet(key) {
  form.value.pstorageSetActions = form.value.pstorageSetActions.filter((e) => e.key !== key)
}

const newPstorageDeleteKey = ref('')

function addPstorageDelete() {
  const key = newPstorageDeleteKey.value.trim()
  if (!key || form.value.pstorageDeleteActions.includes(key)) return
  form.value.pstorageDeleteActions = [...form.value.pstorageDeleteActions, key]
  newPstorageDeleteKey.value = ''
}

function removePstorageDelete(key) {
  form.value.pstorageDeleteActions = form.value.pstorageDeleteActions.filter((k) => k !== key)
}

const newCustomAttrKey = ref('')
const newCustomAttrValue = ref('')

function addCustomAttrSet() {
  const key = newCustomAttrKey.value.trim()
  if (!key) return
  const idx = form.value.customAttributeSetActions.findIndex((e) => e.key === key)
  if (idx !== -1) {
    form.value.customAttributeSetActions[idx].value = newCustomAttrValue.value
  } else {
    form.value.customAttributeSetActions = [
      ...form.value.customAttributeSetActions,
      { key, value: newCustomAttrValue.value },
    ]
  }
  newCustomAttrKey.value = ''
  newCustomAttrValue.value = ''
}

function removeCustomAttrSet(key) {
  form.value.customAttributeSetActions = form.value.customAttributeSetActions.filter(
    (e) => e.key !== key,
  )
}

const newCustomAttrDeleteKey = ref('')

function addCustomAttrDelete() {
  const key = newCustomAttrDeleteKey.value.trim()
  if (!key || form.value.customAttributeDeleteActions.includes(key)) return
  form.value.customAttributeDeleteActions = [...form.value.customAttributeDeleteActions, key]
  newCustomAttrDeleteKey.value = ''
}

function removeCustomAttrDelete(key) {
  form.value.customAttributeDeleteActions = form.value.customAttributeDeleteActions.filter(
    (k) => k !== key,
  )
}

function computeInitialExpanded(f) {
  const open = []
  if (f.flags & RF_GENERATE_ALARM) open.push('alarm')
  if (f.flags & RF_CREATE_INCIDENT) open.push('incident')
  if (f.flags & (RF_START_DOWNTIME | RF_END_DOWNTIME)) open.push('downtime')
  if (f.pstorageSetActions.length || f.pstorageDeleteActions.length) open.push('pstorage')
  if (f.customAttributeSetActions.length || f.customAttributeDeleteActions.length)
    open.push('customattr')
  if (f.actions.length) open.push('serveractions')
  if (f.actionScript) open.push('script')
  if (f.timerCancellations.length) open.push('timers')
  if (f.aiAgentInstructions) open.push('aiagent')
  if (f.chainCalls?.length) open.push('chaincalls')
  return open
}

const expandedPanels = ref(computeInitialExpanded(form.value))

const chainCallsPanelSummary = computed(() => {
  const ids = form.value.chainCalls ?? []
  if (!ids.length) return 'None'
  const byId = new Map(props.chains.map((chain) => [chain.id, chain]))
  return ids.map((id) => chainLabel(byId.get(id) ?? { id })).join(' → ')
})

const alarmPanelSummary = computed(() => {
  switch (alarmActionType.value) {
    case 'no-action':
      return 'No action'
    case 'generate': {
      const sev = ALARM_SEVERITY_OPTIONS.find((o) => o.value === alarmGenerateSeverity.value)
      return `Create: ${sev?.label ?? '?'}`
    }
    case 'resolve':
      return 'Resolve alarms'
    case 'terminate':
      return 'Terminate alarms'
    default:
      return ''
  }
})

const incidentPanelSummary = computed(() => {
  if (!createIncident.value) return 'Disabled'
  if (aiAnalyzeIncident.value) return 'Create + AI analysis'
  return 'Create on alarm'
})

const downtimePanelSummary = computed(() => {
  switch (downtimeControl.value) {
    case 'start':
      return `Start${form.value.downtimeTag ? ': ' + form.value.downtimeTag : ''}`
    case 'end':
      return `End${form.value.downtimeTag ? ': ' + form.value.downtimeTag : ''}`
    default:
      return 'Do nothing'
  }
})

watch(
  () => props.rule,
  (rule) => {
    const f = buildForm(rule)
    form.value = f
    formSnapshot.value = JSON.stringify(f)
    expandedPanels.value = computeInitialExpanded(f)
    expandedActionRows.value = new Set()
  },
)

function save() {
  const data = {
    ...form.value,
    // eslint-disable-next-line no-unused-vars
    timeFrames: form.value.timeFrames.map(({ _key, ...f }) => encodeTimeFrame(f)),
    pstorageSetActions: Object.fromEntries(
      form.value.pstorageSetActions.map(({ key, value }) => [key, value]),
    ),
    customAttributeSetActions: Object.fromEntries(
      form.value.customAttributeSetActions.map(({ key, value }) => [key, value]),
    ),
    alarmTimeout: Number(form.value.alarmTimeout) || 0,
    alarmTimeoutEvent: Number(form.value.alarmTimeoutEvent) || 0,
    incidentDelay: Number(form.value.incidentDelay) || 0,
  }
  emit('saved', data)
}

function discard() {
  const f = buildForm(props.rule)
  form.value = f
  expandedPanels.value = computeInitialExpanded(f)
  expandedActionRows.value = new Set()
}

const headerTitle = computed(() => {
  if (isNew.value) return 'New Rule'
  return props.rule.comments || 'Edit Rule'
})

const activeTab = ref('general')
</script>

<template>
  <div class="epp-rule-detail">
    <EntityDetailHeader :title="headerTitle" subtitle="Event Processing Rule" @back="emit('close')">
      <template #actions>
        <template v-if="!readonly">
          <Button
            label="Discard"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            :disabled="!isDirty"
            @click="discard"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            size="small"
            severity="primary"
            :disabled="!isDirty"
            @click="save"
          />
        </template>
      </template>
    </EntityDetailHeader>

    <Message v-if="readonly" severity="secondary" :closable="false" class="readonly-banner">
      You have read-only access to this chain, so this rule cannot be changed here.
    </Message>

    <Tabs v-model:value="activeTab" class="detail-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="condition">Condition</Tab>
        <Tab value="action">Action</Tab>
      </TabList>

      <!-- One disabled fieldset instead of a binding per control; the tab strip stays outside
           it so a read-only rule can still be browsed. -->
      <fieldset class="detail-form" :disabled="readonly">
        <TabPanels>
          <TabPanel value="general">
            <div class="detail-cards-grid">
              <DetailCard title="Description" :wide="true">
                <div class="field-col" style="padding: 0.5rem 0">
                  <Textarea
                    v-model="form.comments"
                    placeholder="Enter a description for this rule..."
                    rows="3"
                    style="width: 100%"
                    auto-resize
                  />
                  <div class="field-hint">Shown as the rule name in the list view.</div>
                </div>
              </DetailCard>

              <DetailCard title="Options">
                <label class="option-row" for="flag-disabled">
                  <span @click.stop>
                    <Checkbox input-id="flag-disabled" v-model="isDisabled" :binary="true" />
                  </span>
                  Rule is disabled
                </label>
              </DetailCard>
            </div>
          </TabPanel>

          <TabPanel value="condition">
            <div class="detail-cards-grid">
              <DetailCard title="General">
                <label class="option-row" for="flag-correlated">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-correlated"
                      v-model="acceptCorrelatedEvents"
                      :binary="true"
                    />
                  </span>
                  Accept correlated events
                </label>
              </DetailCard>

              <DetailCard title="Severity Filter">
                <div class="severity-checkboxes" style="padding: 0.5rem 0">
                  <label v-for="sev in severityFlags" :key="sev.flag" class="severity-check">
                    <Checkbox
                      :model-value="isSeverityChecked(sev.flag)"
                      :binary="true"
                      @change="toggleSeverity(sev.flag)"
                    />
                    {{ sev.label }}
                  </label>
                </div>
              </DetailCard>

              <DetailCard title="Events" :wide="true">
                <div class="card-section">
                  <label class="toggle-label-small">
                    <ToggleSwitch v-model="negatedEvents" size="small" />
                    Inverse match
                  </label>
                  <div class="chip-list">
                    <Tag
                      v-for="code in form.events"
                      :key="code"
                      severity="secondary"
                      class="item-chip"
                    >
                      <template #default>
                        <span>{{ eventTemplateMap[code]?.name ?? `#${code}` }}</span>
                        <button
                          class="chip-remove"
                          aria-label="Remove event"
                          @click.stop="removeEvent(code)"
                        >
                          <i class="pi pi-times" />
                        </button>
                      </template>
                    </Tag>
                    <span v-if="!form.events.length" class="empty-chip-hint">(any event)</span>
                  </div>
                  <div class="add-row">
                    <Button
                      label="Pick events..."
                      icon="pi pi-list"
                      size="small"
                      severity="secondary"
                      outlined
                      @click="showEventPicker = true"
                    />
                  </div>
                  <EventPickerDialog
                    v-model:visible="showEventPicker"
                    :model-value="form.events"
                    multiple
                    @update:model-value="form.events = $event"
                  />
                </div>
              </DetailCard>

              <DetailCard title="Source Objects" :wide="true">
                <div class="card-section">
                  <label class="toggle-label-small">
                    <ToggleSwitch v-model="negatedSources" size="small" />
                    Inverse match
                  </label>

                  <div class="source-sub">
                    <div class="source-sub-label">Sources</div>
                    <div class="chip-list">
                      <Tag
                        v-for="id in form.sources"
                        :key="id"
                        severity="secondary"
                        class="item-chip"
                      >
                        <template #default>
                          <span>{{ sourceName(id) }}</span>
                          <button
                            class="chip-remove"
                            aria-label="Remove source"
                            @click.stop="removeSource(id)"
                          >
                            <i class="pi pi-times" />
                          </button>
                        </template>
                      </Tag>
                      <span v-if="!form.sources.length" class="empty-chip-hint">(any object)</span>
                    </div>
                    <Button
                      label="Add object..."
                      icon="pi pi-plus"
                      size="small"
                      severity="secondary"
                      outlined
                      @click="sourcePickerVisible = true"
                    />
                  </div>

                  <div class="source-sub">
                    <div class="source-sub-label">Exclusions</div>
                    <div class="chip-list">
                      <Tag
                        v-for="id in form.sourceExclusions"
                        :key="id"
                        severity="warn"
                        class="item-chip"
                      >
                        <template #default>
                          <span>{{ exclusionName(id) }}</span>
                          <button
                            class="chip-remove"
                            aria-label="Remove exclusion"
                            @click.stop="removeExclusion(id)"
                          >
                            <i class="pi pi-times" />
                          </button>
                        </template>
                      </Tag>
                      <span v-if="!form.sourceExclusions.length" class="empty-chip-hint"
                        >(none)</span
                      >
                    </div>
                    <Button
                      label="Add exclusion..."
                      icon="pi pi-plus"
                      size="small"
                      severity="secondary"
                      outlined
                      @click="exclusionPickerVisible = true"
                    />
                  </div>
                </div>
              </DetailCard>

              <DetailCard title="Time Filter" :wide="true">
                <div class="card-section">
                  <label class="toggle-label-small">
                    <ToggleSwitch v-model="negatedTimeFrames" size="small" />
                    Inverse rule
                  </label>
                  <div v-if="!form.timeFrames.length" class="tf-empty-state">
                    No time restriction — rule matches at any time.
                  </div>
                  <template v-for="(frame, fi) in form.timeFrames" :key="frame._key">
                    <div v-if="!isFrameExpanded(frame._key)" class="tf-card tf-card--collapsed">
                      <span class="tf-label">{{ frameLabel(frame) }}</span>
                      <div class="tf-card-actions">
                        <button class="tf-icon-btn" @click="expandFrame(frame._key)">
                          <i class="pi pi-pencil" />
                        </button>
                        <button
                          class="tf-icon-btn tf-icon-btn--danger"
                          @click="removeTimeFrame(fi)"
                        >
                          <i class="pi pi-trash" />
                        </button>
                      </div>
                    </div>

                    <div v-else class="tf-card">
                      <div class="tf-card-header">
                        <span class="tf-card-label">Time Frame {{ fi + 1 }}</span>
                      </div>

                      <div class="tf-row">
                        <span class="field-label">Time</span>
                        <div class="tf-time-row">
                          <label class="toggle-label">
                            <ToggleSwitch
                              :model-value="isAnyTime(frame)"
                              @update:model-value="setAnyTime(fi, $event)"
                            />
                            Any time
                          </label>
                          <template v-if="!isAnyTime(frame)">
                            <div class="tf-spinner">
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'start', 'h', 1)">
                                <i class="pi pi-chevron-up" />
                              </button>
                              <span />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'start', 'm', 1)">
                                <i class="pi pi-chevron-up" />
                              </button>
                              <input
                                class="tf-time-part"
                                maxlength="2"
                                :value="String(Math.floor(frame.startTime / 60)).padStart(2, '0')"
                                @change="setTimePart(fi, 'start', 'h', $event.target.value)"
                              />
                              <span class="tf-colon">:</span>
                              <input
                                class="tf-time-part"
                                maxlength="2"
                                :value="String(frame.startTime % 60).padStart(2, '0')"
                                @change="setTimePart(fi, 'start', 'm', $event.target.value)"
                              />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'start', 'h', -1)">
                                <i class="pi pi-chevron-down" />
                              </button>
                              <span />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'start', 'm', -1)">
                                <i class="pi pi-chevron-down" />
                              </button>
                            </div>
                            <span class="tf-sep">to</span>
                            <div class="tf-spinner">
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'end', 'h', 1)">
                                <i class="pi pi-chevron-up" />
                              </button>
                              <span />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'end', 'm', 1)">
                                <i class="pi pi-chevron-up" />
                              </button>
                              <input
                                class="tf-time-part"
                                maxlength="2"
                                :value="String(Math.floor(frame.endTime / 60)).padStart(2, '0')"
                                @change="setTimePart(fi, 'end', 'h', $event.target.value)"
                              />
                              <span class="tf-colon">:</span>
                              <input
                                class="tf-time-part"
                                maxlength="2"
                                :value="String(frame.endTime % 60).padStart(2, '0')"
                                @change="setTimePart(fi, 'end', 'm', $event.target.value)"
                              />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'end', 'h', -1)">
                                <i class="pi pi-chevron-down" />
                              </button>
                              <span />
                              <button class="tf-spin-btn" @click="adjustTime(fi, 'end', 'm', -1)">
                                <i class="pi pi-chevron-down" />
                              </button>
                            </div>
                          </template>
                        </div>
                      </div>

                      <div class="tf-row">
                        <span class="field-label">Days of week</span>
                        <div class="tf-chips">
                          <button
                            v-for="d in DOW_OPTIONS"
                            :key="d.bit"
                            class="tf-chip"
                            :class="{ active: frame.dayOfWeek & d.bit }"
                            @click="toggleDow(fi, d.bit)"
                          >
                            {{ d.label }}
                          </button>
                          <span v-if="!frame.dayOfWeek" class="tf-any">(any)</span>
                          <span class="tf-links">
                            <button class="tf-link" @click="setAllDow(fi)">All</button>
                            <button class="tf-link" @click="clearAllDow(fi)">None</button>
                          </span>
                        </div>
                      </div>

                      <div class="tf-row tf-row--top">
                        <span class="field-label">Day of month</span>
                        <div class="tf-dom">
                          <!-- `@mouseenter` is the drag-paint gesture; Enter and Space toggle a
                               chip instead. -->
                          <div class="tf-dom-grid">
                            <!-- eslint-disable-next-line vuejs-accessibility/mouse-events-have-key-events -->
                            <button
                              v-for="d in 31"
                              :key="d"
                              type="button"
                              class="tf-chip tf-dom-btn"
                              :class="{ active: isDayOfMonthActive(frame.dayOfMonth, d) }"
                              :aria-pressed="isDayOfMonthActive(frame.dayOfMonth, d)"
                              @mousedown.prevent="startDomDrag(fi, d)"
                              @mouseenter="applyDomDrag(fi, d)"
                              @keydown.enter.prevent="toggleDayOfMonth(fi, d)"
                              @keydown.space.prevent="toggleDayOfMonth(fi, d)"
                            >
                              {{ d }}
                            </button>
                            <!-- eslint-disable-next-line vuejs-accessibility/mouse-events-have-key-events -->
                            <button
                              type="button"
                              class="tf-chip tf-dom-btn"
                              :class="{ active: isDayOfMonthActive(frame.dayOfMonth, 'L') }"
                              :aria-pressed="isDayOfMonthActive(frame.dayOfMonth, 'L')"
                              aria-label="Last day of month"
                              @mousedown.prevent="startDomDrag(fi, 'L')"
                              @mouseenter="applyDomDrag(fi, 'L')"
                              @keydown.enter.prevent="toggleDayOfMonth(fi, 'L')"
                              @keydown.space.prevent="toggleDayOfMonth(fi, 'L')"
                            >
                              L
                            </button>
                          </div>
                          <div class="tf-dom-text">
                            <InputText
                              v-model="frame.dayOfMonth"
                              placeholder="any (e.g. 1-5, 8, L)"
                              class="tf-dom-input"
                            />
                            <span class="field-hint">
                              Comma-separated days or ranges. L&nbsp;=&nbsp;last day of month.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div class="tf-row">
                        <span class="field-label">Months</span>
                        <div class="tf-chips">
                          <button
                            v-for="m in MONTH_OPTIONS"
                            :key="m.bit"
                            class="tf-chip"
                            :class="{ active: frame.month & m.bit }"
                            @click="toggleMonth(fi, m.bit)"
                          >
                            {{ m.label }}
                          </button>
                          <span v-if="!frame.month" class="tf-any">(any)</span>
                          <span class="tf-links">
                            <button class="tf-link" @click="setAllMonths(fi)">All</button>
                            <button class="tf-link" @click="clearAllMonths(fi)">None</button>
                          </span>
                        </div>
                      </div>

                      <div class="tf-done-row">
                        <Button
                          label="Done"
                          size="small"
                          severity="secondary"
                          @click="collapseFrame(frame._key)"
                        />
                      </div>
                    </div>
                  </template>
                  <Button
                    label="Add time frame"
                    icon="pi pi-plus"
                    size="small"
                    severity="secondary"
                    outlined
                    @click="addTimeFrame"
                  />
                </div>
              </DetailCard>

              <DetailCard title="Filter Script" :wide="true">
                <div class="card-section">
                  <NxslScriptEditor
                    v-model="form.filterScript"
                    :readonly="readonly"
                    hint-key="epp-filter"
                    placeholder="// NXSL script&#10;return true;"
                    showCompile
                  />
                </div>
              </DetailCard>
            </div>
          </TabPanel>

          <TabPanel value="action">
            <div class="action-tab-content">
              <DetailCard title="General" :wide="true">
                <label class="option-row" for="flag-stop">
                  <span @click.stop>
                    <Checkbox input-id="flag-stop" v-model="stopProcessing" :binary="true" />
                  </span>
                  Stop event processing after this rule
                </label>
                <p v-if="form.chainCalls?.length" class="option-note">
                  {{
                    stopProcessing
                      ? 'Processing halts once the called chains return.'
                      : 'Processing continues with the next rule once the called chains return — unless a rule inside one of them stops it.'
                  }}
                </p>
              </DetailCard>
              <Accordion v-model:value="expandedPanels" multiple class="action-accordion">
                <AccordionPanel value="chaincalls">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Call Chains</span>
                      <span class="panel-summary">{{ chainCallsPanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <EppRuleChainCalls
                        v-model="form.chainCalls"
                        :chains="chains"
                        :current-chain-id="chainId"
                        :call-graph="callGraph"
                        :disabled="readonly"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="alarm">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Alarm</span>
                      <span class="panel-summary">{{ alarmPanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <FormField
                        label="Action"
                        class="field-col"
                        style="width: 240px"
                        v-slot="{ id }"
                      >
                        <Select
                          :input-id="id"
                          v-model="alarmActionType"
                          :options="ALARM_ACTION_OPTIONS"
                          option-label="label"
                          option-value="value"
                          style="width: 100%"
                        />
                      </FormField>

                      <template v-if="alarmActionType === 'generate'">
                        <div class="two-col-grid">
                          <FormField
                            label="Message"
                            class="field-col"
                            style="grid-column: 1 / -1"
                            v-slot="{ id }"
                          >
                            <InputText
                              :id="id"
                              v-model="form.alarmMessage"
                              placeholder="%m"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField
                            label="Alarm Key"
                            class="field-col"
                            style="grid-column: 1 / -1"
                            v-slot="{ id }"
                          >
                            <InputText
                              :id="id"
                              v-model="form.alarmKey"
                              placeholder="%i-%2"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField label="Severity" class="field-col" v-slot="{ id }">
                            <Select
                              :input-id="id"
                              v-model="alarmGenerateSeverity"
                              :options="ALARM_SEVERITY_OPTIONS"
                              option-label="label"
                              option-value="value"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField
                            label="Timeout (s, 0 = none)"
                            class="field-col"
                            v-slot="{ id }"
                          >
                            <InputText
                              :id="id"
                              v-model="form.alarmTimeout"
                              type="number"
                              min="0"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField label="Timeout Event" class="field-col" group>
                            <EventSelectField
                              v-model="form.alarmTimeoutEvent"
                              clearable
                              empty-label="(none — expires silently)"
                            />
                          </FormField>
                          <FormField
                            label="Root Cause Analysis Script"
                            class="field-col"
                            v-slot="{ id }"
                          >
                            <Select
                              :input-id="id"
                              v-model="form.rootCauseAnalysisScript"
                              :options="scriptOptions"
                              option-label="label"
                              option-value="value"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField label="Alarm Category" class="field-col" group>
                            <div class="chip-list">
                              <Tag
                                v-for="id in form.alarmCategories"
                                :key="id"
                                severity="secondary"
                                class="item-chip"
                              >
                                <template #default>
                                  <span>{{ alarmCategoryMap[id]?.name ?? `#${id}` }}</span>
                                  <button
                                    class="chip-remove"
                                    aria-label="Remove category"
                                    @click.stop="removeAlarmCategory(id)"
                                  >
                                    <i class="pi pi-times" />
                                  </button>
                                </template>
                              </Tag>
                              <span v-if="!form.alarmCategories.length" class="empty-chip-hint">
                                (none)
                              </span>
                            </div>
                            <div class="add-row">
                              <Select
                                v-model="selectedCategoryToAdd"
                                :options="alarmCategoryOptions"
                                option-label="label"
                                option-value="value"
                                aria-label="Add a category"
                                placeholder="Add category..."
                                size="small"
                                :disabled="!alarmCategoryOptions.length"
                                empty-message="Every category is already added"
                                style="flex: 1"
                                @change="addAlarmCategory"
                              />
                            </div>
                          </FormField>
                        </div>
                        <div class="flag-checks">
                          <label class="toggle-label">
                            <Checkbox v-model="createHelpdeskTicket" :binary="true" />
                            Create helpdesk ticket on alarm creation
                          </label>
                          <template v-if="showAiComment">
                            <label class="toggle-label">
                              <Checkbox v-model="addAiComment" :binary="true" />
                              Add AI assistant's comment on alarm creation
                            </label>
                            <Message
                              v-if="showAiUnavailableNote"
                              severity="warn"
                              :closable="false"
                              class="ai-unavailable-note"
                            >
                              The AI assistant is not available on this server.
                            </Message>
                          </template>
                        </div>
                      </template>

                      <template
                        v-else-if="alarmActionType === 'resolve' || alarmActionType === 'terminate'"
                      >
                        <FormField
                          :label="`${alarmActionType === 'resolve' ? 'Resolve' : 'Terminate'} all alarms
                          with key`"
                          class="field-col"
                          style="width: 100%"
                          v-slot="{ id }"
                        >
                          <InputText
                            :id="id"
                            v-model="form.alarmKey"
                            placeholder="Alarm key pattern"
                            style="width: 100%"
                          />
                        </FormField>
                        <label class="toggle-label">
                          <Checkbox v-model="terminateByRegexp" :binary="true" />
                          Use regular expression
                        </label>
                      </template>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="incident">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Incident</span>
                      <span class="panel-summary">{{ incidentPanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <label class="toggle-label">
                        <Checkbox v-model="createIncident" :binary="true" />
                        Create incident on alarm creation
                      </label>

                      <template v-if="createIncident">
                        <div class="two-col-grid">
                          <FormField
                            label="Creation Delay (s, 0 = immediate)"
                            class="field-col"
                            v-slot="{ id }"
                          >
                            <InputText
                              :id="id"
                              v-model="form.incidentDelay"
                              type="number"
                              min="0"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField label="Title" class="field-col" v-slot="{ id }">
                            <InputText
                              :id="id"
                              v-model="form.incidentTitle"
                              placeholder="Leave empty to use alarm message"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField
                            label="Description"
                            class="field-col"
                            style="grid-column: 1 / -1"
                            v-slot="{ id }"
                          >
                            <Textarea
                              :id="id"
                              v-model="form.incidentDescription"
                              rows="3"
                              style="width: 100%"
                              auto-resize
                            />
                          </FormField>
                        </div>

                        <label v-if="showAiIncidentAnalysis" class="toggle-label">
                          <Checkbox v-model="aiAnalyzeIncident" :binary="true" />
                          Perform AI-based incident analysis
                        </label>
                        <Message
                          v-if="showAiIncidentAnalysis && showAiUnavailableNote"
                          severity="warn"
                          :closable="false"
                          class="ai-unavailable-note"
                        >
                          The AI assistant is not available on this server.
                        </Message>

                        <template v-if="showAiIncidentAnalysis && aiAnalyzeIncident">
                          <div class="two-col-grid">
                            <FormField label="AI Analysis Depth" class="field-col" v-slot="{ id }">
                              <Select
                                :input-id="id"
                                v-model="form.incidentAIAnalysisDepth"
                                :options="AI_DEPTH_OPTIONS"
                                option-label="label"
                                option-value="value"
                                style="width: 100%"
                              />
                            </FormField>
                            <div class="field-col" style="align-self: flex-end">
                              <label class="toggle-label">
                                <Checkbox v-model="aiAutoAssign" :binary="true" />
                                Automatically assign incident to suggested owner
                              </label>
                            </div>
                            <FormField
                              label="AI Prompt for Analysis (optional)"
                              class="field-col"
                              style="grid-column: 1 / -1"
                              v-slot="{ id }"
                            >
                              <Textarea
                                :id="id"
                                v-model="form.incidentAIPrompt"
                                placeholder="Additional context or instructions for the AI analysis..."
                                rows="3"
                                style="width: 100%"
                                auto-resize
                              />
                            </FormField>
                          </div>
                        </template>
                      </template>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="downtime">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Downtime Control</span>
                      <span class="panel-summary">{{ downtimePanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <FormField
                        label="Action"
                        class="field-col"
                        style="width: 220px"
                        v-slot="{ id }"
                      >
                        <Select
                          :input-id="id"
                          v-model="downtimeControl"
                          :options="DOWNTIME_OPTIONS"
                          option-label="label"
                          option-value="value"
                          style="width: 100%"
                        />
                      </FormField>
                      <FormField
                        label="Downtime Tag"
                        class="field-col"
                        v-if="downtimeControl !== 'none'"
                        style="width: 320px"
                        v-slot="{ id }"
                      >
                        <InputText
                          :id="id"
                          v-model="form.downtimeTag"
                          placeholder="Tag identifier"
                          style="width: 100%"
                        />
                      </FormField>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="pstorage">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Persistent Storage</span>
                      <span class="panel-summary">
                        {{
                          form.pstorageSetActions.length || form.pstorageDeleteActions.length
                            ? `${form.pstorageSetActions.length} set, ${form.pstorageDeleteActions.length} delete`
                            : 'None configured'
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="kv-subsection">
                        <div class="field-label mb-1">Set on match:</div>
                        <div v-if="form.pstorageSetActions.length" class="kv-list">
                          <div
                            v-for="entry in form.pstorageSetActions"
                            :key="entry.key"
                            class="kv-row"
                          >
                            <span class="kv-key">{{ entry.key }}</span>
                            <i class="pi pi-arrow-right kv-arrow" />
                            <span class="kv-value">{{ entry.value }}</span>
                            <Button
                              :aria-label="`Remove persistent storage entry ${entry.key}`"
                              icon="pi pi-trash"
                              text
                              rounded
                              severity="danger"
                              size="small"
                              @click="removePstorageSet(entry.key)"
                            />
                          </div>
                        </div>
                        <div class="kv-add-row">
                          <InputText
                            v-model="newPstorageKey"
                            placeholder="Key"
                            size="small"
                            style="flex: 1"
                          />
                          <span class="kv-equals">=</span>
                          <InputText
                            v-model="newPstorageValue"
                            placeholder="Value"
                            size="small"
                            style="flex: 2"
                            @keyup.enter="addPstorageSet"
                          />
                          <Button
                            aria-label="Add persistent storage entry"
                            icon="pi pi-plus"
                            size="small"
                            severity="secondary"
                            :disabled="!newPstorageKey.trim()"
                            @click="addPstorageSet"
                          />
                        </div>
                      </div>

                      <div class="kv-subsection">
                        <div class="field-label mb-1">Delete on match:</div>
                        <div class="chip-list">
                          <Tag
                            v-for="key in form.pstorageDeleteActions"
                            :key="key"
                            severity="warn"
                            class="item-chip"
                          >
                            <template #default>
                              <span>{{ key }}</span>
                              <button
                                class="chip-remove"
                                aria-label="Remove key"
                                @click.stop="removePstorageDelete(key)"
                              >
                                <i class="pi pi-times" />
                              </button>
                            </template>
                          </Tag>
                          <span v-if="!form.pstorageDeleteActions.length" class="empty-chip-hint">
                            (none)
                          </span>
                        </div>
                        <div class="add-row">
                          <InputText
                            v-model="newPstorageDeleteKey"
                            placeholder="Key to delete..."
                            size="small"
                            style="flex: 1"
                            @keyup.enter="addPstorageDelete"
                          />
                          <Button
                            aria-label="Add persistent storage deletion"
                            icon="pi pi-plus"
                            size="small"
                            severity="secondary"
                            :disabled="!newPstorageDeleteKey.trim()"
                            @click="addPstorageDelete"
                          />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="customattr">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Custom Attributes</span>
                      <span class="panel-summary">
                        {{
                          form.customAttributeSetActions.length ||
                          form.customAttributeDeleteActions.length
                            ? `${form.customAttributeSetActions.length} set, ${form.customAttributeDeleteActions.length} delete`
                            : 'None configured'
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="kv-subsection">
                        <div class="field-label mb-1">Set on match:</div>
                        <div v-if="form.customAttributeSetActions.length" class="kv-list">
                          <div
                            v-for="entry in form.customAttributeSetActions"
                            :key="entry.key"
                            class="kv-row"
                          >
                            <span class="kv-key">{{ entry.key }}</span>
                            <i class="pi pi-arrow-right kv-arrow" />
                            <span class="kv-value">{{ entry.value }}</span>
                            <Button
                              :aria-label="`Remove custom attribute ${entry.key}`"
                              icon="pi pi-trash"
                              text
                              rounded
                              severity="danger"
                              size="small"
                              @click="removeCustomAttrSet(entry.key)"
                            />
                          </div>
                        </div>
                        <div class="kv-add-row">
                          <InputText
                            v-model="newCustomAttrKey"
                            placeholder="Key"
                            size="small"
                            style="flex: 1"
                          />
                          <span class="kv-equals">=</span>
                          <InputText
                            v-model="newCustomAttrValue"
                            placeholder="Value"
                            size="small"
                            style="flex: 2"
                            @keyup.enter="addCustomAttrSet"
                          />
                          <Button
                            aria-label="Add custom attribute"
                            icon="pi pi-plus"
                            size="small"
                            severity="secondary"
                            :disabled="!newCustomAttrKey.trim()"
                            @click="addCustomAttrSet"
                          />
                        </div>
                      </div>

                      <div class="kv-subsection">
                        <div class="field-label mb-1">Delete on match:</div>
                        <div class="chip-list">
                          <Tag
                            v-for="key in form.customAttributeDeleteActions"
                            :key="key"
                            severity="warn"
                            class="item-chip"
                          >
                            <template #default>
                              <span>{{ key }}</span>
                              <button
                                class="chip-remove"
                                aria-label="Remove key"
                                @click.stop="removeCustomAttrDelete(key)"
                              >
                                <i class="pi pi-times" />
                              </button>
                            </template>
                          </Tag>
                          <span
                            v-if="!form.customAttributeDeleteActions.length"
                            class="empty-chip-hint"
                          >
                            (none)
                          </span>
                        </div>
                        <div class="add-row">
                          <InputText
                            v-model="newCustomAttrDeleteKey"
                            placeholder="Key to delete..."
                            size="small"
                            style="flex: 1"
                            @keyup.enter="addCustomAttrDelete"
                          />
                          <Button
                            aria-label="Add custom attribute deletion"
                            icon="pi pi-plus"
                            size="small"
                            severity="secondary"
                            :disabled="!newCustomAttrDeleteKey.trim()"
                            @click="addCustomAttrDelete"
                          />
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="serveractions">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Server Actions</span>
                      <span class="panel-summary">
                        {{
                          form.actions.length
                            ? `${form.actions.length} action(s)`
                            : 'None configured'
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div v-if="form.actions.length" class="server-actions-list">
                        <div
                          v-for="(action, i) in form.actions"
                          :key="i"
                          class="server-action-item"
                        >
                          <div class="server-action-row">
                            <ToggleSwitch v-model="action.active" size="small" />
                            <span class="action-name">
                              {{ serverActionsMap[action.id]?.name ?? `Action #${action.id}` }}
                            </span>
                            <span
                              v-if="!expandedActionRows.has(i) && actionRowHint(action)"
                              class="action-hint"
                            >
                              {{ actionRowHint(action) }}
                            </span>
                            <Button
                              :aria-label="
                                expandedActionRows.has(i) ? 'Collapse action' : 'Expand action'
                              "
                              :aria-expanded="expandedActionRows.has(i)"
                              :icon="
                                expandedActionRows.has(i)
                                  ? 'pi pi-chevron-up'
                                  : 'pi pi-chevron-down'
                              "
                              text
                              rounded
                              size="small"
                              severity="secondary"
                              @click="toggleActionRow(i)"
                            />
                            <Button
                              aria-label="Remove server action"
                              icon="pi pi-trash"
                              text
                              rounded
                              severity="danger"
                              size="small"
                              @click="removeServerAction(i)"
                            />
                          </div>
                          <div v-if="expandedActionRows.has(i)" class="server-action-details">
                            <div class="two-col-grid">
                              <FormField label="Delay (s)" class="field-col" v-slot="{ id }">
                                <InputText
                                  :id="id"
                                  v-model="action.timerDelay"
                                  placeholder="0"
                                  size="small"
                                  style="width: 100%"
                                />
                              </FormField>
                              <FormField label="Delay timer key" class="field-col" v-slot="{ id }">
                                <InputText
                                  :id="id"
                                  v-model="action.timerKey"
                                  placeholder="Timer key..."
                                  size="small"
                                  style="width: 100%"
                                />
                              </FormField>
                              <FormField label="Snooze time (s)" class="field-col" v-slot="{ id }">
                                <InputText
                                  :id="id"
                                  v-model="action.snoozeTime"
                                  placeholder="0"
                                  size="small"
                                  style="width: 100%"
                                />
                              </FormField>
                              <FormField
                                label="Blocking timer key"
                                class="field-col"
                                v-slot="{ id }"
                              >
                                <InputText
                                  :id="id"
                                  v-model="action.blockingTimerKey"
                                  placeholder="Do not run if this timer exists..."
                                  size="small"
                                  style="width: 100%"
                                />
                              </FormField>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="add-row">
                        <Select
                          v-model="selectedActionToAdd"
                          :options="serverActionOptions"
                          option-label="label"
                          option-value="value"
                          placeholder="Select action to add..."
                          filter
                          size="small"
                          style="flex: 1"
                        />
                        <Button
                          aria-label="Add server action"
                          icon="pi pi-plus"
                          size="small"
                          severity="secondary"
                          :disabled="selectedActionToAdd == null"
                          @click="addServerAction"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="script">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Script</span>
                      <span class="panel-summary">{{
                        form.actionScript ? 'Configured' : 'Empty'
                      }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <NxslScriptEditor
                        v-model="form.actionScript"
                        :readonly="readonly"
                        hint-key="epp-action"
                        placeholder="// NXSL script"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="timers">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>Timer Cancellations</span>
                      <span class="panel-summary">
                        {{
                          form.timerCancellations.length
                            ? `${form.timerCancellations.length} key(s)`
                            : 'None'
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="chip-list">
                        <Tag
                          v-for="key in form.timerCancellations"
                          :key="key"
                          severity="secondary"
                          class="item-chip"
                        >
                          <template #default>
                            <span>{{ key }}</span>
                            <button
                              class="chip-remove"
                              aria-label="Remove timer key"
                              @click.stop="removeTimerCancellation(key)"
                            >
                              <i class="pi pi-times" />
                            </button>
                          </template>
                        </Tag>
                        <span v-if="!form.timerCancellations.length" class="empty-chip-hint">
                          (none)
                        </span>
                      </div>
                      <div class="add-row">
                        <InputText
                          v-model="newTimerKey"
                          placeholder="Timer key..."
                          size="small"
                          style="flex: 1"
                          @keyup.enter="addTimerCancellation"
                        />
                        <Button
                          aria-label="Add timer cancellation"
                          icon="pi pi-plus"
                          size="small"
                          severity="secondary"
                          :disabled="!newTimerKey.trim()"
                          @click="addTimerCancellation"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel v-if="showAiAgentInstructions" value="aiagent">
                  <AccordionHeader>
                    <div class="panel-header">
                      <span>AI Agent Instructions</span>
                      <span class="panel-summary">
                        {{ form.aiAgentInstructions ? 'Configured' : 'Empty' }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <Message
                        v-if="showAiUnavailableNote"
                        severity="warn"
                        :closable="false"
                        class="ai-unavailable-note"
                      >
                        The AI assistant is not available on this server, so these instructions
                        cannot run. Remove them unless AI is being set up.
                      </Message>
                      <div class="field-hint">
                        Instructions provided to the AI agent when processing this event.
                      </div>
                      <Textarea
                        v-model="form.aiAgentInstructions"
                        placeholder="Instructions for the AI agent..."
                        rows="4"
                        style="width: 100%"
                        auto-resize
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>
              </Accordion>
            </div>
          </TabPanel>
        </TabPanels>
      </fieldset>
    </Tabs>

    <ObjectPickerDialog
      v-model:visible="sourcePickerVisible"
      title="Select Source Object"
      @select="onSourcePicked"
    />
    <ObjectPickerDialog
      v-model:visible="exclusionPickerVisible"
      title="Select Exclusion Object"
      @select="onExclusionPicked"
    />
  </div>
</template>

<style scoped>
.epp-rule-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.detail-tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Not layout: it must vanish from the flex chain between tabs and panels. A fieldset's
   default min-width is min-content. */
.detail-form {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.readonly-banner {
  margin: 0.75rem 1.5rem 0;
}

.ai-unavailable-note {
  margin: 0;
}

:deep(.p-tablist) {
  flex-shrink: 0;
  background: var(--p-tabs-nav-background, var(--p-surface-card));
}

.detail-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-cards-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

.action-tab-content {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.option-note {
  margin: 0 0 0 1.875rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.5rem;
  margin: 0 -0.5rem;
  border-radius: var(--p-border-radius-sm, 4px);
  cursor: pointer;
  font-size: 0.875rem;
  user-select: none;
  transition: background 0.12s;

  &:hover {
    background: var(--p-surface-hover);
  }
}

.field-hint {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.field-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label,
/* FormField's label lives inside the component, so a scoped rule needs :deep. */
.field-col :deep(.form-field__label) {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.toggle-label-small {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 28px;
  align-items: flex-start;
  padding: 4px 0;
}

.item-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  color: inherit;
  opacity: 0.7;
  font-size: 0.7rem;
  line-height: 1;

  &:hover {
    opacity: 1;
  }
}

.empty-chip-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  align-self: center;
}

.add-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.coming-soon-note {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.severity-checkboxes {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.severity-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.source-sub {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.source-sub-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.script-textarea {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.action-accordion {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

:deep(.p-accordionpanel) {
  border-radius: var(--p-border-radius-lg, 0.5rem) !important;
  border: 1px solid var(--p-surface-border) !important;
  overflow: hidden;
}

:deep(.p-accordionheader) {
  padding: 0.75rem 1.25rem;
}

:deep(.p-accordioncontent-content) {
  padding: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
}

.panel-summary {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.panel-content {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.flag-checks {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.two-col-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.server-actions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-action-item {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius);
  overflow: hidden;
}

.server-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.action-name {
  flex: 1;
  font-size: 0.9rem;
}

.action-hint {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.server-action-details {
  padding: 0.5rem 0.75rem 0.75rem;
  border-top: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.kv-subsection {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: var(--p-surface-ground);
  border-radius: var(--p-border-radius);
  font-size: 0.875rem;
}

.kv-key {
  font-family: var(--font-mono);
  font-weight: 500;
  min-width: 100px;
}

.kv-arrow {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.kv-value {
  flex: 1;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kv-add-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kv-equals {
  font-weight: 600;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.mb-1 {
  margin-bottom: 4px;
}

.tf-empty-state {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.tf-card {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  background: var(--p-surface-ground);
}

.tf-card--collapsed {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tf-label {
  font-size: 0.875rem;
  color: var(--p-text-color);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tf-card-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.tf-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--p-text-muted-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
}

.tf-icon-btn:hover {
  color: var(--p-primary-color);
  background: var(--p-surface-hover);
}

.tf-icon-btn--danger:hover {
  color: var(--p-red-500);
  background: var(--p-surface-hover);
}

.tf-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tf-card-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.tf-done-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.tf-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tf-row--top {
  align-items: flex-start;
}

.tf-row > .field-label {
  width: 90px;
  flex-shrink: 0;
  padding-top: 0.3rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.tf-time-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tf-spinner {
  display: grid;
  grid-template-columns: 2.2rem 0.7rem 2.2rem;
  grid-template-rows: 1rem 2rem 1rem;
  gap: 2px 0;
  align-items: center;
  justify-items: center;
}

.tf-spin-btn {
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.tf-spin-btn i {
  font-size: 0.75rem;
}

.tf-spin-btn:hover {
  color: var(--p-primary-color);
  background: var(--p-surface-hover);
}

.tf-time-part {
  width: 2.2rem;
  text-align: center;
  border: 1px solid var(--p-surface-border);
  border-radius: 4px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 1.05rem;
  padding: 0.2rem 0;
}

.tf-time-part:focus {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.tf-colon {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--p-text-color);
  line-height: 1;
}

.tf-sep {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.tf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.tf-chip {
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 4px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-size: 0.8rem;
  cursor: pointer;
  line-height: 1.4;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.tf-chip.active {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  border-color: var(--p-primary-color);
}

.tf-chip:hover:not(.active) {
  background: var(--p-surface-hover);
}

.tf-any {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.tf-links {
  display: flex;
  gap: 0.1rem;
  margin-left: 0.15rem;
}

.tf-link {
  background: none;
  border: none;
  color: var(--p-primary-color);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  text-decoration: underline;
}

.tf-link:hover {
  opacity: 0.8;
}

.tf-dom {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.tf-dom-grid {
  display: grid;
  grid-template-columns: repeat(8, 2rem);
  gap: 0.25rem;
  user-select: none;
}

.tf-dom-btn {
  width: 2rem;
  text-align: center;
  padding: 0.2rem 0;
}

.tf-dom-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tf-dom-input {
  width: 100%;
  font-size: 0.875rem;
}
</style>
