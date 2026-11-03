import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { clearWorkingState } from '@/composables/useWorkingState'

let listState
let primaryState
let secondaryState
/** Call order distinguishes the two `useDeviceConfigBackup` calls: selected, then comparison. */
let backupCallCount
let selectedIdArg

vi.mock('@/queries/useDeviceConfigBackupQueries', () => ({
  useDeviceConfigBackups: () => listState,
  useDeviceConfigBackup: (objectId, backupId) => {
    if (backupCallCount++ > 0) return secondaryState
    selectedIdArg = backupId
    return primaryState
  },
  useInvalidateDeviceConfigBackups: () => vi.fn(),
}))

vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const DeviceConfigBackupView = (await import('@/views/objects/subviews/DeviceConfigBackupView.vue'))
  .default

/** Two backups a day apart: the newer changed only its running config. */
function backupFixtures() {
  return [
    {
      id: 2,
      timestamp: '2026-09-20T03:00:00Z',
      lastCheckTime: '2026-09-21T03:00:00Z',
      isBinary: false,
      runningConfigSize: 2048,
      runningConfigHash: 'bbbb',
      startupConfigSize: 1024,
      startupConfigHash: 'cccc',
    },
    {
      id: 1,
      timestamp: '2026-09-19T03:00:00Z',
      lastCheckTime: null,
      isBinary: false,
      runningConfigSize: 2000,
      runningConfigHash: 'aaaa',
      startupConfigSize: 1024,
      startupConfigHash: 'cccc',
    },
  ]
}

function queryState(data, overrides = {}) {
  return {
    data: ref(data),
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    ...overrides,
  }
}

function node(effectiveRights = { readDeviceConfig: true, uploadDeviceConfig: true }) {
  return { id: 512, name: 'core-sw-01', class: 'Node', effectiveRights }
}

/**
 * @param {object} [object]
 * @param {object} [route] - an app `$route`, which turns on working state
 */
function mountView(object = node(), route = null) {
  return mount(DeviceConfigBackupView, {
    props: { object },
    global: {
      stubs: {
        AppTable: {
          name: 'AppTable',
          props: ['columns', 'rows', 'loading', 'error'],
          template: '<div class="table-stub" />',
        },
        ConfigTextViewer: {
          name: 'ConfigTextViewer',
          props: ['text', 'diff', 'label', 'emptyMessage'],
          template: '<div class="viewer-stub" />',
        },
        RestoreDeviceConfigDialog: true,
        EntityContextMenu: true,
        RefetchIndicator: true,
        LoadingState: true,
        Tabs: { template: '<div><slot /></div>' },
        TabList: { template: '<div><slot /></div>' },
        Tab: { template: '<div><slot /></div>' },
        TabPanels: { template: '<div><slot /></div>' },
        TabPanel: { template: '<div><slot /></div>' },
        Message: { template: '<div class="message-stub"><slot /></div>' },
        Select: true,
        FormField: { template: '<div><slot /></div>' },
        Button: true,
        IconField: { template: '<div><slot /></div>' },
        InputIcon: true,
        InputText: true,
      },
      mocks: { $plural: (n, one, many) => `${n} ${n === 1 ? one : many}` },
      // Not in `mocks`, which only arrive after setup has run.
      config: { globalProperties: route ? { $route: route } : {} },
      directives: { tooltip: () => {} },
    },
  })
}

function tableRows(wrapper) {
  return wrapper.findComponent({ name: 'AppTable' }).props('rows')
}

beforeEach(() => {
  clearWorkingState()
  backupCallCount = 0
  listState = queryState(backupFixtures())
  primaryState = queryState({
    id: 2,
    isBinary: false,
    runningConfig: 'hostname core-sw-01\ninterface Gi0/1\n',
    startupConfig: 'hostname core-sw-01\n',
  })
  secondaryState = queryState({
    id: 1,
    isBinary: false,
    runningConfig: 'hostname core-sw\ninterface Gi0/1\n',
    startupConfig: 'hostname core-sw-01\n',
  })
})

