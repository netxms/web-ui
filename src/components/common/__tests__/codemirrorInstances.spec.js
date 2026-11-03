import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Codemirror } from 'vue-codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useNxslLanguage } from '@/composables/useNxslLanguage'
import { useCodeMirrorTheme } from '@/composables/useCodeMirrorTheme'
import { useCodeMirrorErrorLine } from '@/composables/useCodeMirrorErrorLine'

// Real libraries on purpose: CodeMirror recognizes extensions with instanceof, so two copies of
// @codemirror/state break every editor at mount. Specs that mock vue-codemirror cannot see that.
describe('CodeMirror packages', () => {
  it('accepts extensions built by our own imports', () => {
    const { themeExtensions } = useCodeMirrorTheme()
    const { extensions: errorLineExtensions } = useCodeMirrorErrorLine()

    const wrapper = mount(Codemirror, {
      props: {
        modelValue: 'return 1;',
        extensions: [
          useNxslLanguage(),
          ...themeExtensions.value,
          ...errorLineExtensions,
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
        ],
      },
    })

    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    wrapper.unmount()
  })
})
