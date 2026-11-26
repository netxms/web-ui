import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AiSkillsTab from '@/components/ai/AiSkillsTab.vue'

const disableItem = vi.fn()
const enableItem = vi.fn()

const skillsQuery = {
  data: ref(null),
  isLoading: ref(false),
  isFetching: ref(false),
  isError: ref(false),
  error: ref(null),
  refetch: vi.fn(),
}

vi.mock('@/queries/useAiQueries', () => ({
  useAiSkillsAndTools: () => skillsQuery,
  useDisableAiItem: () => ({ mutate: disableItem, isPending: ref(false) }),
  useEnableAiItem: () => ({ mutate: enableItem, isPending: ref(false) }),
}))

vi.mock('@/composables/usePermissions', () => ({
  usePermissions: () => ({ can: ref({ manageAiSkills: true }) }),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

function answer(typeCodes) {
  return {
    skills: [
      { name: 'log-analysis', disabled: false, supportsWorker: true, defaultMode: 'worker' },
    ],
    tools: [{ name: 'get-alarm-list', disabled: true, parameters: [] }],
    disabledExtras: [{ type: 'tool', name: 'delete-objects' }],
    typeCodes,
  }
}

function mountTab() {
  return mount(AiSkillsTab, {
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { AppTable: true },
    },
  })
}

const tables = (wrapper) => wrapper.findAllComponents({ name: 'AppTable' })
const button = (wrapper, label) => wrapper.findAll('button').find((b) => b.text() === label)

async function select(wrapper, tableIndex, name) {
  const table = tables(wrapper)[tableIndex]
  table.vm.$emit(
    'row-click',
    table.props('rows').find((r) => r.name === name),
  )
  await wrapper.vm.$nextTick()
}

beforeEach(() => vi.clearAllMocks())

describe('AiSkillsTab', () => {
  it('lists skills and tools, with tools typed Tool', () => {
    skillsQuery.data.value = answer({ skill: 'skill', tool: 'tool' })
    const wrapper = mountTab()

    const rows = tables(wrapper)[0].props('rows')
    expect(rows.map((r) => [r.name, r.typeLabel])).toEqual([
      ['log-analysis', 'Skill'],
      ['get-alarm-list', 'Tool'],
    ])
    expect(
      tables(wrapper)[1]
        .props('rows')
        .map((r) => r.typeLabel),
    ).toEqual(['Tool'])
    expect(wrapper.text()).toContain('Skills & Tools')
  })

  it('disables a skill with the type code of a current server', async () => {
    skillsQuery.data.value = answer({ skill: 'skill', tool: 'tool' })
    const wrapper = mountTab()

    await select(wrapper, 0, 'log-analysis')
    await button(wrapper, 'Disable').trigger('click')

    expect(disableItem).toHaveBeenCalledWith(
      { typeCode: 'skill', name: 'log-analysis' },
      expect.any(Object),
    )
  })

  it('uses the old type codes on a server that answered skills-and-functions', async () => {
    skillsQuery.data.value = answer({ skill: 'S', tool: 'F' })
    const wrapper = mountTab()

    await select(wrapper, 0, 'get-alarm-list')
    await button(wrapper, 'Enable').trigger('click')
    expect(enableItem).toHaveBeenCalledWith(
      { typeCode: 'F', name: 'get-alarm-list' },
      expect.any(Object),
    )

    await select(wrapper, 1, 'delete-objects')
    await button(wrapper, 'Remove').trigger('click')
    expect(enableItem).toHaveBeenLastCalledWith(
      { typeCode: 'F', name: 'delete-objects' },
      expect.any(Object),
    )
  })
})
