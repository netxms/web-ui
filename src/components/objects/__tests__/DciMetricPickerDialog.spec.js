import { afterEach, describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

function listQuery(rows) {
  return {
    data: ref(rows),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }
}

vi.mock('@/queries/useScriptQueries', () => ({
  useScriptLibrary: () => listQuery([{ id: 7, name: 'Discover::Volumes' }]),
}))

vi.mock('@/queries/useWebServiceQueries', () => ({
  useWebServiceDefinitions: () =>
    listQuery([{ id: 3, name: 'Weather', url: 'https://example.test/api' }]),
}))

// Swapped per test: the OTLP list, or a 404 from a server without the OTLP module.
let otlpQuery = null
vi.mock('@/queries/useDciConfigQueries', () => ({
  useOtlpMetrics: () => otlpQuery,
}))

const { default: DciMetricPickerDialog } = await import('../DciMetricPickerDialog.vue')

/** Mounted closed, then opened, as the tabs drive it. */
async function openDialog(props) {
  const wrapper = mount(DciMetricPickerDialog, {
    props: { visible: false, ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue] },
  })
  await wrapper.setProps({ visible: true })
  // PrimeVue's Dialog mounts its teleported content a tick after it opens.
  await nextTick()
  return wrapper
}

function bodyRows() {
  return [...document.querySelectorAll('.app-table tbody tr')]
}

function rowWith(text) {
  return bodyRows().find((tr) => tr.textContent.includes(text))
}

async function filter(value) {
  const input = document.querySelector('input[data-filter-input]')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('DciMetricPickerDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists the internal metrics that apply to the owner', async () => {
    await openDialog({ kind: 'internalMetric', object: { class: 'Node', capabilities: {} } })
    const text = document.body.textContent
    expect(text).toContain('ICMP.PacketLoss')
    expect(text).not.toContain('Server.Uptime')
  })

  it('picks a metric with its description and data type', async () => {
    const wrapper = await openDialog({ kind: 'internalMetric', object: { class: 'Template' } })
    await filter('server uptime')
    expect(bodyRows()).toHaveLength(1)
    bodyRows()[0].click()
    expect(wrapper.emitted('select')).toEqual([
      [{ name: 'Server.Uptime', description: 'Server uptime', dataType: 'uint32' }],
    ])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  it('picks a table with its instance columns', async () => {
    const wrapper = await openDialog({ kind: 'internalTable', object: null })
    rowWith('Topology.OSPF.Neighbors').click()
    expect(wrapper.emitted('select')[0][0]).toEqual({
      name: 'Topology.OSPF.Neighbors',
      description: 'OSPF neighbors',
      dataType: null,
      instanceColumn: 'ROUTER_ID, IP_ADDRESS',
    })
  })

  it('picks a library script by name', async () => {
    const wrapper = await openDialog({ kind: 'script' })
    rowWith('Discover::Volumes').click()
    expect(wrapper.emitted('select')[0][0]).toMatchObject({
      name: 'Discover::Volumes',
      dataType: 'string',
    })
  })

  it('lists OTLP metrics with type and attribute keys, picked as floating point', async () => {
    otlpQuery = listQuery([
      { name: 'http.server.duration', type: 'histogram', attributeKeys: ['route', 'method'] },
    ])
    const wrapper = await openDialog({ kind: 'otlp', object: { id: 12, class: 'Node' } })
    const row = rowWith('http.server.duration')
    expect(row.textContent).toContain('Histogram')
    expect(row.textContent).toContain('route, method')
    row.click()
    expect(wrapper.emitted('select')[0][0]).toEqual({
      name: 'http.server.duration',
      description: 'http.server.duration',
      dataType: 'float',
      instanceColumn: '',
      attributeKeys: ['route', 'method'],
    })
  })

  it('says the server has no OTLP module when the route is missing', async () => {
    otlpQuery = {
      ...listQuery(undefined),
      isError: ref(true),
      error: ref({ status: 404, message: 'Request failed: 404' }),
    }
    await openDialog({ kind: 'otlp', object: { id: 12, class: 'Node' } })
    expect(document.body.textContent).toContain('no OTLP module')
  })

  it('picks a web service as a request awaiting its path', async () => {
    const wrapper = await openDialog({ kind: 'webService' })
    expect(document.body.textContent).toContain('https://example.test/api')
    rowWith('Weather').click()
    expect(wrapper.emitted('select')[0][0]).toMatchObject({
      name: 'Weather:',
      description: 'Weather',
    })
  })
})
