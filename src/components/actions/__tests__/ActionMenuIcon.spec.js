import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ActionMenuIcon from '@/components/actions/ActionMenuIcon.vue'
import { OBJECT_ICON_REGISTRY_KEY } from '@/composables/useObjectIcons'

function mountIcon(item, registry = null) {
  return mount(ActionMenuIcon, {
    props: { item },
    global: registry ? { provide: { [OBJECT_ICON_REGISTRY_KEY]: registry } } : {},
  })
}

describe('ActionMenuIcon', () => {
  it('shows the class icon of an ordinary item', () => {
    const wrapper = mountIcon({ label: 'Delete', icon: 'pi pi-trash' })
    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['pi', 'pi-trash']))
  })

  it("asks for a tool's library image and keeps the type icon until it is ready", () => {
    const registry = { want: vi.fn(), resolveImage: () => null }
    const wrapper = mountIcon(
      { label: 'Web', icon: 'pi pi-external-link', iconImage: 'tool-guid' },
      registry,
    )
    expect(registry.want).toHaveBeenCalledTimes(1)
    expect(registry.want.mock.calls[0][0]()).toEqual(['tool-guid'])
    expect(wrapper.classes()).toContain('pi-external-link')
  })

  it('draws the library image once it has loaded', () => {
    const registry = {
      want: vi.fn(),
      resolveImage: (guid) =>
        guid === 'tool-guid' ? { kind: 'glyph', guid, url: 'blob:tool', analysis: {} } : null,
    }
    const wrapper = mountIcon(
      { label: 'Web', icon: 'pi pi-external-link', iconImage: 'tool-guid' },
      registry,
    )
    expect(wrapper.classes()).toContain('resolved-icon--glyph')
    expect(wrapper.attributes('style')).toContain("url('blob:tool')")
  })
})
