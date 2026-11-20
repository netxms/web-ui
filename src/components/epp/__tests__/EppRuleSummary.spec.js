import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppRuleSummary from '@/components/epp/EppRuleSummary.vue'
import EppActionStrip from '@/components/epp/EppActionStrip.vue'
import { eppChainTarget } from '@/utils/routeTargets'
import {
  RF_ALL_SEVERITIES,
  RF_CREATE_INCIDENT,
  RF_GENERATE_ALARM,
  RF_NEGATED_SOURCE,
  RF_START_DOWNTIME,
  RF_STOP_PROCESSING,
  SEVERITY_TERMINATE,
} from '@/utils/eppRules'

const global = {
  plugins: [PrimeVue],
  directives: { tooltip: Tooltip },
  stubs: { ObjectIcon: true },
}

function makeRule(overrides = {}) {
  return {
    guid: 'rule-2',
    flags: RF_ALL_SEVERITIES,
    events: [],
    sources: [],
    sourceExclusions: [],
    timeFrames: [],
    actions: [],
    timerCancellations: [],
    chainCalls: [],
    pstorageSetActions: {},
    pstorageDeleteActions: [],
    customAttributeSetActions: {},
    customAttributeDeleteActions: [],
    ...overrides,
  }
}

const terminateAndMore = () =>
  makeRule({
    flags:
      RF_ALL_SEVERITIES |
      RF_NEGATED_SOURCE |
      RF_GENERATE_ALARM |
      RF_CREATE_INCIDENT |
      RF_START_DOWNTIME |
      RF_STOP_PROCESSING,
    events: [10, 11],
    sources: [100],
    sourceExclusions: [101],
    alarmSeverity: SEVERITY_TERMINATE,
    alarmKey: 'IF_UNEXP_UP_%i_%5',
    incidentDelay: 15,
    downtimeTag: 'test',
    actions: [{ id: 7, active: true }],
    chainCalls: [3],
  })

function mountSummary(rule, props = {}) {
  return mount(EppRuleSummary, {
    props: {
      rule,
      position: 2,
      ruleCount: 53,
      eventTemplates: {
        10: { name: 'SYS_IF_UP', severity: 0 },
        11: { name: 'SYS_IF_DOWN', severity: 2 },
      },
      objectsById: new Map([
        [100, { id: 100, name: 'dns.google', class: 'Node' }],
        [101, { id: 101, name: 'one.one.one.one', class: 'Node' }],
      ]),
      serverActions: { 7: { name: 'Send Telegram notification to DS' } },
      chainLabelFor: (id) => (id === 3 ? 'test-chain' : `Chain #${id}`),
      chainTargetFor: (id) => eppChainTarget(id),
      sectionTargetFor: (section) => eppChainTarget(0, { ruleGuid: 'rule-2', section }),
      ...props,
    },
    global,
  })
}

const stepTitles = (wrapper) => wrapper.findAll('.step__title').map((t) => t.text())

describe('EppRuleSummary', () => {
  it('lists every action as a step, in run order, ending in Stop processing', () => {
    const wrapper = mountSummary(terminateAndMore())
    expect(stepTitles(wrapper)).toEqual([
      'Terminate alarms',
      'Run',
      'Start downtime',
      'Enter chain',
      'Stop processing',
    ])
    expect(wrapper.text()).toContain('Send Telegram notification to DS')
    expect(wrapper.text()).toContain('Create incident after 15s')
    expect(wrapper.text()).toContain('No later rule sees this event')
  })

  it('links each step to its section of the rule editor', () => {
    const wrapper = mountSummary(terminateAndMore())
    const hrefs = wrapper.findAll('.step__title').map((a) => a.attributes('href'))
    expect(hrefs[0]).toContain('section=alarm')
    expect(hrefs[2]).toContain('section=downtime')
    expect(hrefs[4]).toContain('section=action-options')
    expect(hrefs[0]).toContain('rule-2')
  })

  it('links a chain call to the chain', () => {
    const wrapper = mountSummary(terminateAndMore())
    const chain = wrapper.find('.part-chain')
    expect(chain.text()).toBe('test-chain')
    expect(chain.attributes('href')).toContain('chain=3')
  })

  it('writes negation into the clause instead of striking names through', () => {
    const wrapper = mountSummary(terminateAndMore())
    const sources = wrapper.findAll('.clause')[1]
    expect(sources.find('.clause__not').text()).toBe('not')
    expect(sources.text()).toContain('dns.google')
    expect(sources.text()).toContain('except')
    expect(sources.text()).toContain('one.one.one.one')
    expect(wrapper.html()).not.toContain('line-through')
  })

  it('says where processing goes when the rule does not stop it', () => {
    const rule = makeRule({ events: [10] })
    expect(mountSummary(rule).find('.summary-end').text()).toBe('Continues to rule 3')
    expect(mountSummary(rule, { position: 53 }).find('.summary-end').text()).toContain(
      'processing of this event ends here',
    )
    expect(
      mountSummary(rule, { position: 53, inMainChain: false }).find('.summary-end').text(),
    ).toContain('the rule that called this chain carries on')
  })

  it('warns that a rule with an empty filter never matches', () => {
    const wrapper = mountSummary(makeRule())
    expect(wrapper.text()).toContain('Never matches')
    expect(wrapper.find('.clauses').exists()).toBe(false)
  })

  it('shows the errors the server reports, each linked to where it is fixed', () => {
    const wrapper = mountSummary(makeRule({ events: [10], errors: { missingAction: true } }))
    const link = wrapper.find('.summary-errors a')
    expect(link.text()).toBe('A server action no longer exists')
    expect(link.attributes('href')).toContain('section=serveractions')
  })

  it('ends a long list in a link to the editor', () => {
    const events = Array.from({ length: 20 }, (_, i) => 1000 + i)
    const wrapper = mountSummary(makeRule({ events }))
    expect(wrapper.findAll('.clause__chip')).toHaveLength(12)
    expect(wrapper.find('.clause__more').text()).toBe('and 8 more')
  })

  it('lays the same content out as a pipeline', () => {
    const wrapper = mountSummary(terminateAndMore(), { layout: 'pipeline' })
    expect(wrapper.classes()).toContain('epp-summary--pipeline')
    expect(stepTitles(wrapper)).toHaveLength(5)
  })
})

describe('EppActionStrip', () => {
  function mountStrip(rule) {
    return mount(EppActionStrip, {
      props: {
        rule,
        actionNameFor: (id) => (id === 7 ? 'Send Telegram notification to DS' : `Action #${id}`),
        chainLabelFor: () => 'test-chain',
        chainTargetFor: (id) => eppChainTarget(id),
      },
      global,
    })
  }

  it('shows one glyph per action, alarm add-ons included, chain links, then stop', () => {
    const wrapper = mountStrip(terminateAndMore())
    const labels = wrapper.findAll('[role="img"]').map((g) => g.attributes('aria-label'))
    expect(labels).toEqual([
      'Terminate alarms',
      'Create incident',
      'Run Send Telegram notification to DS',
      'Start downtime',
      'Stop processing',
    ])
    const chain = wrapper.find('a')
    expect(chain.text()).toBe('test-chain')
    expect(chain.attributes('href')).toContain('chain=3')
  })

  it('is empty for a rule that does nothing', () => {
    expect(mountStrip(makeRule()).text()).toBe('')
  })
})
