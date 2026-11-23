<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import MultiSelect from 'primevue/multiselect'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import ToggleSwitch from 'primevue/toggleswitch'
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
import EppKeyTable from '@/components/epp/EppKeyTable.vue'
import EppPickTable from '@/components/epp/EppPickTable.vue'
import EventLabel from '@/components/epp/EventLabel.vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import EppActionIcon from '@/components/epp/EppActionIcon.vue'
import { chainLabel } from '@/utils/eppChains'
import {
  RF_ACCEPT_CORRELATED_EVENTS,
  RF_ADD_AI_COMMENT,
  RF_AI_ANALYZE_INCIDENT,
  RF_AI_AUTO_ASSIGN,
  RF_ALL_SEVERITIES,
  RF_CREATE_HELPDESK_TICKET,
  RF_CREATE_INCIDENT,
  RF_DISABLED,
  RF_END_DOWNTIME,
  RF_GENERATE_ALARM,
  RF_NEGATED_EVENTS,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SEVERITY_CRITICAL,
  RF_SEVERITY_INFO,
  RF_SEVERITY_MAJOR,
  RF_SEVERITY_MINOR,
  RF_SEVERITY_WARNING,
  RF_START_DOWNTIME,
  RF_STOP_PROCESSING,
  RF_TERMINATE_BY_REGEXP,
  SEVERITY_FROM_EVENT,
  SEVERITY_RESOLVE,
  SEVERITY_TERMINATE,
  RULE_SECTIONS,
  aiInstructionsOf,
} from '@/utils/eppRules'
import {
  DOW_OPTIONS,
  MONTH_OPTIONS,
  decodeTimeFrame,
  encodeTimeFrame,
  formatDayOfMonthSet,
  frameLabel,
  isAnyTime,
  parseDayOfMonth,
} from '@/utils/eppTimeFrames'
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
  /** A `RULE_SECTIONS` key: opens on that section's tab, expanded and scrolled into view. */
  section: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['close', 'saved'])

const ALARM_ACTION_OPTIONS = [
  { label: 'No change', value: 'no-action' },
  { label: 'Create', value: 'generate' },
  { label: 'Resolve', value: 'resolve' },
  { label: 'Terminate', value: 'terminate' },
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
  { label: 'Start', value: 'start' },
  { label: 'End', value: 'end' },
]

