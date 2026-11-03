import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'

function mountLabel(props) {
  return mount(AlarmIconLabel, {
    props,
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

describe('AlarmIconLabel', () => {
  it('renders a severity code as its icon, palette color and capitalized label', () => {
    const wrapper = mountLabel({ type: 'severity', value: 3 })
    const icon = wrapper.find('svg.status-icon')
    expect(icon.classes()).toContain('lucide-diamond-alert')
    expect(icon.attributes('style')).toContain('var(--netxms-status-major)')
    expect(wrapper.text()).toBe('Major')
  })

  it('falls back to Normal for a severity it does not know', () => {
    const wrapper = mountLabel({ type: 'severity', value: 'bogus' })
    expect(wrapper.find('svg.status-icon').classes()).toContain('lucide-circle-check')
    expect(wrapper.text()).toBe('Normal')
  })

  it('accepts the string form the API may send', () => {
    expect(mountLabel({ type: 'severity', value: 'CRITICAL' }).text()).toBe('Critical')
    expect(mountLabel({ type: 'state', value: 'Acknowledged' }).text()).toBe('Acknowledged')
  })

  it('renders alarm states with the legacy icon shapes', () => {
    const icon = (value) => mountLabel({ type: 'state', value }).find('i').classes()
    expect(icon(0)).toContain('pi-lightbulb')
    expect(icon(1)).toContain('pi-flag')
    expect(icon(2)).toContain('pi-check-circle')
  })

  it('uses the filled flag for a sticky acknowledgment', () => {
    const wrapper = mountLabel({ type: 'state', value: 1, sticky: true })
    expect(wrapper.find('i').classes()).toContain('pi-flag-fill')
    expect(wrapper.text()).toBe('Acknowledged')
  })

  it('marks table cells collapsible so the container query can hide the label', () => {
    expect(mountLabel({ type: 'state', value: 0, collapsible: true }).classes()).toEqual(
      expect.arrayContaining(['alarm-icon-label--collapsible', 'alarm-icon-label--state']),
    )
    expect(mountLabel({ type: 'state', value: 0 }).classes()).not.toContain(
      'alarm-icon-label--collapsible',
    )
  })
})
