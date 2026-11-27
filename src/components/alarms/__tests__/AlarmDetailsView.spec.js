import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import AlarmDetailsView from '../AlarmDetailsView.vue'
import { useAuthStore } from '@/stores/authStore'

const alarm = ref(null)
const sourceObject = ref(null)
const options = ref({})
const components = ref([])

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
  useServerInfo: () => ({
    data: computed(() => ({ options: options.value, components: components.value })),
  }),
}))
vi.mock('@/queries/useMappingTableQueries', () => ({
  useDciValueMapping: () => ({ mappedValue: () => null }),
}))

const AiDialogStub = defineComponent({
  name: 'AlarmAiCommentDialog',
  props: ['visible', 'alarm', 'sourceName'],
  template: '<div class="ai-dialog-stub" />',
})

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
        AlarmAiCommentDialog: AiDialogStub,
        ObjectIcon: IconStub,
      },
    },
  })
}

const buttonNamed = (wrapper, label) =>
  wrapper.findAll('button').find((button) => button.text() === label)
const terminateButton = (wrapper) => buttonNamed(wrapper, 'Terminate')

beforeEach(() => {
  setActivePinia(createPinia())
  components.value = []
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

describe('AlarmDetailsView Ask AI assistant', () => {
  function enableAi() {
    components.value = ['AI-ASSISTANT']
    useAuthStore().user = { systemAccessRights: String(1n << 53n) }
  }

  it('is offered only with the AI component and the right to use it', () => {
    components.value = ['AI-ASSISTANT']
    expect(buttonNamed(mountView(), 'Ask AI assistant')).toBeUndefined()

    components.value = []
    useAuthStore().user = { systemAccessRights: String(1n << 53n) }
    expect(buttonNamed(mountView(), 'Ask AI assistant')).toBeUndefined()

    enableAi()
    expect(buttonNamed(mountView(), 'Ask AI assistant')).toBeDefined()
  })

  it('opens the suggested-comment dialog on this alarm', async () => {
    enableAi()
    alarm.value = { ...alarm.value, message: 'Interface down' }
    const wrapper = mountView()

    await buttonNamed(wrapper, 'Ask AI assistant').trigger('click')
    await nextTick()

    const dialog = wrapper.findComponent(AiDialogStub)
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('alarm')).toMatchObject({ id: 5, message: 'Interface down' })
    expect(dialog.props('sourceName')).toBe('core-switch')
  })

  it('is disabled on a terminated alarm, whose comments are read-only', () => {
    enableAi()
    alarm.value = { ...alarm.value, state: 3 }

    expect(buttonNamed(mountView(), 'Ask AI assistant').attributes('disabled')).toBeDefined()
  })
})
