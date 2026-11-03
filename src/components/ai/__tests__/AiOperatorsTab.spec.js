import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AiOperatorsTab from '@/components/ai/AiOperatorsTab.vue'
import { SERVER_COMPONENTS } from '@/config/serverComponents'

// Without an initialized assistant the server lists no operators and its id counter is 0, so a
// create would overwrite an existing row: the tab stays hidden.
const serverComponents = ref([])
const isServerInfoLoading = ref(false)

vi.mock('@/composables/useServerComponents', () => ({
  useServerComponents: () => ({
    components: serverComponents,
    isLoading: isServerInfoLoading,
    has: (id) => serverComponents.value.includes(id),
  }),
}))

vi.mock('@/composables/usePermissions', () => ({
  usePermissions: () => ({ can: ref({ manageAiOperators: true }) }),
}))

const operatorsQuery = {
  data: ref([{ id: 4, name: 'Night shift', ownerUserId: 1, enabled: true }]),
  isLoading: ref(false),
  isFetching: ref(false),
  isError: ref(false),
  error: ref(null),
  refetch: vi.fn(),
}

vi.mock('@/queries/useAiOperatorQueries', () => ({
  useAiOperators: () => operatorsQuery,
  useUpdateAiOperator: () => ({ mutate: vi.fn(), isPending: ref(false) }),
  useDeleteAiOperator: () => ({ mutate: vi.fn(), isPending: ref(false) }),
  useResetAiOperator: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))

vi.mock('@/queries/useUserQueries', () => ({
  useUsers: () => ({ data: ref([{ id: 1, name: 'admin' }]) }),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

function mountTab({ components = [], loading = false } = {}) {
  serverComponents.value = components
  isServerInfoLoading.value = loading
  return mount(AiOperatorsTab, {
    props: { detailTarget: (id) => ({ path: `/configuration/ai-assistant/${id}` }) },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, word) => `${n} ${n === 1 ? word : `${word}s`}` },
      stubs: { AppTable: true, SmartFilterInput: true, EntityContextMenu: true },
    },
  })
}

describe('AiOperatorsTab availability', () => {
  it('offers neither the list nor a create on a server with no AI assistant', () => {
    const wrapper = mountTab({ components: [] })

    expect(wrapper.text()).toContain('AI assistant is not initialized')
    expect(wrapper.findComponent({ name: 'AppTable' }).exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('New Operator'))).toBe(false)
  })

  it('shows the list once the server reports the component', () => {
    const wrapper = mountTab({ components: [SERVER_COMPONENTS.AI_ASSISTANT] })

    expect(wrapper.text()).not.toContain('AI assistant is not initialized')
    expect(wrapper.findAll('button').some((b) => b.text().includes('New Operator'))).toBe(true)
  })

  it('waits rather than accusing a server whose components have not arrived', () => {
    // server-info is fetched at startup, so this is the first paint; either branch would flash.
    const wrapper = mountTab({ components: [], loading: true })

    expect(wrapper.text()).not.toContain('AI assistant is not initialized')
    expect(wrapper.findAll('button').some((b) => b.text().includes('New Operator'))).toBe(false)
  })
})
