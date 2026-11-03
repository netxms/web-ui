import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppRuleDetailView from '@/components/epp/EppRuleDetailView.vue'
import { SERVER_COMPONENTS } from '@/config/serverComponents'

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
// AI agent instructions crash an unfixed netxmsd without the AI assistant, so AI settings are
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
vi.mock('@/queries/useScriptQueries', () => ({ useScriptLibrary: () => ({ data: ref([]) }) }))
vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))

const RF_GENERATE_ALARM = 0x000008
const RF_ADD_AI_COMMENT = 0x040000
const RF_CREATE_INCIDENT = 0x080000
const RF_AI_ANALYZE_INCIDENT = 0x100000

const AI_COMMENT_LABEL = "Add AI assistant's comment on alarm creation"
const AI_INCIDENT_LABEL = 'Perform AI-based incident analysis'
const AI_INSTRUCTIONS_LABEL = 'AI Agent Instructions'
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
    aiAgentInstructions: '',
    ...overrides,
  }
}

function mountEditor(rule, components) {
  serverComponents.value = components
  return mount(EppRuleDetailView, {
    props: { rule },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: {
        EntityDetailHeader: true,
        NxslScriptEditor: true,
        ObjectPickerDialog: true,
        EventPickerDialog: true,
        EppRuleChainCalls: true,
      },
    },
  })
}

const noteCount = (wrapper) => wrapper.text().split(UNAVAILABLE_NOTE).length - 1

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

  it('keeps AI agent instructions the rule already has visible, with a note', () => {
    const rule = makeRule({ aiAgentInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, ['CORE'])
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
    expect(wrapper.text()).toContain('so these instructions cannot run')
    expect(
      wrapper.find('textarea[placeholder="Instructions for the AI agent..."]').element.value,
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

  it('does not hide AI agent instructions while they are being cleared', async () => {
    const rule = makeRule({ aiAgentInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, ['CORE'])
    await wrapper.find('textarea[placeholder="Instructions for the AI agent..."]').setValue('')
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
  })

  it('hides the note until server-info has answered', async () => {
    serverInfoLoading.value = true
    const rule = makeRule({ aiAgentInstructions: 'Summarize the outage' })
    const wrapper = mountEditor(rule, [])
    expect(wrapper.text()).toContain(AI_INSTRUCTIONS_LABEL)
    expect(noteCount(wrapper)).toBe(0)

    serverComponents.value = [SERVER_COMPONENTS.AI_ASSISTANT]
    serverInfoLoading.value = false
    await nextTick()
    expect(noteCount(wrapper)).toBe(0)
  })
})
