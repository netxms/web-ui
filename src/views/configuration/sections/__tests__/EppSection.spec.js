import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, reactive, ref, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'

const route = reactive({ name: 'configuration', params: { sectionId: 'epp' }, query: {} })
const push = vi.fn((target) => {
  route.query = target.query ?? {}
  route.params = { sectionId: 'epp', ...target.params }
})

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => route,
  useRouter: () => ({ push }),
}))

const chains = [
  { id: 0, name: 'Default policy', ruleCount: 2, callerCount: 0 },
  { id: 2, name: 'test-chain', ruleCount: 0, callerCount: 1 },
]

const chainRules = {
  0: [
    { guid: 'r1', chainId: 0, ruleNumber: 1, comments: 'first', flags: 0 },
    { guid: 'r2', chainId: 0, ruleNumber: 2, comments: 'second', flags: 0 },
  ],
  2: [],
}

vi.mock('@/queries/useEppQueries', () => ({
  useEppChains: () => ({ data: ref(chains), isLoading: ref(false) }),
  useEppChain: (chainId) => ({
    data: computed(() => ({ id: chainId.value, version: 1, rules: chainRules[chainId.value] })),
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useEppCallGraph: () => ({
    callGraph: ref(new Map()),
    chainsWithRules: ref([]),
    isLoading: ref(false),
  }),
  useUpdateEppChainRules: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useCreateEppChain: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useUpdateEppChain: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useDeleteEppChain: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  eppKeys: { all: () => ['epp'], chain: (id) => ['epp', id] },
  useEppChainCallers: () => ({ data: ref([]), isLoading: ref(false), isError: ref(false) }),
}))

// `getQueryData` stands in for the chain cache, read when a cut is pasted across chains.
vi.mock('@tanstack/vue-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({
    fetchQuery: vi.fn(),
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
    getQueryData: (key) => {
      const chainId = key?.[1]
      return chainRules[chainId]
        ? { id: chainId, version: 1, rules: chainRules[chainId] }
        : undefined
    },
  }),
}))
vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: () => ({ objectsById: ref(new Map()) }),
}))
vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))
vi.mock('@/queries/useServerActionQueries', () => ({ useServerActions: () => ({ data: ref([]) }) }))
vi.mock('@/composables/usePermissions', () => ({
  usePermissions: () => ({ can: computed(() => ({ manageEpp: true })) }),
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }))

// PrimeVue's ContextMenu binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
import EppSection from '@/views/configuration/sections/EppSection.vue'

let pinia

function mountSection() {
  return mount(EppSection, {
    global: {
      plugins: [pinia, PrimeVue, ConfirmationService, ToastService],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, s) => `${n} ${s}` },
      stubs: { teleport: true },
    },
  })
}

function pasteButton(wrapper) {
  return wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Paste')
}
function copyButton(wrapper) {
  return wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Copy')
}

function cutButton(wrapper) {
  return wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'Cut')
}

function contextEvent() {
  return { pageX: 40, pageY: 60, preventDefault: () => {}, stopPropagation: () => {} }
}

async function openMenuOn(wrapper, rule) {
  wrapper.vm.onRowContextMenu({ event: contextEvent(), rule })
  await nextTick()
  return wrapper.vm.contextMenuItems
}

function visibleLabels(items) {
  return items.filter((i) => !i.separator && i.visible !== false).map((i) => i.label)
}

function menuItem(items, label) {
  return items.find((i) => i.label === label && i.visible !== false)
}

