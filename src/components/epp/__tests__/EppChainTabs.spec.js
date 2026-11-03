import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppChainTabs from '@/components/epp/EppChainTabs.vue'

const chains = [
  { id: 0, name: 'Default policy', ruleCount: 6, callerCount: 0 },
  { id: 2, name: 'Escalation', description: 'Repeated conditions', ruleCount: 2, callerCount: 2 },
  { id: 3, name: 'Backup handling', ruleCount: 1, callerCount: 1 },
]

function mountTabs(props) {
  return mount(EppChainTabs, {
    props: { chains, activeChainId: 0, ...props },
    attachTo: document.body,
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

/** More chains than a narrow strip can show. */
function manyChains() {
  return [
    { id: 0, name: 'Default policy', ruleCount: 1, callerCount: 0 },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: i + 2,
      name: `Chain ${i + 2}`,
      ruleCount: 0,
      callerCount: 1,
    })),
  ]
}

// jsdom reports zero for every layout box, so overflow is staged by hand.
async function stageOverflow(wrapper, { clientWidth, tabWidth = 100, scrollLeft = 0 }) {
  const strip = wrapper.find('.chain-tab-scroll')
  const tabs = wrapper.findAll('[data-tab-key]')
  tabs.forEach((tab, index) => {
    Object.defineProperty(tab.element, 'offsetLeft', {
      value: index * tabWidth,
      configurable: true,
    })
    Object.defineProperty(tab.element, 'offsetWidth', { value: tabWidth, configurable: true })
  })
  Object.defineProperty(strip.element, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(strip.element, 'scrollWidth', {
    value: tabs.length * tabWidth,
    configurable: true,
  })
  strip.element.scrollLeft = scrollLeft
  await strip.trigger('scroll')
  return strip
}

function overflowMenuLabels() {
  return [...document.querySelectorAll('.p-menu-item-label')].map((n) => n.textContent.trim())
}

describe('EppChainTabs', () => {
  it('labels the main chain from its id, not the seeded server name', () => {
    const wrapper = mountTabs()
    expect(wrapper.findAll('.chain-tab-label').map((t) => t.text())).toEqual([
      'Main',
      'Escalation',
      'Backup handling',
    ])
  })

  it('shows each chain rule count', () => {
    const wrapper = mountTabs()
    expect(wrapper.findAll('.chain-tab-count').map((t) => t.text())).toEqual(['6', '2', '1'])
  })

  it('marks the active chain', () => {
    const wrapper = mountTabs({ activeChainId: 2 })
    const active = wrapper.findAll('.chain-tab').filter((t) => t.classes('active'))
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('Escalation')
    expect(active[0].attributes('aria-selected')).toBe('true')
  })

  it('marks a chain with unsaved edits', () => {
    const wrapper = mountTabs({ dirtyChainIds: new Set([2]) })
    const tabs = wrapper.findAll('.chain-tab')
    expect(tabs[1].classes()).toContain('dirty')
    expect(tabs[0].classes()).not.toContain('dirty')
    expect(tabs[1].find('.chain-tab-dirty').exists()).toBe(true)
  })

  it('marks every dirty chain, not only the one on screen', () => {
    const wrapper = mountTabs({ activeChainId: 0, dirtyChainIds: new Set([0, 3]) })
    const tabs = wrapper.findAll('.chain-tab')
    expect(tabs.map((t) => t.classes('dirty'))).toEqual([true, false, true])
    expect(wrapper.findAll('.chain-tab-dirty')).toHaveLength(2)
  })

  it('emits select on click', async () => {
    const wrapper = mountTabs()
    await wrapper.findAll('.chain-tab')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
  })

  it('offers the new-chain button only to users who can manage the policy', () => {
    expect(mountTabs({ canManage: false }).find('[aria-label="New chain"]').exists()).toBe(false)
    expect(mountTabs({ canManage: true }).find('[aria-label="New chain"]').exists()).toBe(true)
  })

  describe('overflow', () => {
    it('keeps every chain on the strip and scrolls instead of dropping any', () => {
      const wrapper = mountTabs({ chains: manyChains() })
      expect(wrapper.findAll('.chain-tab')).toHaveLength(10)
    })

    it('keeps the scroll container out of the tab order', () => {
      expect(mountTabs().find('.chain-tab-scroll').attributes('tabindex')).toBe('-1')
    })

    it('hides the overflow button while every chain fits', async () => {
      const wrapper = mountTabs()
      await stageOverflow(wrapper, { clientWidth: 400 })
      expect(wrapper.find('.chain-tab-overflow').exists()).toBe(false)
    })

    it('shows the overflow button with a count once chains no longer fit', async () => {
      const wrapper = mountTabs()
      await stageOverflow(wrapper, { clientWidth: 150 })
      const button = wrapper.find('.chain-tab-overflow')
      expect(button.exists()).toBe(true)
      expect(button.attributes('aria-label')).toBe('Show hidden chains (2)')
    })

    it('marks the edges the strip can still scroll towards', async () => {
      const wrapper = mountTabs()
      const strip = await stageOverflow(wrapper, { clientWidth: 150 })
      expect(strip.classes()).toContain('can-scroll-right')
      expect(strip.classes()).not.toContain('can-scroll-left')
    })

    it('lists exactly the hidden chains in the overflow menu', async () => {
      const wrapper = mountTabs()
      await stageOverflow(wrapper, { clientWidth: 150 })
      await wrapper.find('.chain-tab-overflow').trigger('click')
      expect(overflowMenuLabels()).toEqual(['Escalation', 'Backup handling'])
      wrapper.unmount()
    })

    it('selects a chain chosen from the overflow menu', async () => {
      const wrapper = mountTabs()
      await stageOverflow(wrapper, { clientWidth: 150 })
      await wrapper.find('.chain-tab-overflow').trigger('click')
      await document.querySelectorAll('.p-menu-item-link')[1].click()
      expect(wrapper.emitted('select')?.at(-1)).toEqual([3])
      wrapper.unmount()
    })

    it('scrolls a chain into view when it becomes active off-screen', async () => {
      const wrapper = mountTabs({ chains: manyChains() })
      const strip = await stageOverflow(wrapper, { clientWidth: 200 })
      expect(strip.element.scrollLeft).toBe(0)

      await wrapper.setProps({ activeChainId: 10 })
      await nextTick()
      expect(strip.element.scrollLeft).toBe(800)
    })

    it('scrolls the strip sideways on a plain vertical wheel', async () => {
      const wrapper = mountTabs()
      const strip = await stageOverflow(wrapper, { clientWidth: 150 })
      const event = new WheelEvent('wheel', { deltaY: 50, cancelable: true, bubbles: true })
      strip.element.dispatchEvent(event)
      expect(strip.element.scrollLeft).toBe(50)
      expect(event.defaultPrevented).toBe(true)
    })

    it('separates the new-chain button from the tabs', () => {
      expect(mountTabs({ canManage: true }).find('.chain-tab-actions-divider').exists()).toBe(true)
    })
  })

  describe('keyboard navigation', () => {
    it('is a single tab stop: only the active tab has tabindex 0', () => {
      const wrapper = mountTabs()
      expect(wrapper.findAll('.chain-tab').map((t) => t.attributes('tabindex'))).toEqual([
        '0',
        '-1',
        '-1',
      ])
    })

    it('keeps the scrolling strip out of the tab order', () => {
      expect(mountTabs().find('.chain-tab-bar-tabs').attributes('tabindex')).toBe('-1')
    })

    it('moves focus with arrow keys without switching chains', async () => {
      const wrapper = mountTabs()
      const tabs = wrapper.findAll('.chain-tab')

      await tabs[0].trigger('keydown', { key: 'ArrowRight' })
      expect(document.activeElement).toBe(tabs[1].element)
      expect(wrapper.emitted('select')).toBeUndefined()

      await tabs[1].trigger('keydown', { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(tabs[0].element)
    })

    it('wraps around at both ends and jumps with Home/End', async () => {
      const wrapper = mountTabs()
      const tabs = wrapper.findAll('.chain-tab')

      await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(tabs[2].element)

      await tabs[2].trigger('keydown', { key: 'Home' })
      expect(document.activeElement).toBe(tabs[0].element)

      await tabs[0].trigger('keydown', { key: 'End' })
      expect(document.activeElement).toBe(tabs[2].element)
    })

    it('does not let Up/Down scroll the page out from under the focused tab', async () => {
      const wrapper = mountTabs()
      const tab = wrapper.findAll('.chain-tab')[0]
      for (const key of ['ArrowUp', 'ArrowDown']) {
        const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
        tab.element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
      }
    })
  })
})
