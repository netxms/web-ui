import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AiObservationPanel from '@/components/ai/AiObservationPanel.vue'

const observation = {
  id: 7,
  timestamp: '2026-10-24T19:14:50Z',
  instanceId: 1,
  operatorName: 'Night shift',
  severity: 2,
  title: 'sw-lab-1 still critical',
  body: 'Node status remains Critical.\nFa0/4 is still down.',
  objectId: 10,
  object: { id: 10, name: 'sw-lab-1', class: 'Node' },
  objectName: 'sw-lab-1',
  references: ['747931', 'check:3:Uplink state'],
  state: 'new',
}

function mountPanel(overrides = {}, props = {}) {
  return mount(AiObservationPanel, {
    props: { visible: true, observation: { ...observation, ...overrides }, ...props },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { AppLink: { name: 'AppLink', props: ['to'], template: '<a><slot /></a>' } },
    },
  })
}

const rowText = (wrapper, label) =>
  wrapper
    .findAll('.record-row')
    .find((row) => row.find('dt').text() === label)
    .find('dd')
    .text()

const buttonLabels = (wrapper) =>
  wrapper.findAll('.record-footer button').map((button) => button.text())

beforeEach(() => localStorage.clear())

describe('AiObservationPanel', () => {
  it('shows what the legacy details dialog shows', () => {
    const wrapper = mountPanel()

    expect(wrapper.find('.observation-title').text()).toBe('sw-lab-1 still critical')
    expect(rowText(wrapper, 'Severity')).toBe('Minor')
    expect(rowText(wrapper, 'State')).toBe('New')
    expect(rowText(wrapper, 'Operator')).toBe('Night shift')
    expect(rowText(wrapper, 'Object')).toBe('sw-lab-1')
    expect(wrapper.find('.observation-body').text()).toContain('Fa0/4 is still down.')
  })

  it('links to the object, styled as a link', () => {
    const link = mountPanel().findComponent({ name: 'AppLink' })

    expect(link.classes()).toContain('object-link')
    expect(link.text()).toBe('sw-lab-1')
    expect(link.props('to')).toMatchObject({ params: { objectId: 10 } })
  })

  it('names the server for an observation about no object', () => {
    const wrapper = mountPanel({ objectId: 0, object: null, objectName: '' })

    expect(wrapper.find('.object-link').exists()).toBe(false)
    expect(rowText(wrapper, 'Object')).toBe('Server')
  })

  it('lists references as text, with a check by its name', () => {
    const items = mountPanel()
      .findAll('.observation-references li')
      .map((item) => item.text())

    expect(items).toEqual(['747931', 'Check: Uplink state'])
  })

  it('leaves out the sections an observation has nothing for', () => {
    const wrapper = mountPanel({ body: null, references: null })

    expect(wrapper.find('.observation-body').exists()).toBe(false)
    expect(wrapper.find('.observation-references').exists()).toBe(false)
  })

  it('still reads for an untitled observation', () => {
    expect(mountPanel({ title: null }).find('.observation-title').text()).toBe(
      'Untitled observation',
    )
  })

  it.each([
    ['new', ['Acknowledge', 'Dismiss']],
    ['acknowledged', ['Mark as new', 'Dismiss']],
    ['dismissed', ['Mark as new', 'Acknowledge']],
  ])('offers the moves out of %s', (state, labels) => {
    expect(buttonLabels(mountPanel({ state }))).toEqual(labels)
  })

  it('asks for the state a button names', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.record-footer button').trigger('click')

    expect(wrapper.emitted('set-state')).toEqual([['acknowledged']])
  })

  it('holds the buttons while a change is in flight', () => {
    const wrapper = mountPanel({}, { pending: true })

    expect(wrapper.find('.record-footer button').attributes('disabled')).toBeDefined()
  })

  it('remembers a dragged width in this browser', async () => {
    const wrapper = mountPanel()
    expect(wrapper.attributes('style')).toContain('560px')

    await wrapper.find('.record-resize-handle').trigger('mousedown', { clientX: 800 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    await wrapper.vm.$nextTick()

    expect(wrapper.attributes('style')).toContain('760px')
    expect(JSON.parse(localStorage.getItem('netxms.prefs')).aiObservationPanelWidth).toBe(760)
    expect(mountPanel().attributes('style')).toContain('760px')
  })

  it('renders nothing but its frame before a first observation is picked', () => {
    const wrapper = mount(AiObservationPanel, {
      props: { visible: false, observation: null },
      global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
    })

    expect(wrapper.find('.observation-title').exists()).toBe(false)
    expect(wrapper.find('.record-footer').exists()).toBe(false)
  })
})