/** A copy must outlive the chain switch; a cut moves rules out of the chain they came from. */
describe('EppSection clipboard', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    route.query = {}
    push.mockClear()
  })

  afterEach(() => {
    pinia._e.stop()
  })

  async function copyFirstRuleInMainChain(wrapper) {
    wrapper.vm.selectedRuleIds = new Set(['r1'])
    await nextTick()
    await copyButton(wrapper).trigger('click')
    await nextTick()
  }

  async function switchToChain(id) {
    route.query = { chain: String(id) }
    await nextTick()
    await nextTick()
  }

  it('keeps a copy on the clipboard across a chain switch', async () => {
    const wrapper = mountSection()
    await nextTick()
    await copyFirstRuleInMainChain(wrapper)
    expect(pasteButton(wrapper).attributes('disabled')).toBeUndefined()

    await switchToChain(2)
    expect(wrapper.vm.activeChainId).toBe(2)
    expect(pasteButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('pastes the copied rules into the other chain as new rules', async () => {
    const wrapper = mountSection()
    await nextTick()
    await copyFirstRuleInMainChain(wrapper)
    await switchToChain(2)

    await pasteButton(wrapper).trigger('click')
    await nextTick()
    expect(wrapper.vm.localRules).toHaveLength(1)
    expect(wrapper.vm.localRules[0].guid).not.toBe('r1')
    expect(wrapper.vm.localRules[0].comments).toBe('first')
    expect(wrapper.vm.isDirty).toBe(true)
    expect(pasteButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('carries a cut into another chain and moves the rules there', async () => {
    const wrapper = mountSection()
    await nextTick()
    wrapper.vm.selectedRuleIds = new Set(['r1'])
    await nextTick()
    await cutButton(wrapper).trigger('click')
    await nextTick()

    await switchToChain(2)
    expect(pasteButton(wrapper).attributes('disabled')).toBeUndefined()

    await pasteButton(wrapper).trigger('click')
    await nextTick()

    expect(wrapper.vm.localRules.map((r) => r.guid)).toEqual(['r1'])
    expect(wrapper.vm.dirtyChainIds).toEqual(new Set([0, 2]))

    await switchToChain(0)
    expect(wrapper.vm.localRules.map((r) => r.guid)).toEqual(['r2'])

    expect(pasteButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('survives a remount of the section', async () => {
    const wrapper = mountSection()
    await nextTick()
    await copyFirstRuleInMainChain(wrapper)
    wrapper.unmount()

    const remounted = mountSection()
    await nextTick()
    expect(pasteButton(remounted).attributes('disabled')).toBeUndefined()
  })
})

/** The toolbar pastes after the selection; the menu pastes after the row it was opened on. */
describe('EppSection rule context menu', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    route.query = {}
    push.mockClear()
  })

  afterEach(() => {
    pinia._e.stop()
  })

  async function mounted() {
    const wrapper = mountSection()
    await nextTick()
    return wrapper
  }

  it('offers Cut and Copy on the clicked rule', async () => {
    const wrapper = await mounted()
    const items = await openMenuOn(wrapper, chainRules[0][0])
    expect(visibleLabels(items)).toContain('Cut')
    expect(visibleLabels(items)).toContain('Copy')
  })

  it('leaves Paste out of the menu while the clipboard is empty', async () => {
    const wrapper = await mounted()
    const items = await openMenuOn(wrapper, chainRules[0][0])
    expect(visibleLabels(items).some((l) => l.startsWith('Paste'))).toBe(false)
  })

  it('offers Paste once rules are on the clipboard', async () => {
    const wrapper = await mounted()
    let items = await openMenuOn(wrapper, chainRules[0][0])
    menuItem(items, 'Copy').command()
    await nextTick()

    items = await openMenuOn(wrapper, chainRules[0][1])
    expect(visibleLabels(items)).toContain('Paste After This Rule')
  })

  it('copies the clicked rule when it is not the selected one', async () => {
    const wrapper = await mounted()
    wrapper.vm.selectedRuleIds = new Set(['r1'])
    await nextTick()

    const items = await openMenuOn(wrapper, chainRules[0][1])
    menuItem(items, 'Copy').command()
    await nextTick()
    expect(wrapper.vm.clipboard.rules.map((r) => r.guid)).toEqual(['r2'])
  })

  it('copies the whole selection when the clicked rule is part of it', async () => {
    const wrapper = await mounted()
    wrapper.vm.selectedRuleIds = new Set(['r1', 'r2'])
    await nextTick()

    const items = await openMenuOn(wrapper, chainRules[0][0])
    expect(visibleLabels(items)).toContain('Copy 2 Rules')
    menuItem(items, 'Copy 2 Rules').command()
    await nextTick()
    expect(wrapper.vm.clipboard.rules.map((r) => r.guid)).toEqual(['r1', 'r2'])
  })

  it('pastes after the rule the menu was opened on, not after the selection', async () => {
    const wrapper = await mounted()
    // Selected, so a selection-anchored paste would land at index 1.
    wrapper.vm.selectedRuleIds = new Set(['r1'])
    await nextTick()
    let items = await openMenuOn(wrapper, chainRules[0][0])
    menuItem(items, 'Copy').command()
    await nextTick()

    items = await openMenuOn(wrapper, chainRules[0][1])
    menuItem(items, 'Paste After This Rule').command()
    await nextTick()

    // The suffix marks a copy that landed beside its own original.
    expect(wrapper.vm.localRules.map((r) => r.comments)).toEqual([
      'first',
      'second',
      'first (copy)',
    ])
    expect(wrapper.vm.isDirty).toBe(true)
  })
})
