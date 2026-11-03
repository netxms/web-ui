import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import LogParserView from '@/components/log-parsers/LogParserView.vue'

// jsdom has neither; PrimeVue components bind both on mount.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
const XML = `<parser name="Main">
  <rules>
    <rule name="First" guid="g-1"><match>one</match><event>EV_ONE</event></rule>
  </rules>
</parser>`

const mutate = vi.fn()

const parserQuery = {
  data: ref({ content: XML }),
  isLoading: ref(false),
  isError: ref(false),
  error: ref(null),
  refetch: vi.fn(),
}

vi.mock('@/queries/useLogParserQueries', () => ({
  useLogParser: () => parserQuery,
  useUpdateLogParser: () => ({ mutate, isPending: ref(false) }),
}))
vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

function mountView(props = {}) {
  return mount(LogParserView, {
    props: { parserType: 'syslog', ...props },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { EventPickerDialog: true, LogParserXmlEditor: true },
    },
  })
}

const nameInput = (wrapper) =>
  wrapper
    .findAll('.detail-field')
    .find((f) => f.find('.form-field__label').text() === 'Name')
    .find('input')

const buttonLabels = (root) =>
  [...root.querySelectorAll('.parser-toolbar button.p-button')].map((b) => b.textContent.trim())

describe('LogParserView when the parser cannot be read', () => {
  beforeEach(() => {
    parserQuery.data.value = undefined
    parserQuery.isError.value = true
    parserQuery.error.value = new Error('Request failed: 403')
    parserQuery.refetch.mockReset()
  })

  afterEach(() => {
    parserQuery.data.value = { content: XML }
    parserQuery.isError.value = false
    parserQuery.error.value = null
  })

  it('says so and offers a retry', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Request failed: 403')
    await wrapper.findAll('button').find((b) => b.text() === 'Retry').trigger('click')
    expect(parserQuery.refetch).toHaveBeenCalledTimes(1)
  })

  // Saving from an editor that never held the real parser would overwrite it on the server.
  it('leaves nothing to type into', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('log-parser-xml-editor-stub').exists()).toBe(false)
    expect(wrapper.find('.detail-field').exists()).toBe(false)
  })

  it('keeps an open editor when a later refresh fails', async () => {
    parserQuery.data.value = { content: XML }
    parserQuery.isError.value = false
    const wrapper = mountView()
    await flushPromises()
    await nameInput(wrapper).setValue('Renamed')

    parserQuery.isError.value = true
    await flushPromises()

    expect(nameInput(wrapper).element.value).toBe('Renamed')
    expect(wrapper.text()).not.toContain('Request failed: 403')
  })
})

describe('LogParserView toolbar', () => {
  beforeEach(() => mutate.mockReset())

  it('goes into the tab row it is given', async () => {
    const target = document.createElement('div')
    const wrapper = mountView({ toolbarTarget: target })
    await flushPromises()
    expect(target.querySelector('.parser-toolbar')).not.toBeNull()
    expect(wrapper.find('.parser-toolbar').exists()).toBe(false)
  })

  it('is not shown for a parser whose tab is not active', async () => {
    const target = document.createElement('div')
    mountView({ toolbarTarget: target, active: false })
    await flushPromises()
    expect(target.querySelector('.parser-toolbar')).toBeNull()
  })

  it('offers Discard and Save only once there is something to save', async () => {
    const wrapper = mountView()
    await flushPromises()
    const root = wrapper.element
    expect(buttonLabels(root)).toEqual([])

    await nameInput(wrapper).setValue('Renamed')
    expect(buttonLabels(root)).toEqual(['Discard', 'Save'])

    await wrapper.findAll('.parser-toolbar button.p-button')[1].trigger('click')
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0][0].content).toContain('name="Renamed"')

    await wrapper.findAll('.parser-toolbar button.p-button')[0].trigger('click')
    expect(buttonLabels(root)).toEqual([])
    expect(nameInput(wrapper).element.value).toBe('First')
  })

  // LogParsersSection's leave guard reads this off every parser view.
  it('exposes isDirty for the section guard', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.vm.isDirty).toBe(false)

    await nameInput(wrapper).setValue('Renamed')
    expect(wrapper.vm.isDirty).toBe(true)

    await wrapper.findAll('.parser-toolbar button.p-button')[0].trigger('click')
    expect(wrapper.vm.isDirty).toBe(false)
  })
})
