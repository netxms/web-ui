import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import PrimeVue from 'primevue/config'
import { MAP_FLAGS } from '@/utils/networkMapUtils'

vi.mock('@/components/image-library/ImagePickerButton.vue', () => ({
  default: { name: 'ImagePickerButton', template: '<div />' },
}))

window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const NetworkMapBackgroundSection = (await import('../NetworkMapBackgroundSection.vue')).default

function mountSection(draft, adjust = reactive({ active: false, toggle: vi.fn() })) {
  const wrapper = mount(NetworkMapBackgroundSection, {
    props: {
      draft: reactive({ backgroundColor: '#ffffff', width: 0, height: 0, ...draft }),
      object: {},
      sectionId: 'background',
      sectionLabel: 'Background',
    },
    global: { plugins: [PrimeVue], provide: { mapBackdropAdjust: adjust } },
  })
  return { wrapper, adjust }
}

const adjustButton = (wrapper) =>
  wrapper.findAll('button').find((b) => /Adjust on map|Done adjusting/.test(b.text()))

describe('NetworkMapBackgroundSection', () => {
  it('offers Adjust on map for a stretched or centered image and for a geographic map', () => {
    const fit = {
      backgroundType: 'image',
      backgroundImage: 'img',
      flags: MAP_FLAGS.FIT_BKGND_IMAGE,
    }
    expect(adjustButton(mountSection(fit).wrapper)).toBeTruthy()
    expect(adjustButton(mountSection({ backgroundType: 'geo', flags: 0 }).wrapper)).toBeTruthy()
  })

  it('has nothing to place for a native-size image or no background', () => {
    const native = { backgroundType: 'image', backgroundImage: 'img', flags: 0 }
    const { wrapper } = mountSection(native)
    expect(adjustButton(wrapper)).toBeUndefined()
    expect(wrapper.text()).toContain('Choose Center or Fit to area')
    expect(adjustButton(mountSection({ backgroundType: 'none', flags: 0 }).wrapper)).toBeUndefined()
  })

  it('toggles the mode and names the way out while it is on', async () => {
    const { wrapper, adjust } = mountSection({ backgroundType: 'geo', flags: 0 })
    await adjustButton(wrapper).trigger('click')
    expect(adjust.toggle).toHaveBeenCalledOnce()
    adjust.active = true
    await wrapper.vm.$nextTick()
    expect(adjustButton(wrapper).text()).toBe('Done adjusting')
    expect(wrapper.text()).toContain('scroll over it to zoom')
  })

  it('keeps the size fields to a fixed width with their unit', () => {
    const { wrapper } = mountSection({ backgroundType: 'geo', flags: 0 })
    const units = wrapper.findAll('.number-row .unit').map((u) => u.text())
    expect(units).toEqual(['px', 'px'])
  })
})
