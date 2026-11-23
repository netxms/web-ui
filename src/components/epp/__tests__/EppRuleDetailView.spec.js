import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppRuleDetailView from '@/components/epp/EppRuleDetailView.vue'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import {
  RF_ALL_SEVERITIES,
  RF_NEGATED_EVENTS,
  RF_NEGATED_SOURCE,
  RF_NEGATED_TIME_FRAMES,
  RF_SEVERITY_CRITICAL,
  RF_SEVERITY_MAJOR,
} from '@/utils/eppRules'

// jsdom has neither; PrimeVue components bind both on mount.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
const scrollIntoView = vi.fn()
Element.prototype.scrollIntoView = scrollIntoView
// AI assistant instructions crash an unfixed netxmsd without the AI assistant, so AI settings are
// not offered there, but a rule that already has one must still show it.
const serverComponents = ref([])
const serverInfoLoading = ref(false)

vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({
    components: serverComponents,
    isLoading: serverInfoLoading,
    has: (id) => serverComponents.value.includes(id),
  }),
}))

vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))
vi.mock('@/queries/useServerActionQueries', () => ({ useServerActions: () => ({ data: ref([]) }) }))
vi.mock('@/queries/useAlarmCategoryQueries', () => ({
  useAlarmCategories: () => ({ data: ref([]) }),
}))
const scriptLibrary = ref([])
vi.mock('@/queries/useScriptQueries', () => ({ useScriptLibrary: () => ({ data: scriptLibrary }) }))
vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))

const RF_GENERATE_ALARM = 0x000008
const RF_ADD_AI_COMMENT = 0x040000
const RF_CREATE_INCIDENT = 0x080000
const RF_AI_ANALYZE_INCIDENT = 0x100000
const RF_START_DOWNTIME = 0x010000
const SEVERITY_TERMINATE = 6

const AI_COMMENT_LABEL = "Add AI assistant's comment on alarm creation"
const AI_INCIDENT_LABEL = 'Perform AI-based incident analysis'
const AI_INSTRUCTIONS_LABEL = 'AI Assistant Instructions'
const UNAVAILABLE_NOTE = 'The AI assistant is not available on this server'

/** Generates an alarm and an incident, so both AI checkboxes can render. */
function makeRule(overrides = {}) {
  return {
    guid: 'rule-1',
    ruleNumber: 1,
    comments: 'test rule',
    flags: RF_GENERATE_ALARM | RF_CREATE_INCIDENT,
    sources: [],
    sourceExclusions: [],
    events: [],
    actions: [],
    timeFrames: [],
    timerCancellations: [],
    chainCalls: [],
    alarmCategories: [],
    pstorageSetActions: {},
    pstorageDeleteActions: [],
    customAttributeSetActions: {},
    customAttributeDeleteActions: [],
    aiInstructions: '',
    ...overrides,
  }
}

function mountEditor(rule, components, extraProps = {}) {
  serverComponents.value = components
  return mount(EppRuleDetailView, {
    props: { rule, ...extraProps },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: {
        EntityDetailHeader: { template: '<div><slot name="actions" /></div>' },
        NxslScriptEditor: true,
        ObjectPickerDialog: true,
        EventPickerDialog: true,
        EppRuleChainCalls: true,
      },
    },
  })
}

const noteCount = (wrapper) => wrapper.text().split(UNAVAILABLE_NOTE).length - 1

const section = (wrapper, name) => wrapper.find(`[data-rule-section="${name}"]`)
const header = (wrapper, name) => section(wrapper, name).find('.panel-header')
const isOpen = (wrapper, name) =>
  section(wrapper, name).find('.p-accordionheader').attributes('aria-expanded') === 'true'

async function saveAndGet(wrapper) {
  const save = wrapper.findAll('button').find((b) => b.text() === 'Save')
  await save.trigger('click')
  return wrapper.emitted('saved')[0][0]
}

