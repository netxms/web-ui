import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import LogParserEditor from '@/components/log-parsers/LogParserEditor.vue'
import { parseXml } from '@/utils/logParserXml'

// jsdom has neither; PrimeVue components bind both on mount.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([]) }),
}))

function parserXml({ processAll = false } = {}) {
  return `<parser name="Main"${processAll ? ' processAll="true"' : ''}>
  <rules>
    <rule name="First" guid="g-1"><match>one</match><event>EV_ONE</event></rule>
    <rule name="Second" guid="g-2" break="true"><match>two</match><event>EV_TWO</event></rule>
    <rule guid="g-3"><match>three</match></rule>
  </rules>
</parser>`
}

function mountEditor(options = {}) {
  return mount(LogParserEditor, {
    props: { initialContent: parserXml(options), parserType: 'syslog' },
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: { EventPickerDialog: true },
    },
  })
}

const rows = (wrapper) => wrapper.findAll('.rule-row')
const selectedTitle = (wrapper) => wrapper.find('.rule-form-title').text()
const field = (wrapper, label) =>
  wrapper
    .findAll('.detail-field')
    .find((f) => f.find('.form-field__label').text() === label)
    .find('input')
const nameInput = (wrapper) => field(wrapper, 'Name')

function emittedNames(wrapper) {
  const content = wrapper.emitted('update:content').at(-1)[0]
  return parseXml(content).rules.map((r) => r.name)
}

describe('LogParserEditor', () => {
  it('lists the rules in order and opens the first one', () => {
    const wrapper = mountEditor()
    expect(rows(wrapper).map((r) => r.find('.row-title').text())).toEqual([
      'First',
      'Second',
      'Unnamed rule',
    ])
    expect(rows(wrapper)[0].attributes('aria-current')).toBe('true')
    expect(selectedTitle(wrapper)).toBe('Rule 1 of 3')
    expect(nameInput(wrapper).element.value).toBe('First')
  })

  it('shows the pattern, the event and set flags on each row', () => {
    const wrapper = mountEditor()
    const second = rows(wrapper)[1]
    expect(second.find('.rule-pattern').text()).toBe('two')
    expect(second.find('.rule-event').text()).toBe('EV_TWO')
    expect(second.find('[aria-label="Break"]').exists()).toBe(true)
    expect(rows(wrapper)[2].find('.rule-event').text()).toBe('(no event)')
  })

  it('opens a rule from the list and the parser settings from their entry', async () => {
    const wrapper = mountEditor()
    await rows(wrapper)[1].trigger('click')
    expect(selectedTitle(wrapper)).toBe('Rule 2 of 3')
    expect(nameInput(wrapper).element.value).toBe('Second')

    await wrapper.find('.settings-row').trigger('click')
    expect(wrapper.find('.rule-form').exists()).toBe(false)
    expect(wrapper.find('.detail-title').text()).toBe('Parser settings')
    expect(nameInput(wrapper).element.value).toBe('Main')
  })

  it('edits the selected rule', async () => {
    const wrapper = mountEditor()
    await rows(wrapper)[1].trigger('click')
    await nameInput(wrapper).setValue('Renamed')
    expect(emittedNames(wrapper)).toEqual(['First', 'Renamed', ''])
    expect(rows(wrapper)[1].find('.row-title').text()).toBe('Renamed')
  })

  it('adds a rule at the end and opens it', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[aria-label="Add rule"]').trigger('click')
    await nextTick()
    expect(rows(wrapper)).toHaveLength(4)
    expect(selectedTitle(wrapper)).toBe('Rule 4 of 4')
  })

  it('duplicates a rule right after itself and opens the copy', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[aria-label="Duplicate rule"]').trigger('click')
    await nextTick()
    expect(emittedNames(wrapper)).toEqual(['First', 'First (copy)', 'Second', ''])
    expect(selectedTitle(wrapper)).toBe('Rule 2 of 4')
  })

  it('moves the selected rule and keeps it selected', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[aria-label="Move down"]').trigger('click')
    await nextTick()
    expect(emittedNames(wrapper)).toEqual(['Second', 'First', ''])
    expect(selectedTitle(wrapper)).toBe('Rule 2 of 3')
    expect(nameInput(wrapper).element.value).toBe('First')
  })

  it('opens the next rule after a removal, or the previous one at the end', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[aria-label="Remove rule"]').trigger('click')
    await nextTick()
    expect(emittedNames(wrapper)).toEqual(['Second', ''])
    expect(nameInput(wrapper).element.value).toBe('Second')

    await rows(wrapper)[1].trigger('click')
    await wrapper.find('[aria-label="Remove rule"]').trigger('click')
    await nextTick()
    expect(nameInput(wrapper).element.value).toBe('Second')
  })

  it('falls back to the parser settings when the last rule goes', async () => {
    const wrapper = mountEditor()
    for (let i = 0; i < 3; i++) {
      await wrapper.find('[aria-label="Remove rule"]').trigger('click')
      await nextTick()
    }
    expect(wrapper.find('.list-empty').exists()).toBe(true)
    expect(wrapper.find('.detail-title').text()).toBe('Parser settings')
  })

  describe('Break and "Always process all rules"', () => {
    const breakCheckbox = (wrapper) => field(wrapper, 'Break')

    it('disables Break and says why while process-all is off', async () => {
      const wrapper = mountEditor()
      expect(wrapper.find('.rules-note').text()).toBe('Checked in order, first match stops')
      await rows(wrapper)[1].trigger('click')
      expect(breakCheckbox(wrapper).element.disabled).toBe(true)
      expect(wrapper.find('.break-hint').exists()).toBe(true)
    })

    it('enables Break while process-all is on', async () => {
      const wrapper = mountEditor({ processAll: true })
      expect(wrapper.find('.rules-note').text()).toBe('All rules checked, Break stops')
      await rows(wrapper)[1].trigger('click')
      expect(breakCheckbox(wrapper).element.disabled).toBe(false)
      expect(wrapper.find('.break-hint').exists()).toBe(false)
    })
  })

  it('disables the event tag until the rule has an event', async () => {
    const wrapper = mountEditor()
    const tagInput = () => field(wrapper, 'Event tag')
    expect(tagInput().element.disabled).toBe(false)
    await rows(wrapper)[2].trigger('click')
    expect(tagInput().element.disabled).toBe(true)
  })
})
