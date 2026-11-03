import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// CodeMirror needs a real layout to mount; the parse/format logic under test does not.
vi.mock('vue-codemirror', () => ({
  Codemirror: { name: 'Codemirror', props: ['modelValue'], template: '<div />' },
}))
vi.mock('@/composables/useCodeMirrorTheme', () => ({
  useCodeMirrorTheme: () => ({ themeExtensions: { value: [] } }),
}))

const JsonEditor = (await import('@/components/common/JsonEditor.vue')).default

function mountEditor(modelValue) {
  return mount(JsonEditor, { props: { modelValue } })
}

describe('validity', () => {
  it('reports valid for a JSON object', () => {
    const wrapper = mountEditor('{"hostname":"a"}')
    expect(wrapper.emitted('valid').at(-1)).toEqual([true])
  })

  it('reports valid for blank text (an empty configuration)', () => {
    expect(mountEditor('').emitted('valid').at(-1)).toEqual([true])
    expect(mountEditor('  \n ').emitted('valid').at(-1)).toEqual([true])
  })

  it('reports invalid for malformed JSON and surfaces the parser message', () => {
    const wrapper = mountEditor('{"hostname":}')
    expect(wrapper.emitted('valid').at(-1)).toEqual([false])
    expect(wrapper.find('.json-error').exists()).toBe(true)
  })

  it('re-emits validity when the text changes', async () => {
    const wrapper = mountEditor('{"a":1}')
    expect(wrapper.emitted('valid').at(-1)).toEqual([true])
    await wrapper.setProps({ modelValue: '{' })
    expect(wrapper.emitted('valid').at(-1)).toEqual([false])
  })
})

describe('format', () => {
  it('reindents valid JSON through update:modelValue', () => {
    const wrapper = mountEditor('{"a":1,"b":{"c":2}}')
    expect(wrapper.vm.format()).toBe(true)
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([
      '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}',
    ])
  })

  it('is a no-op while the text does not parse', () => {
    const wrapper = mountEditor('{"a":')
    expect(wrapper.vm.format()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