const severityFlags = [
  { label: 'Normal', flag: RF_SEVERITY_INFO, status: 0 },
  { label: 'Warning', flag: RF_SEVERITY_WARNING, status: 1 },
  { label: 'Minor', flag: RF_SEVERITY_MINOR, status: 2 },
  { label: 'Major', flag: RF_SEVERITY_MAJOR, status: 3 },
  { label: 'Critical', flag: RF_SEVERITY_CRITICAL, status: 4 },
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

function toggleFrame(key) {
  if (isFrameExpanded(key)) collapseFrame(key)
  else expandFrame(key)
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
      aiInstructions: '',
      incidentDelay: 0,
      incidentTitle: '',
      incidentDescription: '',
      incidentAIAnalysisDepth: 1,
      incidentAIPrompt: '',
    }
  }
  // eslint-disable-next-line no-unused-vars
  const { aiAgentInstructions: _legacyAiInstructions, ...fields } = rule
  return {
    ...fields,
    aiInstructions: aiInstructionsOf(rule),
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
    rootCauseAnalysisScript: rule.rootCauseAnalysisScript || null,
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
const showAiAgentInstructions = computed(() => aiAvailable.value || !!aiInstructionsOf(props.rule))

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

const eventItems = computed(() =>
  form.value.events.map((code) => ({
    key: code,
    label: eventTemplateMap.value[code]?.name ?? `#${code}`,
    severity: eventTemplateMap.value[code]?.severity,
  })),
)

const { data: alarmCategoriesData } = useAlarmCategories()
const alarmCategoryOptions = computed(() =>
  (alarmCategoriesData.value ?? []).map((c) => ({ label: c.name, value: c.id })),
)

const { data: scriptLibraryData } = useScriptLibrary()
// The rule names its root cause script; the server drops a value that is not a string.
const scriptOptions = computed(() => {
  const names = (scriptLibraryData.value ?? []).map((s) => s.name)
  const current = form.value.rootCauseAnalysisScript
  // Kept while the library loads, and when the script has since been deleted from it.
  if (current && !names.includes(current)) names.unshift(current)
  return [{ label: '(none)', value: null }, ...names.map((name) => ({ label: name, value: name }))]
})

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

function objectItems(ids) {
  return ids.map((id) => ({ key: id, label: objectsById.value.get(id)?.name ?? `Object #${id}` }))
}

const sourceItems = computed(() => objectItems(form.value.sources))
const exclusionItems = computed(() => objectItems(form.value.sourceExclusions))

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

// A condition section that narrows nothing lets every event through. An inverted empty list
// narrows to nothing at all: the server matches no event against it.
function conditionNarrows(f) {
  return {
    events: f.events.length > 0 || !!(f.flags & RF_NEGATED_EVENTS),
    sources:
      f.sources.length > 0 || f.sourceExclusions.length > 0 || !!(f.flags & RF_NEGATED_SOURCE),
    severity: (f.flags & RF_ALL_SEVERITIES) !== RF_ALL_SEVERITIES,
    time: f.timeFrames.length > 0 || !!(f.flags & RF_NEGATED_TIME_FRAMES),
    'filter-script': !!f.filterScript?.trim(),
  }
}

function computeInitialExpanded(f) {
  const open = Object.entries(conditionNarrows(f)).flatMap(([key, narrows]) =>
    narrows ? [key] : [],
  )
  if (f.flags & RF_GENERATE_ALARM) open.push('alarm')
  if (f.flags & RF_CREATE_INCIDENT) open.push('incident')
  if (f.flags & (RF_START_DOWNTIME | RF_END_DOWNTIME)) open.push('downtime')
  if (f.pstorageSetActions.length || f.pstorageDeleteActions.length) open.push('pstorage')
  if (f.customAttributeSetActions.length || f.customAttributeDeleteActions.length)
    open.push('customattr')
  if (f.actions.length) open.push('serveractions')
  if (f.actionScript) open.push('script')
  if (f.timerCancellations.length) open.push('timers')
  if (f.aiInstructions) open.push('aiagent')
  if (f.chainCalls?.length) open.push('chaincalls')
  return open
}

const expandedPanels = ref(computeInitialExpanded(form.value))

const NOT_CONFIGURED = 'Not configured'

function countLabel(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function setDeleteSummary(set, remove) {
  return set.length || remove.length ? `${set.length} set, ${remove.length} delete` : NOT_CONFIGURED
}

const chainCallsPanelSummary = computed(() => {
  const ids = form.value.chainCalls ?? []
  if (!ids.length) return NOT_CONFIGURED
  const byId = new Map(props.chains.map((chain) => [chain.id, chain]))
  return ids.map((id) => chainLabel(byId.get(id) ?? { id })).join(' → ')
})

const alarmPanelSummary = computed(() => {
  switch (alarmActionType.value) {
    case 'no-action':
      return NOT_CONFIGURED
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
  if (!createIncident.value) return NOT_CONFIGURED
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
      return NOT_CONFIGURED
  }
})

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "One of 3 objects", "not SYS_IF_UP": the rule summary's wording for a list clause. */
function listClause(items, noun, negated) {
  const what = items.length === 1 ? items[0].label : `one of ${countLabel(items.length, noun)}`
  return negated ? `not ${what}` : what
}

const NOTHING_MATCHES = 'Nothing matches'

const eventsSummary = computed(() => {
  const negated = negatedEvents.value
  if (!eventItems.value.length) return negated ? NOTHING_MATCHES : 'Any event'
  return capitalize(listClause(eventItems.value, 'event', negated))
})

const sourcesSummary = computed(() => {
  const negated = negatedSources.value
  const sources = sourceItems.value
  const exclusions = exclusionItems.value.length
  if (!sources.length && !exclusions) return negated ? NOTHING_MATCHES : 'Any object'
  const what = sources.length
    ? listClause(sources, 'object', negated)
    : negated
      ? 'not any object'
      : 'any object'
  return capitalize(exclusions ? `${what}, except ${countLabel(exclusions, 'object')}` : what)
})

const severitySummary = computed(() => {
  const chosen = severityFlags.filter((s) => form.value.flags & s.flag)
  if (chosen.length === severityFlags.length) return 'Any severity'
  if (!chosen.length) return NOTHING_MATCHES
  return chosen.map((s) => s.label).join(', ')
})

const timeSummary = computed(() => {
  const count = form.value.timeFrames.length
  const negated = negatedTimeFrames.value
  if (!count) return negated ? NOTHING_MATCHES : 'Any time'
  return `${negated ? 'Outside' : 'Within'} ${countLabel(count, 'time frame')}`
})

// Each section's header carries the icon the rule summary gives its step, grey while the section
// does nothing.
const sectionIcons = computed(() => {
  const f = form.value
  const alarm = alarmActionType.value
  const downtime = downtimeControl.value
  const narrows = conditionNarrows(f)
  return {
    events: { type: 'events', muted: !narrows.events },
    sources: { type: 'sources', muted: !narrows.sources },
    severity: { type: 'severity', muted: !narrows.severity },
    time: { type: 'time', muted: !narrows.time },
    'filter-script': { type: 'filter-script', muted: !narrows['filter-script'] },
    chaincalls: { type: 'chain-call', muted: !f.chainCalls?.length },
    alarm: {
      type: alarm === 'no-action' ? 'alarm-generate' : `alarm-${alarm}`,
      muted: alarm === 'no-action',
    },
    incident: { type: 'incident', muted: !createIncident.value },
    downtime: {
      type: downtime === 'end' ? 'downtime-end' : 'downtime-start',
      muted: downtime === 'none',
    },
    pstorage: {
      type: 'pstorage',
      muted: !f.pstorageSetActions.length && !f.pstorageDeleteActions.length,
    },
    customattr: {
      type: 'custom-attributes',
      muted: !f.customAttributeSetActions.length && !f.customAttributeDeleteActions.length,
    },
    serveractions: { type: 'server-action', muted: !f.actions.length },
    script: { type: 'action-script', muted: !f.actionScript },
    timers: { type: 'timer-cancel', muted: !f.timerCancellations.length },
    aiagent: { type: 'ai-instructions', muted: !f.aiInstructions },
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
    // Servers before netxms 2a49dc61c1 read only the old name; newer ones prefer the new one.
    aiAgentInstructions: form.value.aiInstructions,
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

const activeTab = ref(RULE_SECTIONS[props.section]?.tab ?? 'general')
const rootEl = ref(null)

async function revealSection(section) {
  const target = RULE_SECTIONS[section]
  if (!target) return
  activeTab.value = target.tab
  if (target.panel && !expandedPanels.value.includes(target.panel)) {
    expandedPanels.value = [...expandedPanels.value, target.panel]
  }
  await nextTick()
  rootEl.value
    ?.querySelector(`[data-rule-section="${section}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

onMounted(() => {
  if (props.section) revealSection(props.section)
})
watch(
  () => props.section,
  (section) => {
    if (section) revealSection(section)
  },
)
</script>

<template>
  <div ref="rootEl" class="epp-rule-detail">
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
            <div class="panel-tab">
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
            <div class="panel-tab">
              <Accordion v-model:value="expandedPanels" multiple class="action-accordion">
                <AccordionPanel value="events" data-rule-section="events">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.events" tile />
                      <span>Events</span>
                      <span class="panel-summary">{{ eventsSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <label v-if="form.events.length || negatedEvents" class="toggle-label">
                        <Checkbox v-model="negatedEvents" :binary="true" />
                        Inverse rule (match events not listed below)
                      </label>
                      <EppPickTable
                        :items="eventItems"
                        column="Event"
                        empty-text="Any event"
                        add-label="Pick events..."
                        add-icon="pi pi-list"
                        item-name="event"
                        mono
                        @add="showEventPicker = true"
                        @remove="removeEvent"
                      >
                        <template #item="{ item }">
                          <EventLabel :name="item.label" :severity="item.severity" />
                        </template>
                      </EppPickTable>
                      <label class="toggle-label">
                        <Checkbox v-model="acceptCorrelatedEvents" :binary="true" />
                        Accept correlated events
                      </label>
                      <EventPickerDialog
                        v-model:visible="showEventPicker"
                        :model-value="form.events"
                        multiple
                        @update:model-value="form.events = $event"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="sources" data-rule-section="sources">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.sources" tile />
                      <span>Source Objects</span>
                      <span class="panel-summary">{{ sourcesSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <label
                        v-if="form.sources.length || form.sourceExclusions.length || negatedSources"
                        class="toggle-label"
                      >
                        <Checkbox v-model="negatedSources" :binary="true" />
                        Inverse rule (match objects not listed below)
                      </label>
                      <div class="pick-pair">
                        <EppPickTable
                          :items="sourceItems"
                          title="Sources"
                          column="Object"
                          empty-text="Any object"
                          add-label="Add object..."
                          item-name="source"
                          @add="sourcePickerVisible = true"
                          @remove="removeSource"
                        >
                          <template #item="{ item }">
                            <span class="item-cell">
                              <ObjectIcon
                                v-if="objectsById.get(item.key)"
                                :object="objectsById.get(item.key)"
                                size="0.95rem"
                              />
                              <span class="item-cell__name">{{ item.label }}</span>
                            </span>
                          </template>
                        </EppPickTable>
                        <EppPickTable
                          :items="exclusionItems"
                          title="Exclusions"
                          column="Object"
                          empty-text="None"
                          add-label="Add exclusion..."
                          item-name="exclusion"
                          @add="exclusionPickerVisible = true"
                          @remove="removeExclusion"
                        >
                          <template #item="{ item }">
                            <span class="item-cell">
                              <ObjectIcon
                                v-if="objectsById.get(item.key)"
                                :object="objectsById.get(item.key)"
                                size="0.95rem"
                              />
                              <span class="item-cell__name">{{ item.label }}</span>
                            </span>
                          </template>
                        </EppPickTable>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="severity" data-rule-section="severity">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.severity" tile />
                      <span>Severity</span>
                      <span class="panel-summary">{{ severitySummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="severity-checkboxes">
                        <label v-for="sev in severityFlags" :key="sev.flag" class="severity-check">
                          <Checkbox
                            :model-value="isSeverityChecked(sev.flag)"
                            :binary="true"
                            @change="toggleSeverity(sev.flag)"
                          />
                          <StatusIcon :status="sev.status" />
                          {{ sev.label }}
                        </label>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="time" data-rule-section="time">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.time" tile />
                      <span>Time Filter</span>
                      <span class="panel-summary">{{ timeSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <label
                        v-if="form.timeFrames.length || negatedTimeFrames"
                        class="toggle-label"
                      >
                        <Checkbox v-model="negatedTimeFrames" :binary="true" />
                        Inverse rule (match time that is not within the time frames below)
                      </label>
                      <div class="edit-table-card">
                        <table class="edit-table" aria-label="Time frames">
                          <colgroup>
                            <col />
                            <col class="time-frame-actions-col" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Time frame</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-if="!form.timeFrames.length">
                              <td colspan="2" class="edit-table__empty">Any time</td>
                            </tr>
                            <template v-for="(frame, fi) in form.timeFrames" :key="frame._key">
                              <tr>
                                <td>{{ frameLabel(frame) }}</td>
                                <td class="edit-table__actions">
                                  <div class="row-buttons">
                                    <Button
                                      :aria-label="
                                        isFrameExpanded(frame._key)
                                          ? 'Close time frame'
                                          : 'Edit time frame'
                                      "
                                      :aria-expanded="isFrameExpanded(frame._key)"
                                      :icon="
                                        isFrameExpanded(frame._key)
                                          ? 'pi pi-chevron-up'
                                          : 'pi pi-pencil'
                                      "
                                      text
                                      rounded
                                      size="small"
                                      severity="secondary"
                                      @click="toggleFrame(frame._key)"
                                    />
                                    <Button
                                      aria-label="Remove time frame"
                                      icon="pi pi-trash"
                                      text
                                      rounded
                                      severity="danger"
                                      size="small"
                                      @click="removeTimeFrame(fi)"
                                    />
                                  </div>
                                </td>
                              </tr>
                              <tr v-if="isFrameExpanded(frame._key)">
                                <td colspan="2" class="row-details">
                                  <div class="tf-editor">
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
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'start', 'h', 1)"
                                            >
                                              <i class="pi pi-chevron-up" />
                                            </button>
                                            <span />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'start', 'm', 1)"
                                            >
                                              <i class="pi pi-chevron-up" />
                                            </button>
                                            <input
                                              class="tf-time-part"
                                              maxlength="2"
                                              :value="
                                                String(Math.floor(frame.startTime / 60)).padStart(
                                                  2,
                                                  '0',
                                                )
                                              "
                                              @change="
                                                setTimePart(fi, 'start', 'h', $event.target.value)
                                              "
                                            />
                                            <span class="tf-colon">:</span>
                                            <input
                                              class="tf-time-part"
                                              maxlength="2"
                                              :value="String(frame.startTime % 60).padStart(2, '0')"
                                              @change="
                                                setTimePart(fi, 'start', 'm', $event.target.value)
                                              "
                                            />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'start', 'h', -1)"
                                            >
                                              <i class="pi pi-chevron-down" />
                                            </button>
                                            <span />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'start', 'm', -1)"
                                            >
                                              <i class="pi pi-chevron-down" />
                                            </button>
                                          </div>
                                          <span class="tf-sep">to</span>
                                          <div class="tf-spinner">
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'end', 'h', 1)"
                                            >
                                              <i class="pi pi-chevron-up" />
                                            </button>
                                            <span />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'end', 'm', 1)"
                                            >
                                              <i class="pi pi-chevron-up" />
                                            </button>
                                            <input
                                              class="tf-time-part"
                                              maxlength="2"
                                              :value="
                                                String(Math.floor(frame.endTime / 60)).padStart(
                                                  2,
                                                  '0',
                                                )
                                              "
                                              @change="
                                                setTimePart(fi, 'end', 'h', $event.target.value)
                                              "
                                            />
                                            <span class="tf-colon">:</span>
                                            <input
                                              class="tf-time-part"
                                              maxlength="2"
                                              :value="String(frame.endTime % 60).padStart(2, '0')"
                                              @change="
                                                setTimePart(fi, 'end', 'm', $event.target.value)
                                              "
                                            />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'end', 'h', -1)"
                                            >
                                              <i class="pi pi-chevron-down" />
                                            </button>
                                            <span />
                                            <button
                                              class="tf-spin-btn"
                                              @click="adjustTime(fi, 'end', 'm', -1)"
                                            >
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
                                          <button class="tf-link" @click="setAllDow(fi)">
                                            All
                                          </button>
                                          <button class="tf-link" @click="clearAllDow(fi)">
                                            None
                                          </button>
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
                                            :class="{
                                              active: isDayOfMonthActive(frame.dayOfMonth, d),
                                            }"
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
                                            :class="{
                                              active: isDayOfMonthActive(frame.dayOfMonth, 'L'),
                                            }"
                                            :aria-pressed="
                                              isDayOfMonthActive(frame.dayOfMonth, 'L')
                                            "
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
                                            Comma-separated days or ranges. L&nbsp;=&nbsp;last day
                                            of month.
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
                                          <button class="tf-link" @click="setAllMonths(fi)">
                                            All
                                          </button>
                                          <button class="tf-link" @click="clearAllMonths(fi)">
                                            None
                                          </button>
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
                                </td>
                              </tr>
                            </template>
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colspan="2">
                                <Button
                                  label="Add time frame"
                                  icon="pi pi-plus"
                                  text
                                  size="small"
                                  severity="secondary"
                                  @click="addTimeFrame"
                                />
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="filter-script" data-rule-section="filter-script">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons['filter-script']" tile />
                      <span>Filter Script</span>
                      <span class="panel-summary">{{
                        form.filterScript?.trim() ? 'Configured' : NOT_CONFIGURED
                      }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <NxslScriptEditor
                        v-model="form.filterScript"
                        :readonly="readonly"
                        hint-key="epp-filter"
                        placeholder="// NXSL script&#10;return true;"
                        showCompile
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>
              </Accordion>
            </div>
          </TabPanel>

          <TabPanel value="action">
            <div class="panel-tab">
              <DetailCard title="General" :wide="true" data-rule-section="action-options">
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
                <AccordionPanel value="chaincalls" data-rule-section="chaincalls">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.chaincalls" tile />
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

                <AccordionPanel value="alarm" data-rule-section="alarm">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.alarm" tile />
                      <span>Alarm</span>
                      <span class="panel-summary">{{ alarmPanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <FormField label="Action" class="field-col" group>
                        <SelectButton
                          v-model="alarmActionType"
                          :options="ALARM_ACTION_OPTIONS"
                          option-label="label"
                          option-value="value"
                          :allow-empty="false"
                          size="small"
                        />
                      </FormField>

                      <template v-if="alarmActionType === 'generate'">
                        <FormField label="Message" class="field-col" v-slot="{ id }">
                          <InputText
                            :id="id"
                            v-model="form.alarmMessage"
                            placeholder="%m"
                            style="width: 100%"
                          />
                        </FormField>
                        <div class="field-pair">
                          <FormField label="Alarm key" class="field-col field-grow" v-slot="{ id }">
                            <InputText
                              :id="id"
                              v-model="form.alarmKey"
                              placeholder="%i-%2"
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField
                            label="Severity"
                            class="field-col field-select"
                            v-slot="{ id }"
                          >
                            <Select
                              :input-id="id"
                              v-model="alarmGenerateSeverity"
                              :options="ALARM_SEVERITY_OPTIONS"
                              option-label="label"
                              option-value="value"
                              style="width: 100%"
                            />
                          </FormField>
                        </div>
                        <div class="field-pair">
                          <FormField
                            label="Timeout"
                            hint="0 = never"
                            class="field-col field-number"
                            v-slot="{ id, describedBy }"
                          >
                            <InputNumber
                              v-model="form.alarmTimeout"
                              :input-id="id"
                              :aria-describedby="describedBy"
                              :min="0"
                              :use-grouping="false"
                              suffix=" s"
                              fluid
                            />
                          </FormField>
                          <FormField label="Timeout event" class="field-col field-grow" group>
                            <EventSelectField
                              v-model="form.alarmTimeoutEvent"
                              clearable
                              empty-label="(none, expires silently)"
                            />
                          </FormField>
                        </div>
                        <div class="two-col-grid">
                          <FormField label="Alarm category" class="field-col" v-slot="{ id }">
                            <MultiSelect
                              v-model="form.alarmCategories"
                              :input-id="id"
                              :options="alarmCategoryOptions"
                              option-label="label"
                              option-value="value"
                              display="chip"
                              placeholder="(none)"
                              filter
                              style="width: 100%"
                            />
                          </FormField>
                          <FormField
                            label="Root cause analysis script"
                            class="field-col"
                            v-slot="{ id }"
                          >
                            <Select
                              :input-id="id"
                              v-model="form.rootCauseAnalysisScript"
                              :options="scriptOptions"
                              option-label="label"
                              option-value="value"
                              placeholder="(none)"
                              style="width: 100%"
                            />
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
                            <div v-if="showAiUnavailableNote" class="dependent">
                              <Message
                                severity="warn"
                                size="small"
                                :closable="false"
                                class="ai-unavailable-note"
                              >
                                The AI assistant is not available on this server.
                              </Message>
                            </div>
                          </template>
                        </div>
                      </template>

                      <FormField
                        v-else-if="alarmActionType === 'resolve' || alarmActionType === 'terminate'"
                        :label="`${alarmActionType === 'resolve' ? 'Resolve' : 'Terminate'} all alarms with key`"
                        class="field-col"
                        v-slot="{ id }"
                      >
                        <div class="input-with-check">
                          <InputText
                            :id="id"
                            v-model="form.alarmKey"
                            placeholder="Alarm key pattern"
                            class="input-with-check__input"
                          />
                          <label class="toggle-label">
                            <Checkbox v-model="terminateByRegexp" :binary="true" />
                            Regular expression
                          </label>
                        </div>
                      </FormField>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="incident" data-rule-section="incident">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.incident" tile />
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

                      <div v-if="createIncident" class="dependent">
                        <FormField
                          label="Creation delay"
                          hint="0 = immediately"
                          class="field-col field-number"
                          v-slot="{ id, describedBy }"
                        >
                          <InputNumber
                            v-model="form.incidentDelay"
                            :input-id="id"
                            :aria-describedby="describedBy"
                            :min="0"
                            :use-grouping="false"
                            suffix=" s"
                            fluid
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
                        <FormField label="Description" class="field-col" v-slot="{ id }">
                          <Textarea
                            :id="id"
                            v-model="form.incidentDescription"
                            rows="3"
                            style="width: 100%"
                            auto-resize
                          />
                        </FormField>

                        <template v-if="showAiIncidentAnalysis">
                          <label class="toggle-label">
                            <Checkbox v-model="aiAnalyzeIncident" :binary="true" />
                            Perform AI-based incident analysis
                          </label>
                          <div v-if="showAiUnavailableNote || aiAnalyzeIncident" class="dependent">
                            <Message
                              v-if="showAiUnavailableNote"
                              severity="warn"
                              size="small"
                              :closable="false"
                              class="ai-unavailable-note"
                            >
                              The AI assistant is not available on this server.
                            </Message>
                            <template v-if="aiAnalyzeIncident">
                              <FormField label="Analysis depth" class="field-col" group>
                                <SelectButton
                                  v-model="form.incidentAIAnalysisDepth"
                                  :options="AI_DEPTH_OPTIONS"
                                  option-label="label"
                                  option-value="value"
                                  :allow-empty="false"
                                  size="small"
                                />
                              </FormField>
                              <label class="toggle-label">
                                <Checkbox v-model="aiAutoAssign" :binary="true" />
                                Automatically assign incident to suggested owner
                              </label>
                              <FormField
                                label="Prompt for analysis (optional)"
                                class="field-col"
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
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="downtime" data-rule-section="downtime">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.downtime" tile />
                      <span>Downtime Control</span>
                      <span class="panel-summary">{{ downtimePanelSummary }}</span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <FormField label="Action" class="field-col" group>
                        <SelectButton
                          v-model="downtimeControl"
                          :options="DOWNTIME_OPTIONS"
                          option-label="label"
                          option-value="value"
                          :allow-empty="false"
                          size="small"
                        />
                      </FormField>
                      <FormField
                        v-if="downtimeControl !== 'none'"
                        label="Downtime tag"
                        class="field-col"
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

                <AccordionPanel value="pstorage" data-rule-section="pstorage">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.pstorage" tile />
                      <span>Persistent Storage</span>
                      <span class="panel-summary">
                        {{ setDeleteSummary(form.pstorageSetActions, form.pstorageDeleteActions) }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="set-delete">
                        <EppKeyTable
                          v-model="form.pstorageSetActions"
                          title="Set on match"
                          value-label="Value"
                          item-name="persistent storage entry"
                        />
                        <EppKeyTable
                          v-model="form.pstorageDeleteActions"
                          title="Delete on match"
                          item-name="persistent storage deletion"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="customattr" data-rule-section="customattr">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.customattr" tile />
                      <span>Custom Attributes</span>
                      <span class="panel-summary">
                        {{
                          setDeleteSummary(
                            form.customAttributeSetActions,
                            form.customAttributeDeleteActions,
                          )
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="set-delete">
                        <EppKeyTable
                          v-model="form.customAttributeSetActions"
                          title="Set on match"
                          key-label="Name"
                          value-label="Value"
                          item-name="custom attribute"
                        />
                        <EppKeyTable
                          v-model="form.customAttributeDeleteActions"
                          title="Delete on match"
                          key-label="Name"
                          item-name="custom attribute deletion"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="serveractions" data-rule-section="serveractions">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.serveractions" tile />
                      <span>Server Actions</span>
                      <span class="panel-summary">
                        {{
                          form.actions.length
                            ? countLabel(form.actions.length, 'action')
                            : NOT_CONFIGURED
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <div class="edit-table-card">
                        <table class="edit-table" aria-label="Server actions">
                          <colgroup>
                            <col />
                            <col class="edit-table__actions-col" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Action</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            <template v-for="(action, i) in form.actions" :key="i">
                              <tr>
                                <td>
                                  <div class="server-action-row">
                                    <ToggleSwitch v-model="action.active" size="small" />
                                    <span class="action-name">
                                      {{
                                        serverActionsMap[action.id]?.name ?? `Action #${action.id}`
                                      }}
                                    </span>
                                    <span
                                      v-if="!expandedActionRows.has(i) && actionRowHint(action)"
                                      class="action-hint"
                                    >
                                      {{ actionRowHint(action) }}
                                    </span>
                                    <Button
                                      :aria-label="
                                        expandedActionRows.has(i)
                                          ? 'Collapse action'
                                          : 'Expand action'
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
                                  </div>
                                </td>
                                <td class="edit-table__actions">
                                  <Button
                                    aria-label="Remove server action"
                                    icon="pi pi-trash"
                                    text
                                    rounded
                                    severity="danger"
                                    size="small"
                                    @click="removeServerAction(i)"
                                  />
                                </td>
                              </tr>
                              <tr v-if="expandedActionRows.has(i)">
                                <td colspan="2" class="row-details">
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
                                    <FormField
                                      label="Delay timer key"
                                      class="field-col"
                                      v-slot="{ id }"
                                    >
                                      <InputText
                                        :id="id"
                                        v-model="action.timerKey"
                                        placeholder="Timer key..."
                                        size="small"
                                        style="width: 100%"
                                      />
                                    </FormField>
                                    <FormField
                                      label="Snooze time (s)"
                                      class="field-col"
                                      v-slot="{ id }"
                                    >
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
                                </td>
                              </tr>
                            </template>
                          </tbody>
                          <tfoot>
                            <tr>
                              <td>
                                <Select
                                  v-model="selectedActionToAdd"
                                  :options="serverActionOptions"
                                  option-label="label"
                                  option-value="value"
                                  aria-label="Server action to add"
                                  placeholder="Select action to add..."
                                  filter
                                  size="small"
                                  class="edit-table__input"
                                />
                              </td>
                              <td class="edit-table__actions">
                                <Button
                                  aria-label="Add server action"
                                  icon="pi pi-plus"
                                  text
                                  rounded
                                  severity="secondary"
                                  size="small"
                                  :disabled="selectedActionToAdd == null"
                                  @click="addServerAction"
                                />
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel value="script" data-rule-section="script">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.script" tile />
                      <span>Script</span>
                      <span class="panel-summary">{{
                        form.actionScript ? 'Configured' : NOT_CONFIGURED
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

                <AccordionPanel value="timers" data-rule-section="timers">
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.timers" tile />
                      <span>Timer Cancellations</span>
                      <span class="panel-summary">
                        {{
                          form.timerCancellations.length
                            ? countLabel(form.timerCancellations.length, 'key')
                            : NOT_CONFIGURED
                        }}
                      </span>
                    </div>
                  </AccordionHeader>
                  <AccordionContent>
                    <div class="panel-content">
                      <EppKeyTable
                        v-model="form.timerCancellations"
                        key-label="Timer key"
                        item-name="timer cancellation"
                        class="key-list-narrow"
                      />
                    </div>
                  </AccordionContent>
                </AccordionPanel>

                <AccordionPanel
                  v-if="showAiAgentInstructions"
                  value="aiagent"
                  data-rule-section="aiagent"
                >
                  <AccordionHeader>
                    <div class="panel-header">
                      <EppActionIcon v-bind="sectionIcons.aiagent" tile />
                      <span>AI Assistant Instructions</span>
                      <span class="panel-summary">
                        {{ form.aiInstructions ? 'Configured' : NOT_CONFIGURED }}
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
                        Instructions given to the AI assistant when this rule processes an event.
                      </div>
                      <Textarea
                        v-model="form.aiInstructions"
                        placeholder="Instructions for the AI assistant..."
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

<style scoped src="./eppEditTable.css"></style>

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

.dependent > .ai-unavailable-note {
  align-self: flex-start;
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

.panel-tab {
  flex: 1;
  overflow: auto;
  background: var(--p-surface-ground);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* The form width of object Properties. Below the minimum the tab scrolls sideways rather than
   squeezing a field to nothing beside a fixed-width one. */
.panel-tab > * {
  width: 100%;
  min-width: 36rem;
  max-width: 1000px;
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
  container-type: inline-size;
}

/* Options that apply only while the checkbox above is ticked, lined up with its label. */
.dependent {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-left: 0.5rem;
  padding-left: calc(1.25rem - 2px);
  border-left: 2px solid var(--p-content-border-color);
}

.field-pair {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.field-grow {
  flex: 1;
  min-width: 0;
}

.field-select {
  flex: none;
  width: 240px;
}

.field-number {
  flex: none;
  width: 9rem;
}

.input-with-check {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.input-with-check__input {
  flex: 1;
  min-width: 0;
}

.input-with-check .toggle-label {
  flex: none;
  white-space: nowrap;
}

.set-delete {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.pick-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@container (max-width: 40rem) {
  .set-delete,
  .pick-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}

.item-cell {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.item-cell__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-frame-actions-col {
  width: 5rem;
}

.row-buttons {
  display: flex;
  justify-content: center;
}

/* One column of short keys: as wide as a Delete table beside a Set one. */
.key-list-narrow {
  max-width: max(16rem, calc((100% - 1rem) / 3));
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

.server-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
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

.edit-table .row-details {
  padding: 0.5rem 0.75rem 0.75rem;
  background: var(--p-surface-ground);
}

.tf-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0.25rem 0.25rem;
}

.tf-done-row {
  display: flex;
  justify-content: flex-end;
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
