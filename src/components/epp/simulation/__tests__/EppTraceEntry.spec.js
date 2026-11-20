import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppTraceEntry from '@/components/epp/simulation/EppTraceEntry.vue'
import { simulateEvent, skipReasonText } from '@/utils/eppSimulator'
import { RF_ALL_SEVERITIES, RF_GENERATE_ALARM, RF_STOP_PROCESSING } from '@/utils/eppRules'

const CHAIN_NAMES = { 0: 'Main', 5: 'Escalation' }

function rule(guid, fields = {}) {
  return {
    guid,
    comments: `Rule ${guid}`,
    flags: RF_ALL_SEVERITIES,
    events: [1],
    chainCalls: [],
    ...fields,
  }
}

function trace(chains, scriptOutcome) {
  return simulateEvent({
    chains: new Map(Object.entries(chains).map(([id, rules]) => [Number(id), rules])),
    event: { code: 1, severity: 4, sourceId: null, correlated: false },
    now: new Date(2026, 10, 20, 10, 0),
    ancestorsOf: () => null,
    scriptOutcome,
  })
}

function mountEntry(t, chains) {
  const rules = new Map(
    Object.values(chains)
      .flat()
      .map((r) => [r.guid, r]),
  )
  return mount(EppTraceEntry, {
    props: {
      trace: t,
      entryIndex: 0,
      ruleFor: (_chainId, guid) => rules.get(guid) ?? null,
      chainLabelFor: (id) => CHAIN_NAMES[id] ?? `Chain #${id}`,
      actionNameFor: (id) => `Action ${id}`,
      reasonFor: (visit) => skipReasonText(visit),
      noteFor: () => '',
    },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

describe('EppTraceEntry', () => {
  const chains = {
    0: [
      rule('a', { events: [9] }),
      rule('b', { events: [9] }),
      rule('c', { flags: RF_ALL_SEVERITIES | RF_GENERATE_ALARM, chainCalls: [5] }),
      rule('d'),
    ],
    5: [rule('e', { flags: RF_ALL_SEVERITIES | RF_STOP_PROCESSING })],
  }

  it('folds a run of skipped rules and opens it with the reasons', async () => {
    const wrapper = mountEntry(trace(chains), chains)
    const fold = wrapper.find('.trace-fold')
    expect(fold.text()).toBe('2 rules skipped')
    expect(wrapper.text()).not.toContain('Rule a')

    await fold.trigger('click')
    expect(fold.attributes('aria-expanded')).toBe('true')
    const first = wrapper.find('.trace-fold__list li')
    expect(first.find('.trace-rule__name').text()).toBe('#1 Rule a')
    expect(first.find('.trace-reason').text()).toBe("event not in the rule's list")
  })

  it('draws a called chain inside the rule that called it, then the stop', () => {
    const wrapper = mountEntry(trace(chains), chains)
    const nested = wrapper.findAll('.trace-entry--nested')
    expect(nested).toHaveLength(1)
    const head = nested[0].find('.trace-entry__head')
    expect(head.find('.trace-entry__chain').text()).toBe('Escalation')
    expect(head.text()).toContain('called from Main rule 3')
    expect(nested[0].text()).toContain('#1 Rule e')
    expect(nested[0].text()).toContain('Stop processing')
    expect(wrapper.text()).toContain('Rule 4 not reached')
  })

  it('says where the event goes after a chain that ran to its end', () => {
    const open = { 0: [rule('x', { chainCalls: [5] })], 5: [rule('y')] }
    const text = mountEntry(trace(open), open).text()
    expect(text).toContain('End of Escalation: back to Main rule 1')
    expect(text).toContain('End of Main: processing ends')
  })

  it('leaves out the end lines when processing stopped inside', () => {
    const text = mountEntry(trace(chains), chains).text()
    expect(text).not.toContain('End of')
  })

  it('names a call skipped as a loop', () => {
    const looped = { 0: [rule('x', { chainCalls: [5] })], 5: [rule('y', { chainCalls: [0] })] }
    expect(mountEntry(trace(looped), looped).text()).toContain(
      'Call to Main skipped: the chain is already running for this event',
    )
  })

  it('asks to open a rule and to flip a script assumption', async () => {
    const scripted = { 0: [rule('s', { filterScript: 'return true;' })] }
    const wrapper = mountEntry(trace(scripted), scripted)
    expect(wrapper.text()).toContain('Filter script assumed to match')

    await wrapper.find('.trace-rule__name').trigger('click')
    expect(wrapper.emitted('open-rule')).toEqual([[{ chainId: 0, ruleGuid: 's' }]])

    const flip = wrapper.findAll('button').find((b) => b.text() === 'Assume it does not')
    await flip.trigger('click')
    expect(wrapper.emitted('toggle-script')).toEqual([['s']])
  })

  it('says a script skip once, on its assumption line', () => {
    const scripted = { 0: [rule('s', { filterScript: 'return false;' })] }
    const wrapper = mountEntry(
      trace(scripted, () => 'no-match'),
      scripted,
    )
    expect(wrapper.find('.trace-reason').exists()).toBe(false)
    expect(wrapper.find('.trace-assumption').text()).toContain('Filter script assumed not to match')
  })
})
