import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import QuickActionsGrid from '../QuickActionsGrid.vue'

const outstanding = ref(0)
vi.mock('@/composables/useAlarmAttention', () => ({
  useAlarmAttention: () => ({ count: outstanding }),
}))

function badgeOfAlarmsTile() {
  const wrapper = mount(QuickActionsGrid, {
    global: { stubs: { QuickActionCard: true } },
  })
  return wrapper
    .findAllComponents({ name: 'QuickActionCard' })
    .find((card) => card.props('title') === 'Alarms')
    .props('badge')
}

describe('QuickActionsGrid', () => {
  it('counts outstanding alarms on the Alarms tile', () => {
    outstanding.value = 4

    expect(badgeOfAlarmsTile()).toBe(4)
  })
})
