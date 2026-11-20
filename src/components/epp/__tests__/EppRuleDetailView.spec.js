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

  async function saveAndGet(wrapper) {
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await save.trigger('click')
    return wrapper.emitted('saved')[0][0]
  }

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

  it('opens condition sections on the Condition tab', async () => {
    const wrapper = mountEditor(makeRule(), ['CORE'], { section: 'sources' })
    await nextTick()
    expect(selectedTab(wrapper)).toBe('Condition')
  })
})
