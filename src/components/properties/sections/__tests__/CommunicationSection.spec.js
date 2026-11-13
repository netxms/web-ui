import { describe, it, expect, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { adaptObject } from '@/api/objectAdapters'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

vi.mock('@/queries/useObjectQueries', () => ({
  useObjects: () => ({ data: ref([]) }),
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
  useObjectChildren: () => ({ data: ref([]), isFetching: ref(false) }),
}))
vi.mock('@/queries/useSshKeyQueries', () => ({ useSshKeys: () => ({ data: ref([]) }) }))

const CommunicationSection = (await import('../CommunicationSection.vue')).default

const ObjectPickerFieldStub = {
  name: 'ObjectPickerField',
  props: ['modelValue', 'emptyLabel', 'dialogTitle', 'perspectives', 'selectable'],
  template: '<div class="picker-stub" />',
}

// `webServiceProxy` comes with the protocol groups, so it marks a server that has them.
// `added` is what PropertiesView puts on a Node from the `/agent` and `/snmp` requests.
function mountSection(raw, { olderServer = false, added = {} } = {}) {
  const object = {
    ...adaptObject({
      id: 7,
      name: 'obj',
      ...(olderServer ? {} : { webServiceProxy: 0 }),
      ...raw,
    }),
    ...added,
  }
  const draft = reactive(JSON.parse(JSON.stringify(object)))
  const wrapper = mount(CommunicationSection, {
    props: { draft, object, sectionId: 'communication', sectionLabel: 'Communication' },
    global: {
      plugins: [PrimeVue],
      stubs: { ObjectPickerField: ObjectPickerFieldStub, SnmpAgentDialog: true },
    },
  })
  return { wrapper, draft }
}

const panelTitles = (wrapper) =>
  wrapper.findAll('.panel-header > span:first-child').map((s) => s.text())
const legends = (wrapper) => wrapper.findAll('legend').map((l) => l.text())

describe('CommunicationSection', () => {
  it('gives a node every legacy communication page, in the legacy (alphabetical) order', () => {
    const { wrapper } = mountSection(
      { class: 'Node', primaryName: '10.0.0.1' },
      {
        added: {
          agent: { port: 4700, proxy: 0 },
          snmp: { version: '2c', port: 161, proxy: 0, agents: [], trap: null },
        },
      },
    )
    expect(panelTitles(wrapper)).toEqual([
      'Agent',
      'EtherNet/IP',
      'ICMP',
      'Modbus',
      'MQTT',
      'NETCONF',
      'SNMP',
      'SNMP Agents',
      'SSH',
      'Syslog',
      'VNC',
      'Web Services',
    ])
    expect(legends(wrapper)).toEqual(['General'])
  })

  it('shows Agent and SNMP as loading until their requests answer', () => {
    const { wrapper } = mountSection({ class: 'Node', primaryName: '10.0.0.1' })
    expect(legends(wrapper)).toEqual(['General', 'Agent', 'SNMP'])
  })

  it('swaps the host name for 0.0.0.0 and back with "Node without IP address"', async () => {
    const { wrapper, draft } = mountSection({ class: 'Node', primaryName: 'gw.example.com' })
    const checkbox = () => wrapper.findAll('.flag-row input[type="checkbox"]')[0]

    await checkbox().setValue(true)
    expect(draft.primaryName).toBe('0.0.0.0')
    expect(wrapper.find('input.form-input').attributes('disabled')).toBeDefined()

    await checkbox().setValue(false)
    expect(draft.primaryName).toBe('gw.example.com')
  })

  it('flags an edited host name that is not one', async () => {
    const { wrapper, draft } = mountSection({ class: 'Node', primaryName: '10.0.0.1' })
    draft.primaryName = 'two words'
    await nextTick()
    expect(wrapper.text()).toContain('Not a valid host name or IP address.')
  })

  it('gives a chassis its controller and web service proxy', () => {
    const { wrapper } = mountSection({ class: 'Chassis', controllerId: 3 })
    expect(legends(wrapper)).toEqual(['Controller', 'Web Services'])
    expect(wrapper.text()).toContain('Bind chassis object under controller node object')
    expect(panelTitles(wrapper)).toEqual([])
  })

  it('gives a sensor its Modbus unit ID', () => {
    const { wrapper } = mountSection({ class: 'Sensor', modbus: { unitId: 4 } })
    expect(legends(wrapper)).toEqual(['Modbus', 'Web Services'])
  })

  it('gives any other data collection target only the web service proxy', () => {
    const { wrapper } = mountSection({ class: 'Room' })
    expect(legends(wrapper)).toEqual(['Web Services'])
    expect(wrapper.find('.picker-stub').exists()).toBe(true)
  })

  it('offers nothing a server without the protocol groups would drop, host name aside', () => {
    const node = mountSection(
      { class: 'Node', primaryName: '10.0.0.1' },
      { olderServer: true },
    ).wrapper
    expect(panelTitles(node)).toEqual([])
    expect(node.text()).toContain('This server does not report the external gateway flag')
    const [withoutIp, gateway] = node.findAll('.flag-row input[type="checkbox"]')
    expect(withoutIp.attributes('disabled')).toBeUndefined()
    expect(gateway.attributes('disabled')).toBeDefined()
    expect(node.find('input.form-input').attributes('disabled')).toBeUndefined()

    const room = mountSection({ class: 'Room' }, { olderServer: true }).wrapper
    expect(room.find('.picker-stub').exists()).toBe(false)
    expect(room.text()).toContain('does not report the web service proxy')
  })
})
