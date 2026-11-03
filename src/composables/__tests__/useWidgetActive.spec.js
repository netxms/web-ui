import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { provideWidgetActive, useWidgetActive } from '../useWidgetActive'

const Consumer = defineComponent({
  setup() {
    return { active: useWidgetActive() }
  },
  render() {
    return h('span', String(this.active))
  },
})

describe('useWidgetActive', () => {
  it('reads the flag the enclosing widget provides, and tracks its changes', async () => {
    const flag = ref(false)
    const Provider = defineComponent({
      setup() {
        provideWidgetActive(flag)
      },
      render: () => h(Consumer),
    })

    const wrapper = mount(Provider)
    expect(wrapper.text()).toBe('false')

    flag.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('true')
  })

  it('defaults to active with no provider above it', () => {
    expect(mount(Consumer).text()).toBe('true')
  })
})