describe('DeviceConfigBackupView', () => {
  it('marks the oldest backup Initial and later ones by what changed', () => {
    const rows = tableRows(mountView())
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [2, 'R'],
      [1, 'Initial'],
    ])
  })

  it('reports both configurations as changed when both hashes moved', () => {
    listState.data.value[0].startupConfigHash = 'dddd'
    const rows = tableRows(mountView())
    expect(rows[0].status).toBe('R S')
  })

  it('leaves the status blank when neither hash moved', () => {
    listState.data.value[0].runningConfigHash = 'aaaa'
    const rows = tableRows(mountView())
    expect(rows[0].status).toBe('')
  })

  it('sorts newest first even when the provider does not', () => {
    listState.data.value.reverse()
    const rows = tableRows(mountView())
    expect(rows.map((r) => r.id)).toEqual([2, 1])
    expect(rows[1].status).toBe('Initial')
  })

  it('formats sizes, switching unit only past ten of it', () => {
    listState.data.value[0].runningConfigSize = 10_240
    listState.data.value[0].startupConfigSize = 0
    const rows = tableRows(mountView())
    expect(rows[0].runningSizeText).toBe('10.0 KB')
    expect(rows[0].startupSizeText).toBe('--')
    expect(rows[1].runningSizeText).toBe('2000')
  })

  it('renders an empty list without selecting anything', () => {
    listState.data.value = []
    const wrapper = mountView()
    expect(tableRows(wrapper)).toEqual([])
    expect(wrapper.findComponent({ name: 'ConfigTextViewer' }).exists()).toBe(true)
  })

  it('hides the content pane and explains why without the read-device-config right', () => {
    const wrapper = mountView(node({ readDeviceConfig: false, uploadDeviceConfig: false }))
    expect(wrapper.findComponent({ name: 'ConfigTextViewer' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Read device configuration')
  })

  it('still lists backups without the content right, because listing only needs read', () => {
    const wrapper = mountView(node({ readDeviceConfig: false }))
    expect(tableRows(wrapper).map((r) => r.id)).toEqual([2, 1])
  })

  it('explains a provider that does not implement listing rather than showing a table error', () => {
    listState.isError.value = true
    listState.error.value = Object.assign(new Error('Not implemented'), { status: 501 })
    const wrapper = mountView()
    expect(wrapper.text()).toContain('does not support listing backups')
    expect(wrapper.findComponent({ name: 'AppTable' }).props('error')).toBeNull()
  })

  it('passes a real error through to the table', () => {
    listState.isError.value = true
    listState.error.value = Object.assign(new Error('Boom'), { status: 403 })
    const wrapper = mountView()
    expect(wrapper.findComponent({ name: 'AppTable' }).props('error')).toBeTruthy()
  })

  it('shows a size notice instead of decoding a binary backup', () => {
    listState.data.value[0].isBinary = true
    const wrapper = mountView()
    expect(wrapper.findComponent({ name: 'ConfigTextViewer' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('binary configuration')
  })

  it('diffs the selected backup against its predecessor by default', () => {
    const wrapper = mountView()
    const viewers = wrapper.findAllComponents({ name: 'ConfigTextViewer' })
    const diffViewer = viewers.find((v) => Array.isArray(v.props('diff')))
    const changed = diffViewer.props('diff').filter((line) => line.kind !== 'context')
    expect(changed.map((line) => `${line.kind}:${line.text}`)).toEqual([
      'removed:hostname core-sw',
      'added:hostname core-sw-01',
    ])
  })
})

describe('DeviceConfigBackupView working state', () => {
  const routeTo = (objectId) => ({
    path: `/infrastructure/${objectId}/deviceConfigBackup`,
    params: { objectId: String(objectId) },
  })

  async function leaveOnOlderBackup() {
    const wrapper = mountView(node(), routeTo(512))
    await wrapper.findComponent({ name: 'AppTable' }).vm.$emit('row-click', { id: 1 })
    expect(selectedIdArg.value).toBe(1)
    wrapper.unmount()
    backupCallCount = 0
  }

  it('comes back on the backup that was open, on the same node', async () => {
    await leaveOnOlderBackup()

    mountView(node(), routeTo(512))

    expect(selectedIdArg.value).toBe(1)
  })

  it('opens the newest one when the backup that was open has gone', async () => {
    await leaveOnOlderBackup()
    listState.data.value = backupFixtures().slice(0, 1)

    mountView(node(), routeTo(512))

    expect(selectedIdArg.value).toBe(2)
  })

  it('opens the newest one on another node', async () => {
    await leaveOnOlderBackup()

    mountView({ ...node(), id: 600 }, routeTo(600))

    expect(selectedIdArg.value).toBe(2)
  })
})
