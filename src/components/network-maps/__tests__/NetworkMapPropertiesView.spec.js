import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import Button from 'primevue/button'

const objectSave = vi.fn()

vi.mock('@/composables/useObjectPropertiesEditor', () => ({
  useObjectPropertiesEditor: () => ({
    object: ref({ id: 5, class: 'NetworkMap' }),
    draft: ref({}),
    isDirty: ref(true),
    isSaving: ref(false),
    saveError: ref(null),
    save: objectSave,
    cancel: vi.fn(),
  }),
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }))

const NetworkMapPropertiesView = (await import('../NetworkMapPropertiesView.vue')).default

function mountPanel() {
  return shallowMount(NetworkMapPropertiesView, {
    props: { map: { id: 5, name: 'Core', rawContent: {} }, persist: vi.fn() },
  })
}

const footerButtons = (wrapper) => wrapper.find('.footer-actions').findAllComponents(Button)

const button = (wrapper, label) =>
  footerButtons(wrapper).find((b) => b.attributes('label') === label)

async function click(wrapper, label) {
  await button(wrapper, label).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  objectSave.mockReset()
})

describe('NetworkMapPropertiesView footer', () => {
  it('offers Discard, Apply and Save & Close', () => {
    const wrapper = mountPanel()
    expect(footerButtons(wrapper).map((b) => b.attributes('label'))).toEqual([
      'Discard',
      'Apply',
      'Save & Close',
    ])
  })

  it('Apply saves and stays open', async () => {
    objectSave.mockResolvedValue(true)
    const wrapper = mountPanel()

    await click(wrapper, 'Apply')

    expect(objectSave).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('Save & Close closes once the save succeeds', async () => {
    objectSave.mockResolvedValue(true)
    const wrapper = mountPanel()

    await click(wrapper, 'Save & Close')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('Save & Close stays open when the save fails', async () => {
    objectSave.mockResolvedValue(false)
    const wrapper = mountPanel()

    await click(wrapper, 'Save & Close')

    expect(objectSave).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})
