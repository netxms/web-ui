import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, computed } from 'vue'
import PrimeVue from 'primevue/config'

const dirtyByType = {
  syslog: ref(false),
  'windows-event': ref(false),
  opentelemetry: ref(false),
}

let guardedDirty = null
const guardOptions = vi.fn()
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: (isDirty, options) => {
    guardedDirty = isDirty
    guardOptions(options)
  },
}))

// Stand-in exposing the same isDirty the real view does, one flag per parser type.
vi.mock('@/components/log-parsers/LogParserView.vue', () => ({
  default: defineComponent({
    props: { parserType: String, active: Boolean, toolbarTarget: Object },
    setup(props, { expose }) {
      expose({ isDirty: computed(() => dirtyByType[props.parserType].value) })
      return () => h('div', { class: 'parser-stub' })
    },
  }),
}))

const { default: LogParsersSection } = await import('../LogParsersSection.vue')

describe('LogParsersSection leave guard', () => {
  it('is dirty while any of the three parsers has unsaved edits', async () => {
    mount(LogParsersSection, {
      global: { plugins: [PrimeVue], stubs: { SectionHeader: true } },
    })
    await flushPromises()

    expect(guardOptions).toHaveBeenCalledWith({ includeRouteUpdates: true })
    expect(guardedDirty.value).toBe(false)

    // A parser in a tab that is not showing still counts.
    dirtyByType.opentelemetry.value = true
    expect(guardedDirty.value).toBe(true)

    dirtyByType.opentelemetry.value = false
    dirtyByType.syslog.value = true
    expect(guardedDirty.value).toBe(true)

    dirtyByType.syslog.value = false
    expect(guardedDirty.value).toBe(false)
  })
})
