import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import PrimeVue from 'primevue/config'
import AlarmDetailsView from '../AlarmDetailsView.vue'

const alarm = ref(null)
const sourceObject = ref(null)
const options = ref({})

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

vi.mock('@/queries/useAlarmQueries', () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: ref(false) })
  return {
    useAlarm: () => ({ data: alarm, isLoading: ref(false) }),
    useAcknowledgeAlarm: mutation,
    useResolveAlarm: mutation,
    useTerminateAlarm: mutation,
  }
})
vi.mock('@/queries/useObjectQueries', () => ({
  useDciValues: () => ({ valueOf: () => null }),
  useDciHistory: () => ({ data: ref(null), isLoading: ref(false) }),
  useObject: () => ({ data: sourceObject }),
}))
vi.mock('@/queries/useServerQueries', () => ({
  useServerInfo: () => ({ data: computed(() => ({ options: options.value })) }),
}))
vi.mock('@/queries/useMappingTableQueries', () => ({
  useDciValueMapping: () => ({ mappedValue: () => null }),
}))

const IconStub = defineComponent({
  name: 'ObjectIcon',
  props: ['object'],
  template: '<i class="object-icon-stub" />',
})

function mountView() {
  return mount(AlarmDetailsView, {
    props: { alarmId: 5, row: { sourceName: 'core-switch' } },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: {} },
      stubs: {
        EntityDetailHeader: { template: '<div><slot name="actions" /></div>' },
        InfoCard: { template: '<div><slot /></div>' },
        AlarmIconLabel: true,
        AlarmCommentsSection: true,
        AlarmRelatedEventsSection: true,
        ObjectIcon: IconStub,
      },
    },
  })
}

const terminateButton = (wrapper) =>
  wrapper.findAll('button').find((button) => button.text() === 'Terminate')

beforeEach(() => {
  alarm.value = { id: 5, state: 0, severity: 2, source: 10, dci: 0 }
  sourceObject.value = null
  options.value = {}
})

describe('AlarmDetailsView', () => {
  it('terminates from any state by default', () => {
    expect(terminateButton(mountView()).attributes('disabled')).toBeUndefined()
  })

  it('terminates only a resolved alarm under strict flow', () => {
    options.value = { strictAlarmStatusFlow: true }
    expect(terminateButton(mountView()).attributes('disabled')).toBeDefined()

    alarm.value = { ...alarm.value, state: 2 }
    expect(terminateButton(mountView()).attributes('disabled')).toBeUndefined()
  })

  it('draws the source object icon on its link', () => {
    const NODE = { id: 10, class: 'Node' }
    sourceObject.value = NODE

    const source = mountView().find('.source-link')

    expect(source.text()).toContain('core-switch')
    expect(source.findComponent(IconStub).props('object')).toEqual(NODE)
  })
})
