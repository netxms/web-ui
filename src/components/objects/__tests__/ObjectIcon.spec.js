import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Router, Server } from 'lucide-vue-next'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { OBJECT_ICON_REGISTRY_KEY } from '@/composables/useObjectIcons'

/** A registry that answers every object with the same resolved icon. */
function registryResolving(resolved) {
  return { resolve: () => resolved }
}

function mountIcon(props, registry = null) {
  return mount(ObjectIcon, {
    props,
    global: registry ? { provide: { [OBJECT_ICON_REGISTRY_KEY]: registry } } : {},
  })
}

describe('ObjectIcon', () => {
  it('draws the built-in class icon outside the signed-in layout (no registry)', () => {
    const wrapper = mountIcon({ object: { class: 'Node' }, size: 16 })
    expect(wrapper.findComponent(Server).exists()).toBe(true)
    expect(wrapper.attributes('width')).toBe('16')
  })

  it('draws whatever built-in icon the registry resolved', () => {
    const wrapper = mountIcon(
      { object: { class: 'Node' } },
      registryResolving({ kind: 'builtin', component: Router }),
    )
    expect(wrapper.findComponent(Router).exists()).toBe(true)
  })

  it('draws a glyph as a mask in the current colour', () => {
    const wrapper = mountIcon(
      { object: { class: 'Node', category: 1 }, size: 16 },
      registryResolving({ kind: 'glyph', guid: 'g', url: 'blob:glyph', analysis: {} }),
    )
    const style = wrapper.attributes('style')
    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toContain('resolved-icon--glyph')
    expect(style).toContain("--resolved-icon-mask: url('blob:glyph')")
    expect(style).toContain('--resolved-icon-size: 16px')
  })

  it('draws a picture as an image, greyed when the object is inactive', () => {
    const picture = {
      kind: 'picture',
      guid: 'p',
      url: 'blob:picture',
      analysis: { style: 'picture', inkFraction: 0.5, inkLuminance: 0.4 },
    }
    const active = mountIcon({ object: { class: 'Node' } }, registryResolving(picture))
    expect(active.element.tagName).toBe('IMG')
    expect(active.attributes('src')).toBe('blob:picture')
    expect(active.attributes('style') ?? '').not.toContain('grayscale')

    const inactive = mountIcon(
      { object: { class: 'Node' }, inactive: true },
      registryResolving(picture),
    )
    expect(inactive.attributes('style')).toContain('grayscale(1)')
  })

  it('is decorative: the object name always sits beside it', () => {
    expect(mountIcon({ object: { class: 'Node' } }).attributes('aria-hidden')).toBe('true')
  })
})
