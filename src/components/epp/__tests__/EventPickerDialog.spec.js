import { afterEach, describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

const templates = [
  { code: 1, name: 'SYS_NODE_ADDED', severity: 0, message: 'Node added', tags: [] },
  { code: 4, name: 'SYS_NODE_DOWN', severity: 4, message: 'Node down', tags: ['availability'] },
  {
    code: 100063,
    name: 'PG_INSTANCE_UNREACHABLE',
    severity: 3,
    message: 'Instance unreachable',
    tags: ['postgresql'],
  },
]

vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({
    data: ref(templates),
    isLoading: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
}))

const { default: EventPickerDialog } = await import('../EventPickerDialog.vue')

/** Mounted closed, then opened: the dialog seeds its selection on the open transition. */
async function openDialog(props = {}) {
  const wrapper = mount(EventPickerDialog, {
    props: { visible: false, ...props },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, s) => `${n} ${n === 1 ? s : s + 's'}` },
    },
  })
  await wrapper.setProps({ visible: true })
  // PrimeVue's Dialog mounts its teleported content a tick after it opens.
  await nextTick()
  return wrapper
}

/** PrimeVue's Dialog teleports to body, so lookups read the document, not the wrapper. */
function bodyRows() {
  return [...document.querySelectorAll('.app-table tbody tr')]
}

async function filter(value) {
  const input = document.querySelector('input[data-filter-input]')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

function findButton(label) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
}

describe('EventPickerDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists code, name and tags, with the message only on hover', async () => {
    await openDialog()
    expect(bodyRows()).toHaveLength(3)
    const text = document.body.textContent
    expect(text).toContain('SYS_NODE_DOWN')
    expect(text).toContain('postgresql')
    expect(text).not.toContain('Node down')
    const name = [...document.querySelectorAll('.event-name')].find(
      (el) => el.textContent === 'SYS_NODE_DOWN',
    )
    expect(name.getAttribute('title')).toBe('Node down')
  })

  it('filters by tag and by code', async () => {
    await openDialog()
    await filter('postgres')
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0].textContent).toContain('PG_INSTANCE_UNREACHABLE')

    await filter('4')
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0].textContent).toContain('SYS_NODE_DOWN')
  })

  it('picks the clicked event and closes in single mode', async () => {
    const wrapper = await openDialog()
    bodyRows()[1].click()
    expect(wrapper.emitted('update:modelValue')).toEqual([[4]])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
  })

  it('keeps picks the filter hides when selecting all visible rows', async () => {
    const wrapper = await openDialog({ multiple: true, modelValue: [1] })
    await filter('postgres')
    document.querySelector('.app-table__checkbox-th [role="checkbox"]').click()
    await nextTick()
    findButton('OK').click()
    expect(wrapper.emitted('update:modelValue')[0][0].toSorted((a, b) => a - b)).toEqual([
      1, 100063,
    ])
  })

  it('toggles a row on click in multiple mode', async () => {
    const wrapper = await openDialog({ multiple: true, modelValue: [1] })
    bodyRows()[0].click()
    bodyRows()[1].click()
    await nextTick()
    findButton('OK').click()
    expect(wrapper.emitted('update:modelValue')).toEqual([[[4]]])
  })
})
