import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import InputNumber from 'primevue/inputnumber'
import FloorPlanBackdropPanel from '../FloorPlanBackdropPanel.vue'

const editor = {
  grid: 600,
  working: {
    room: { backgroundImage: 'b1d0e7f2-0000-4000-8000-000000000001', backgroundScale: 5000 },
  },
  updateRoom: () => {},
}
const backdrop = {
  url: 'data:image/png;base64,AA==',
  x: 0,
  y: 0,
  width: 4800,
  height: 2400,
  mmPerPixel: 5,
}

function mountPanel(calibration) {
  return mount(FloorPlanBackdropPanel, {
    props: { editor, backdrop, calibration, opacity: 0.85 },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { ImagePickerButton: true },
    },
  })
}

const button = (wrapper, label) => wrapper.findAll('button').find((b) => b.text() === label)

describe('FloorPlanBackdropPanel calibration', () => {
  it('asks for both ends of a known length, and says when a click missed the image', async () => {
    const wrapper = mountPanel({ points: [] })
    expect(wrapper.text()).toContain('Click both ends of something in the drawing')
    expect(wrapper.find('.p-message').exists()).toBe(false)
    await wrapper.setProps({ calibration: { points: [], missed: true } })
    expect(wrapper.find('.p-message').text()).toContain('off the image')
  })

  it('starts the real length at the measured one, so Apply alone leaves the image as it is', async () => {
    const wrapper = mountPanel({ points: [] })
    await wrapper.setProps({
      calibration: {
        points: [
          { x: 0, y: 0 },
          { x: 3000, y: 4000 },
        ],
      },
    })
    const distance = wrapper.findAllComponents(InputNumber).at(-1)
    expect(distance.props('modelValue')).toBe(5000)
    expect(wrapper.text()).toContain('Real length (mm)')
    expect(wrapper.text()).toContain('Measures 5000 mm at the current scale')

    await button(wrapper, 'Apply').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('calibrate-cancel')).toHaveLength(1)
    expect(wrapper.emitted('calibrate-apply')).toBeUndefined()

    distance.vm.$emit('update:modelValue', 2400)
    await button(wrapper, 'Apply').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('calibrate-apply')).toEqual([[2400]])
  })
})