describe('EppRuleDetailView AI settings', () => {
  beforeEach(() => {
    serverInfoLoading.value = false
  })

  it('offers every AI setting on a server with the AI assistant, with no note', () => {
    const wrapper = mountEditor(makeRule(), ['CORE', SERVER_COMPONENTS.AI_ASSISTANT])
    const text = wrapper.text()
    expect(text).toContain(AI_COMMENT_LABEL)
    expect(text).toContain(AI_INCIDENT_LABEL)
    expect(text).toContain(AI_INSTRUCTIONS_LABEL)
    expect(noteCount(wrapper)).toBe(0)
  })

  it('offers no AI setting the rule does not use on a server without the assistant', () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    const text = wrapper.text()
    expect(text).not.toContain(AI_COMMENT_LABEL)
    expect(text).not.toContain(AI_INCIDENT_LABEL)
    expect(text).not.toContain(AI_INSTRUCTIONS_LABEL)
  })

  it('offers no AI setting when creating a rule on a server without the assistant', () => {
    const wrapper = mountEditor(null, ['CORE'])
    expect(wrapper.text()).not.toContain(AI_INSTRUCTIONS_LABEL)
    expect(wrapper.text()).not.toContain(AI_COMMENT_LABEL)
  })

  it('keeps AI assistant instructions the rule already has visible, with a note', () => {
    const rule = makeRule({ aiInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, ['CORE'])
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
    expect(wrapper.text()).toContain('so these instructions cannot run')
    expect(
      wrapper.find('textarea[placeholder="Instructions for the AI assistant..."]').element.value,
    ).toBe('Summarize the outage')
  })

  it('keeps AI flags the rule already has visible, each with a note', () => {
    const rule = makeRule({
      flags: RF_GENERATE_ALARM | RF_CREATE_INCIDENT | RF_ADD_AI_COMMENT | RF_AI_ANALYZE_INCIDENT,
    })
    const wrapper = mountEditor(rule, ['CORE'])
    expect(wrapper.text()).toContain(AI_COMMENT_LABEL)
    expect(wrapper.text()).toContain(AI_INCIDENT_LABEL)
    expect(noteCount(wrapper)).toBe(2)
  })

  it('does not hide AI assistant instructions while they are being cleared', async () => {
    const rule = makeRule({ aiInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, ['CORE'])
    await wrapper.find('textarea[placeholder="Instructions for the AI assistant..."]').setValue('')
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
  })

  it('hides the note until server-info has answered', async () => {
    serverInfoLoading.value = true
    const rule = makeRule({ aiInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, [])
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
    expect(noteCount(wrapper)).toBe(0)

    serverComponents.value = [SERVER_COMPONENTS.AI_ASSISTANT]
    serverInfoLoading.value = false
    await nextTick()
    expect(noteCount(wrapper)).toBe(0)
  })
})

describe('EppRuleDetailView AI assistant instructions', () => {
  const AI = ['CORE', SERVER_COMPONENTS.AI_ASSISTANT]
  const textarea = (wrapper) =>
    wrapper.find('textarea[placeholder="Instructions for the AI assistant..."]')

  it('saves an edit under the name the server reads first, and the old one', async () => {
    const wrapper = mountEditor(makeRule({ aiInstructions: 'Summarize the outage' }), AI)
    expect(textarea(wrapper).element.value).toBe('Summarize the outage')

    await textarea(wrapper).setValue('Find the root cause')
    const saved = await saveAndGet(wrapper)
    expect(saved.aiInstructions).toBe('Find the root cause')
    expect(saved.aiAgentInstructions).toBe('Find the root cause')
  })

  it('reads instructions from a server that still sends the old name', () => {
    const rule = makeRule({
      aiInstructions: undefined,
      aiAgentInstructions: 'Summarize the outage',
    })
    const wrapper = mountEditor(rule, AI)
    expect(textarea(wrapper).element.value).toBe('Summarize the outage')
  })
})

describe('EppRuleDetailView section', () => {
  const selectedTab = (wrapper) => wrapper.find('[role="tab"][aria-selected="true"]').text()

  it('opens on the General tab by default', () => {
    expect(selectedTab(mountEditor(makeRule(), ['CORE']))).toBe('General')
  })

  it('opens on the tab and panel a summary linked to, scrolled into view', async () => {
    scrollIntoView.mockClear()
    const wrapper = mountEditor(makeRule(), ['CORE'], { section: 'timers' })
    await nextTick()
    await nextTick()
    expect(selectedTab(wrapper)).toBe('Action')
    const panel = wrapper.find('[data-rule-section="timers"]')
    expect(panel.find('[aria-expanded="true"]').exists()).toBe(true)
    expect(scrollIntoView.mock.contexts[0]).toBe(panel.element)
  })

  it('opens condition sections on the Condition tab, expanded', async () => {
    const wrapper = mountEditor(makeRule(), ['CORE'], { section: 'sources' })
    await nextTick()
    expect(selectedTab(wrapper)).toBe('Condition')
    expect(isOpen(wrapper, 'sources')).toBe(true)
  })
})

describe('EppRuleDetailView Action tab', () => {
  const button = (wrapper, name, label) =>
    section(wrapper, name)
      .findAll('button')
      .find((b) => b.text() === label)

  it('switches the alarm action with the segmented buttons', async () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    await button(wrapper, 'alarm', 'Terminate').trigger('click')
    expect(section(wrapper, 'alarm').text()).toContain('Terminate all alarms with key')
    expect(header(wrapper, 'alarm').text()).toContain('Terminate alarms')

    const saved = await saveAndGet(wrapper)
    expect(saved.alarmSeverity).toBe(SEVERITY_TERMINATE)
    expect(saved.flags & RF_GENERATE_ALARM).toBeTruthy()
  })

  it('switches downtime control with the segmented buttons', async () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    await button(wrapper, 'downtime', 'Start').trigger('click')
    const saved = await saveAndGet(wrapper)
    expect(saved.flags & RF_START_DOWNTIME).toBeTruthy()
  })

  it('saves a persistent storage entry added in its table', async () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    const [key, value] = section(wrapper, 'pstorage').findAll('tfoot input')
    await key.setValue('site')
    await value.setValue('riga')
    await value.trigger('keyup', { key: 'Enter' })
    expect(header(wrapper, 'pstorage').text()).toContain('1 set, 0 delete')

    const saved = await saveAndGet(wrapper)
    expect(saved.pstorageSetActions).toEqual({ site: 'riga' })
  })

  it('greys the icon of a section that does nothing and says so', () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    expect(header(wrapper, 'timers').text()).toContain('Not configured')
    expect(header(wrapper, 'timers').find('.epp-action-icon--muted').exists()).toBe(true)
    expect(header(wrapper, 'alarm').find('.epp-action-icon--muted').exists()).toBe(false)
  })

  describe('root cause analysis script', () => {
    const shown = (wrapper) =>
      section(wrapper, 'alarm')
        .findAll('.p-select-label')
        .map((label) => label.text())

    beforeEach(() => {
      scriptLibrary.value = [
        { id: 5, name: 'BackupVerify' },
        { id: 6, name: 'HealthCheck' },
      ]
    })

    it('shows the script the rule names', () => {
      const wrapper = mountEditor(makeRule({ rootCauseAnalysisScript: 'HealthCheck' }), ['CORE'])
      expect(shown(wrapper)).toContain('HealthCheck')
    })

    it('still shows a script since deleted from the library', () => {
      const wrapper = mountEditor(makeRule({ rootCauseAnalysisScript: 'Gone' }), ['CORE'])
      expect(shown(wrapper)).toContain('Gone')
    })

    it('shows "(none)" for a rule without one, sent as null or empty', () => {
      for (const value of [null, '']) {
        const wrapper = mountEditor(makeRule({ rootCauseAnalysisScript: value }), ['CORE'])
        expect(shown(wrapper)).toContain('(none)')
      }
    })
  })

  it('counts keys and actions in words', () => {
    const wrapper = mountEditor(
      makeRule({ timerCancellations: ['t1', 't2'], actions: [{ id: 7, active: true }] }),
      ['CORE'],
    )
    expect(header(wrapper, 'timers').text()).toContain('2 keys')
    expect(header(wrapper, 'serveractions').text()).toContain('1 action')
    expect(header(wrapper, 'serveractions').text()).not.toContain('1 actions')
  })
})

