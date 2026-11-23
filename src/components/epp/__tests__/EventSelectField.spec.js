import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import EventSelectField from '@/components/epp/EventSelectField.vue'

vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({
    data: ref([
      { code: 43, name: 'SYS_ALARM_TIMEOUT', severity: 1 },
      { code: 17, name: 'SYS_THRESHOLD_REACHED', severity: 3 },
    ]),
  }),
}))

function mountField(props) {
  return mount(EventSelectField, {
    props,
    global: { plugins: [PrimeVue], stubs: { EventPickerDialog: true } },
  })
}

const picker = (wrapper) => wrapper.findComponent({ name: 'EventPickerDialog' })
const shown = (wrapper) => wrapper.find('.event-select-box').text()

describe('EventSelectField', () => {
  it('shows a picked event with its code and the severity of its template', () => {
    const wrapper = mountField({ modelValue: 43 })
    expect(shown(wrapper)).toContain('SYS_ALARM_TIMEOUT')
    expect(shown(wrapper)).toContain('(43)')
    expect(wrapper.find('[title="Warning"]').exists()).toBe(true)
  })

  it('shows an event missing from the templates by its code', () => {
    const wrapper = mountField({ modelValue: 99 })
    expect(shown(wrapper)).toContain('#99')
  })

  it('shows the empty label when nothing is picked', () => {
    const wrapper = mountField({ modelValue: 0, emptyLabel: '(none)' })
    expect(shown(wrapper)).toContain('(none)')
    expect(wrapper.find('.status-icon').exists()).toBe(false)
  })

  it('clears to 0', async () => {
    const wrapper = mountField({ modelValue: 43, clearable: true })
    await wrapper.find('button[aria-label="Clear"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])
  })

  describe('by name', () => {
    it('finds the template by name', () => {
      const wrapper = mountField({ modelValue: 'SYS_THRESHOLD_REACHED', by: 'name' })
      expect(shown(wrapper)).toContain('(17)')
      expect(wrapper.find('[title="Major"]').exists()).toBe(true)
      expect(picker(wrapper).props('modelValue')).toBe(17)
    })

    it('keeps a name it cannot find as it is', () => {
      const wrapper = mountField({ modelValue: 'CUSTOM_EVENT', by: 'name' })
      expect(shown(wrapper)).toContain('CUSTOM_EVENT')
    })

    it('stores a picked event by name', async () => {
      const wrapper = mountField({ modelValue: '', by: 'name' })
      await picker(wrapper).vm.$emit('update:modelValue', 43)
      expect(wrapper.emitted('update:modelValue')).toEqual([['SYS_ALARM_TIMEOUT']])
    })

    it('clears to an empty name', async () => {
      const wrapper = mountField({
        modelValue: 'SYS_THRESHOLD_REACHED',
        by: 'name',
        clearable: true,
      })
      await wrapper.find('button[aria-label="Clear"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    })
  })
})
