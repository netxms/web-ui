import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { ref, nextTick, toValue } from 'vue'
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
// Swapped per test; `availableArgs` keeps the getters the dialog passed.
let availableQuery = null
let availableArgs = null
vi.mock('@/queries/useDciConfigQueries', () => ({
  useOtlpMetrics: () => otlpQuery,
  useAvailableMetrics: (objectId, source) => {
    availableArgs = { objectId, source }
    return availableQuery
  },
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

function refusedQuery(status) {
  return {
    ...listQuery(undefined),
    isError: ref(true),
    error: ref({ status, message: `Request failed: ${status}` }),
  }
}

describe('DciMetricPickerDialog', () => {
  beforeEach(() => {
    availableQuery = listQuery(undefined)
  })

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

  describe('agent and device driver lists', () => {
    const reported = {
      metrics: [
        { name: 'System.CPU.Usage', description: 'CPU usage', dataType: 'float' },
        { name: 'FileSystem.Free(*)', description: 'Free on {instance}', dataType: 'uint64' },
      ],
      tables: [
        { name: 'FileSystem.Volumes', description: 'Volumes', instanceColumns: ['MOUNTPOINT'] },
        { name: 'System.OpenFiles', description: 'Open', instanceColumns: ['PID', 'HANDLE'] },
      ],
      lists: [{ name: 'Net.InterfaceList', description: 'Network interfaces' }],
    }

    it('picks an agent metric with its data type', async () => {
      availableQuery = listQuery(reported)
      const wrapper = await openDialog({ kind: 'agentMetric', object: { id: 12, class: 'Node' } })
      expect(toValue(availableArgs.source)).toBe('agent')
      const row = rowWith('System.CPU.Usage')
      expect(row.textContent).toContain('Floating Point')
      row.click()
      expect(wrapper.emitted('select')[0][0]).toEqual({
        name: 'System.CPU.Usage',
        description: 'CPU usage',
        dataType: 'float',
      })
    })

    it('leaves an instance placeholder for the user to fill in, as legacy', async () => {
      availableQuery = listQuery(reported)
      const wrapper = await openDialog({ kind: 'agentMetric', object: { id: 12, class: 'Node' } })
      rowWith('FileSystem.Free(*)').click()
      expect(wrapper.emitted('select')[0][0]).toMatchObject({
        name: 'FileSystem.Free(*)',
        description: 'Free on {instance}',
      })
    })

    it('picks an agent table with its instance columns', async () => {
      availableQuery = listQuery(reported)
      const wrapper = await openDialog({ kind: 'agentTable', object: { id: 12, class: 'Node' } })
      expect(rowWith('System.OpenFiles').textContent).toContain('PID, HANDLE')
      rowWith('FileSystem.Volumes').click()
      expect(wrapper.emitted('select')[0][0]).toEqual({
        name: 'FileSystem.Volumes',
        description: 'Volumes',
        dataType: null,
        instanceColumn: 'MOUNTPOINT',
      })
    })

    it('picks an agent list by name', async () => {
      availableQuery = listQuery(reported)
      const wrapper = await openDialog({ kind: 'agentList', object: { id: 12, class: 'Node' } })
      rowWith('Net.InterfaceList').click()
      expect(wrapper.emitted('select')[0][0]).toEqual({
        name: 'Net.InterfaceList',
        description: 'Network interfaces',
        dataType: null,
        instanceColumn: '',
      })
    })

    it('reads device driver metrics from their own route, which sends only metrics', async () => {
      availableQuery = listQuery({ metrics: [reported.metrics[0]] })
      await openDialog({ kind: 'driverMetric', object: { id: 12, class: 'Node' } })
      expect(toValue(availableArgs.source)).toBe('device-driver')
      expect(rowWith('System.CPU.Usage')).toBeTruthy()
    })

    it('does not read the lists for the other kinds', async () => {
      await openDialog({ kind: 'internalMetric', object: { id: 12, class: 'Node' } })
      expect(toValue(availableArgs.source)).toBeUndefined()
    })

    it('reads the given object id when there is one, the object otherwise', async () => {
      await openDialog({ kind: 'agentMetric', object: { id: 12, class: 'Node' } })
      expect(toValue(availableArgs.objectId)).toBe(12)

      await openDialog({ kind: 'agentMetric', object: null, objectId: 34 })
      expect(toValue(availableArgs.objectId)).toBe(34)
    })

    it('explains an empty list by the configuration poll', async () => {
      availableQuery = listQuery({ metrics: [], tables: [], lists: [] })
      await openDialog({ kind: 'agentTable', object: { id: 12, class: 'Node' } })
      const text = document.body.textContent
      expect(text).toContain('No tables reported yet')
      expect(text).toContain('configuration poll')
    })

    it('reads a 400 as an object class without lists, not as a failure', async () => {
      availableQuery = refusedQuery(400)
      await openDialog({ kind: 'agentMetric', object: { id: 12, class: 'Rack' } })
      expect(document.body.textContent).toContain('This object does not provide metric lists')
      expect(document.querySelector('.query-error-state')).toBeNull()
    })

    it('reads a 404 as a server older than these routes', async () => {
      availableQuery = refusedQuery(404)
      await openDialog({ kind: 'agentList', object: { id: 12, class: 'Node' } })
      expect(document.body.textContent).toContain('This server does not list these lists')
      expect(document.querySelector('.query-error-state')).toBeNull()
    })

    it('shows any other failure as an error with a retry', async () => {
      availableQuery = refusedQuery(500)
      await openDialog({ kind: 'agentMetric', object: { id: 12, class: 'Node' } })
      expect(document.body.textContent).toContain('Request failed: 500')
      expect(document.body.textContent).not.toContain('reported yet')
    })
  })
})