describe('EppRuleDetailView Condition tab', () => {
  const FRAME_8_TO_17 = { time: 8001700, date: 0 }

  it('opens only the sections that narrow the match', () => {
    const wrapper = mountEditor(makeRule({ events: [28] }), ['CORE'])
    expect(isOpen(wrapper, 'events')).toBe(true)
    expect(isOpen(wrapper, 'sources')).toBe(false)
    expect(isOpen(wrapper, 'time')).toBe(false)
  })

  it('says what an untouched section matches, with a grey icon', () => {
    const wrapper = mountEditor(makeRule({ flags: RF_GENERATE_ALARM | RF_ALL_SEVERITIES }), [
      'CORE',
    ])
    const expected = {
      events: 'Any event',
      sources: 'Any object',
      severity: 'Any severity',
      time: 'Any time',
      'filter-script': 'Not configured',
    }
    for (const [name, text] of Object.entries(expected)) {
      expect(header(wrapper, name).text()).toContain(text)
      expect(header(wrapper, name).find('.epp-action-icon--muted').exists()).toBe(true)
    }
  })

  it('words each list the way the rule summary does', () => {
    const rule = makeRule({
      flags:
        RF_GENERATE_ALARM |
        RF_NEGATED_SOURCE |
        RF_NEGATED_TIME_FRAMES |
        RF_SEVERITY_MAJOR |
        RF_SEVERITY_CRITICAL,
      events: [28],
      sources: [1, 2, 3],
      sourceExclusions: [4],
      timeFrames: [FRAME_8_TO_17],
    })
    const wrapper = mountEditor(rule, ['CORE'])
    expect(header(wrapper, 'events').text()).toContain('#28')
    expect(header(wrapper, 'sources').text()).toContain('Not one of 3 objects, except 1 object')
    expect(header(wrapper, 'severity').text()).toContain('Major, Critical')
    expect(header(wrapper, 'time').text()).toContain('Outside 1 time frame')
    expect(header(wrapper, 'time').find('.epp-action-icon--muted').exists()).toBe(false)
  })

  it('keeps the inverse option of an empty list that has it, and says nothing matches', () => {
    const wrapper = mountEditor(makeRule({ flags: RF_GENERATE_ALARM | RF_NEGATED_EVENTS }), [
      'CORE',
    ])
    expect(header(wrapper, 'events').text()).toContain('Nothing matches')
    expect(section(wrapper, 'events').text()).toContain(
      'Inverse rule (match events not listed below)',
    )
  })

  it('offers no inverse option for an empty list', () => {
    const wrapper = mountEditor(makeRule(), ['CORE'])
    expect(section(wrapper, 'events').text()).not.toContain('Inverse rule')
    expect(section(wrapper, 'events').text()).toContain('Any event')
  })

  it('draws each event in its table with a severity icon', () => {
    const wrapper = mountEditor(makeRule({ events: [28, 29] }), ['CORE'])
    expect(section(wrapper, 'events').findAll('tbody .status-icon')).toHaveLength(2)
  })

  it('removes an event from its table', async () => {
    const wrapper = mountEditor(makeRule({ events: [28, 29] }), ['CORE'])
    await section(wrapper, 'events').find('button[aria-label="Remove event #29"]').trigger('click')
    const saved = await saveAndGet(wrapper)
    expect(saved.events).toEqual([28])
  })

  it('opens a time frame for editing in the row below it', async () => {
    const wrapper = mountEditor(makeRule({ timeFrames: [FRAME_8_TO_17] }), ['CORE'])
    expect(section(wrapper, 'time').text()).not.toContain('Days of week')
    await section(wrapper, 'time').find('button[aria-label="Edit time frame"]').trigger('click')
    expect(section(wrapper, 'time').text()).toContain('Days of week')
  })
})
