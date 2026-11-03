import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import HomeView from '@/views/home/HomeView.vue'

const state = vi.hoisted(() => ({ whatsNew: true }))

vi.mock('@/brands', () => ({
  get brand() {
    return { whatsNew: state.whatsNew }
  },
}))

vi.mock('@/queries/useServerQueries', async () => {
  const { ref } = await import('vue')
  return {
    useClientConfigurationHints: () => ({ hintAsBoolean: () => true, isLoading: ref(false) }),
  }
})

const grid = () => shallowMount(HomeView).find('.home-content-grid')

describe('HomeView whats-new gate', () => {
  it('shows the panel for a brand that carries NetXMS news', () => {
    state.whatsNew = true
    expect(grid().classes()).not.toContain('no-changelog')
  })

  it('hides the panel for a brand that does not', () => {
    state.whatsNew = false
    expect(grid().classes()).toContain('no-changelog')
  })
})
