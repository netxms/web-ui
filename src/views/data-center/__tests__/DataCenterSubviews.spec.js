import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { getDemoFacilityTrees } from '@/api/dataCenterApi'
import { DEMO_DATA_CENTER } from '@/api/demoSeeds'
import { userPrefs } from '@/utils/appStorage'
import { adaptBaseObject } from '@/api/objectAdapters'
import { indexNodes } from '@/utils/dataCenter'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, hash: '' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: () => {},
  onBeforeRouteUpdate: () => {},
}))
// Nav bindings import the app router, which would pull in the whole route table.
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))

window.matchMedia ??= () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})

const FloorPlanView = (await import('../subviews/FloorPlanView.vue')).default
const PowerChainView = (await import('../subviews/PowerChainView.vue')).default
const CoolingView = (await import('../subviews/CoolingView.vue')).default
const FacilityOverviewView = (await import('../subviews/FacilityOverviewView.vue')).default

const nodes = indexNodes(getDemoFacilityTrees().map(adaptBaseObject))
const byName = (name) => [...nodes.values()].find((node) => node.name === name)

function mountView(component, object, extraProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(component, {
    props: { object, ...extraProps },
    global: {
      plugins: [
        createPinia(),
        [VueQueryPlugin, { queryClient }],
        PrimeVue,
        ToastService,
        ConfirmationService,
      ],
      directives: { tooltip: Tooltip },
    },
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('FloorPlanView on the demo room', () => {
  it('draws the placed racks and lists what needs attention', async () => {
    const wrapper = mountView(FloorPlanView, byName('Hall A'))
    await flushPromises()

    expect(wrapper.findAll('.fp-rack')).toHaveLength(16)
    expect(wrapper.text()).toContain('16 of 18 racks placed')
    const attention = wrapper.findAll('.fp-list__row').map((row) => row.text())
    expect(attention[0]).toContain('A05')
    expect(attention[0]).toContain('30.8 °C')
    expect(attention[1]).toContain('B07')
    expect(wrapper.findAll('.fp-chip').map((chip) => chip.text())).toEqual(['A09', 'A10'])
    expect(wrapper.findAll('.fp-aisle-hot')).toHaveLength(1)
  })

  it('colors racks by inlet temperature and outlines the ones in trouble', async () => {
    const wrapper = mountView(FloorPlanView, byName('Hall A'))
    await flushPromises()
    await wrapper
      .findAll('.p-togglebutton')
      .find((b) => b.text() === 'Inlet')
      .trigger('click')
    await flushPromises()

    const fills = wrapper.findAll('.fp-rack-body').map((body) => body.attributes('fill'))
    expect(new Set(fills).size).toBeGreaterThan(3)
    expect(fills.every((fill) => !fill.startsWith('url('))).toBe(true)
    expect(wrapper.findAll('.fp-rack-ring')).toHaveLength(2)
  })

  it('shows the picked rack with its feeds', async () => {
    const wrapper = mountView(FloorPlanView, byName('Hall A'))
    await flushPromises()
    await wrapper.findAll('.fp-list__row')[0].trigger('click')

    const inspector = wrapper.find('.fp-selected-head').element.parentElement.textContent
    expect(inspector).toContain('Feed A')
    expect(inspector).toContain('Feed B')
    expect(inspector).toContain('front north')
  })
})

describe('FloorPlanView on a room without racks', () => {
  it('leaves out the rack overlays and the inspector', async () => {
    const wrapper = mountView(FloorPlanView, byName('Electrical Room E1'))
    await flushPromises()

    expect(wrapper.text()).toContain('No racks')
    expect(wrapper.text()).not.toContain('Selected rack')
    expect(wrapper.find('.p-selectbutton').exists()).toBe(false)
  })

  it('turns the label of a tall element along its length', async () => {
    const wrapper = mountView(FloorPlanView, byName('Electrical Room E1'))
    await flushPromises()

    const label = wrapper.findAll('.fp-el-label').find((t) => t.text() === 'Main switchboard MSB-1')
    expect(label.attributes('transform')).toMatch(/^rotate\(-90 /)
    const across = wrapper.findAll('.fp-el-label').find((t) => t.text() === 'UPS-A cabinet')
    expect(across.attributes('transform')).toBeUndefined()
  })
})

describe('PowerChainView on the demo facility', () => {
  it('flags the PDUs that would exceed their rating when a feed is lost', async () => {
    const wrapper = mountView(PowerChainView, byName('DC-Alpha Site'))
    await flushPromises()

    expect(wrapper.findAll('.pc-row')).toHaveLength(8)
    const risks = wrapper.findAll('.pc-risk-list li').map((li) => li.text())
    expect(risks).toHaveLength(2)
    expect(risks.join(' ')).toContain('PDU-B2 would carry 58.1 kW of 50.0 kW')
    expect(risks.join(' ')).toContain('PDU-A2 would carry 58.1 kW')
  })

  it('takes the lost feed off and doubles up its partner', async () => {
    const wrapper = mountView(PowerChainView, byName('DC-Alpha Site'))
    await flushPromises()
    await wrapper
      .findAll('.p-togglebutton')
      .find((b) => b.text() === 'Feed B lost')
      .trigger('click')
    await flushPromises()

    const text = (name) =>
      wrapper
        .findAll('.pc-row')
        .find((row) => row.find('.pc-link').text() === name)
        .text()
    expect(text('UPS-B')).toContain('No supply')
    expect(text('UPS-A')).toContain('107.8 / 250.0 kW')
    expect(text('PDU-A2')).toContain('over rating by 8.1 kW')
  })
})

describe('PowerChainView on one UPS', () => {
  it('checks the branch against partners outside it', async () => {
    const wrapper = mountView(PowerChainView, byName('UPS-A'), {
      facility: byName('DC-Alpha Site'),
    })
    await flushPromises()

    expect(wrapper.findAll('.pc-link').map((link) => link.text())).toEqual([
      'UPS-A',
      'PDU-A1',
      'PDU-A2',
    ])
    const options = wrapper.findAll('.p-togglebutton').map((b) => b.text())
    expect(options).toEqual(['All feeds', 'Feed A lost', 'Feed B lost'])
    const risks = wrapper.findAll('.pc-risk-list li').map((li) => li.text())
    expect(risks).toHaveLength(1)
    expect(risks[0]).toContain('PDU-A2 would carry 58.1 kW of 50.0 kW (116 %) if feed B is lost')
  })
})

describe('FloorPlanView overlays from layouts, alarms and feeds', () => {
  afterEach(() => userPrefs.remove('dataCenter.floorPlanOverlay'))

  async function fillsWith(overlay) {
    userPrefs.set('dataCenter.floorPlanOverlay', overlay)
    const wrapper = mountView(FloorPlanView, byName('Hall A'))
    await flushPromises()
    const fill = (name) =>
      wrapper
        .findAll('.fp-rack')
        .find((rack) => rack.attributes('aria-label') === name)
        .find('.fp-rack-body')
        .attributes('fill')
    return { wrapper, fill }
  }

  it('colors racks by free units, the full one palest', async () => {
    const { wrapper, fill } = await fillsWith('free')
    expect(fill('B07')).toBe('#aca1df')
    expect(fill('A05')).toBe('#917fd7')
    expect(fill('B05')).toBe('#795ec9')
    expect(fill('A03')).toBe('#6040b0')
    expect(fill('B08')).toBe('#482a89')
    expect(wrapper.text()).toContain('Free rack units')
  })

  it('counts the alarms of A05 and B07 only', async () => {
    const { wrapper, fill } = await fillsWith('alarms')
    expect(fill('A05')).toBe('#aeaca6')
    expect(fill('B07')).toBe('#aeaca6')
    expect(fill('A01')).toBe('#e6e5e1')
    expect(wrapper.findAll('.fp-rack-ring')).toHaveLength(2)
  })

  it('shows A03 leaning on feed A and A07 on feed B', async () => {
    const { wrapper, fill } = await fillsWith('feeds')
    expect(fill('A03')).toBe('#b94f87')
    expect(fill('A07')).toBe('#008b96')
    expect(fill('A01')).toBe('#e6e5e1')
    expect(wrapper.text()).toContain('A 65 % and above')
  })

  it('lists free units, alarms and the split for the picked rack', async () => {
    const wrapper = mountView(FloorPlanView, byName('Hall A'))
    await flushPromises()
    await wrapper.findAll('.fp-list__row')[0].trigger('click')

    const inspector = wrapper.find('.fp-selected-head').element.parentElement.textContent
    expect(inspector).toContain('A05')
    expect(inspector).toMatch(/Free\s*4 U/)
    expect(inspector).toMatch(/Alarms\s*1/)
    expect(inspector).toContain('A 52 % · B 48 %')
  })
})

describe('CoolingView on the demo facility', () => {
  it('lists the plant and its zones with temperatures and load', async () => {
    const wrapper = mountView(CoolingView, byName('DC-Alpha Site'))
    await flushPromises()

    const rows = wrapper.findAll('.cl-row').map((row) => row.text().replace(/\s+/g, ' '))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Chiller Plant')
    expect(rows[0]).toContain('121.4 / 400.0 kW · 30 %')
    expect(rows[0]).toContain('draws 24.0 kW')
    expect(rows[0]).toContain('supply 12.1 · return 18.4 °C')
    expect(rows[0]).toContain('water · ΔT 6.3 K')
    expect(rows[1]).toContain('Hall A Cooling')
    expect(rows[1]).toContain('101.3 / 160.0 kW · 63 %')
    expect(rows[1]).toContain('air · ΔT 14.5 K')
    expect(rows[2]).toContain('6.5 / 20.0 kW')
    expect(rows[2]).not.toContain('draws')
    expect(wrapper.find('.cl-toolbar').text()).toContain('Outdoor 8.4 °C')
  })

  it('takes the outdoor temperature from the facility on a zone', async () => {
    const wrapper = mountView(CoolingView, byName('Hall A Cooling'), {
      facility: byName('DC-Alpha Site'),
    })
    await flushPromises()

    expect(wrapper.findAll('.cl-link').map((link) => link.text())).toEqual(['Hall A Cooling'])
    expect(wrapper.find('.cl-toolbar').text()).toContain('8.4 °C')
  })

  describe('with a zone that has no DCIs and no rating', () => {
    const zone = () => byName('Meet-Me Room Cooling')
    let saved
    beforeEach(() => {
      const id = zone().id
      saved = { dcis: DEMO_DATA_CENTER.dcis[id], group: DEMO_DATA_CENTER.objects[id].coolingZone }
      DEMO_DATA_CENTER.dcis[id] = []
      DEMO_DATA_CENTER.objects[id].coolingZone = { ...saved.group, ratedCapacity: 0 }
    })
    afterEach(() => {
      const id = zone().id
      DEMO_DATA_CENTER.dcis[id] = saved.dcis
      DEMO_DATA_CENTER.objects[id].coolingZone = saved.group
    })

    it('says so instead of drawing a bar', async () => {
      const wrapper = mountView(CoolingView, zone())
      await flushPromises()

      const row = wrapper.find('.cl-row')
      expect(row.text()).toContain('No cooling metrics')
      expect(row.find('.load-bar--none').exists()).toBe(true)
      expect(wrapper.find('.cl-toolbar').text()).toContain('No outdoor temperature')
    })
  })

  it('explains an empty facility', async () => {
    const facility = { ...byName('DC-Alpha Site'), children: [] }
    const wrapper = mountView(CoolingView, facility)
    await flushPromises()

    expect(wrapper.text()).toContain('No cooling zones')
    expect(wrapper.find('.cl-rows').exists()).toBe(false)
  })
})

describe('FacilityOverviewView on the demo facility', () => {
  const text = (el) => el.text().replace(/\s+/g, ' ').trim()

  it('shows the live figures in power, cooling and water rows', async () => {
    const wrapper = mountView(FacilityOverviewView, byName('DC-Alpha Site'))
    await flushPromises()

    const tiles = wrapper.findAll('.figure-tile').map((tile) => ({
      label: text(tile.find('.figure-tile__label')),
      value: text(tile.find('.figure-tile__value')),
      tone: tile.attributes('style'),
    }))
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Facility power', '149.6kW'],
      ['IT load', '107.8kW'],
      ['PUE', '1.39'],
      ['Cooling power', '31.8kW'],
      ['Heat exported', '38.0kW'],
      ['Outdoor', '8.4°C'],
      ['Water intake', '0.23m³/h'],
      ['Grid carbon intensity', '236gCO₂/kWh'],
      ['Grid renewable share', '41%'],
    ])
    expect(tiles[0].tone).toContain('--p-amber-400')
    expect(tiles[3].tone).toContain('--p-sky-400')
    expect(tiles[6].tone).toContain('--p-teal-400')
    expect(wrapper.find('.fo-share__fill').attributes('style')).toContain('width: 41.3%')
    expect(wrapper.text()).toContain('meter 1,842 m³')
    // Where each figure comes from sits behind an info icon, not in a footnote.
    expect(wrapper.findAll('.figure-tile .info-hint')).toHaveLength(9)
    expect(wrapper.find('.figure-tile .info-hint').attributes('aria-label')).toBe(
      'About Facility power: power.feed of the grid entry domains plus power.gen of the generator domains.',
    )
    expect(wrapper.text()).not.toContain('Facility power is')
  })

  it('splits the facility power into IT, cooling, UPS losses and the rest', async () => {
    const wrapper = mountView(FacilityOverviewView, byName('DC-Alpha Site'))
    await flushPromises()

    expect(text(wrapper.find('.fo-split .fo-section__title'))).toBe('Where 149.6 kW goes')
    expect(wrapper.findAll('.fo-split__legend li').map(text)).toEqual([
      'IT 107.8 kW · 72 %',
      'Cooling 31.8 kW · 21 %',
      'UPS losses 5.0 kW · 3 %',
      'Other 5.0 kW · 3 %',
    ])
    expect(wrapper.find('.fo-split').text()).not.toContain('add up to')
  })

  it('lists the hot racks and the failover shortfall, each linked', async () => {
    const wrapper = mountView(FacilityOverviewView, byName('DC-Alpha Site'))
    await flushPromises()

    const findings = wrapper.findAll('.fo-finding')
    expect(findings.map((f) => f.attributes('aria-label'))).toEqual([
      'A05, Hall A, inlet 30.8 °C',
      'B07, Hall A, inlet 27.4 °C',
      'PDU-B2, if feed A is lost, 58.1 of 50.0 kW',
      'PDU-A2, if feed B is lost, 58.1 of 50.0 kW',
    ])
    expect(text(findings[0].find('.fo-finding__reason'))).toBe('inlet 30.8 °C')
    expect(findings.every((f) => f.element.tagName === 'A')).toBe(true)
    expect(text(wrapper.findAll('.info-card-summary')[0])).toBe('4')
  })

  it('counts statuses per kind and names only the objects in trouble', async () => {
    const wrapper = mountView(FacilityOverviewView, byName('DC-Alpha Site'))
    await flushPromises()

    const groups = wrapper.findAll('.fo-status__group').map((group) => ({
      title: text(group.find('.fo-status__title')),
      counts: text(group.find('.fo-status__counts')),
      chips: group.findAll('.fo-chip').map(text),
      normal: group.find('.fo-status__normal').exists()
        ? text(group.find('.fo-status__normal'))
        : null,
    }))
    expect(groups).toEqual([
      { title: 'Rooms', counts: '1 Major · 2 Normal', chips: ['Hall A'], normal: '+ 2 normal' },
      {
        title: 'Power domains',
        counts: '5 Major · 2 Minor · 1 Normal',
        chips: ['PDU-A1', 'PDU-B1', 'UPS-A', 'UPS-B', 'Utility Feed', 'PDU-A2', 'PDU-B2'],
        normal: '+ 1 normal',
      },
      {
        title: 'Cooling zones',
        counts: '2 Major · 1 Normal',
        chips: ['Chiller Plant', 'Hall A Cooling'],
        normal: '+ 1 normal',
      },
    ])
    expect(wrapper.findAll('.fo-status__bar')[0].findAll('span')).toHaveLength(2)
  })

  it('shows dashes, no split and no status for a facility with nothing below it', async () => {
    const facility = { ...byName('DC-Alpha Site'), children: [] }
    const wrapper = mountView(FacilityOverviewView, facility)
    await flushPromises()

    const pue = wrapper.findAll('.figure-tile').find((f) => f.text().includes('PUE'))
    expect(text(pue.find('.figure-tile__value'))).toBe('—')
    expect(wrapper.find('.fo-split').exists()).toBe(false)
    expect(wrapper.text()).toContain('No rooms, power domains or cooling zones')
    expect(wrapper.text()).toContain('no rack power metrics')
    expect(wrapper.text()).toContain('no cooling.power metric')
    expect(text(wrapper.findAll('.info-card-summary')[0])).toBe('All clear')
  })
})

// Last in the file: the edit stays in the module's demo store for the tests after it.
describe('FloorPlanView editing a demo room', () => {
  it('keeps the change in the tab and sends nothing to the server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const wrapper = mountView(FloorPlanView, byName('Meet-Me Room'))
    await flushPromises()
    expect(wrapper.text()).toContain('floor plan edits stay in this tab')

    await wrapper
      .findAll('.mode-switch-btn')
      .find((b) => b.text() === 'Edit')
      .trigger('click')
    await flushPromises()
    const canvas = wrapper.findComponent({ name: 'FloorPlanCanvas' })
    const rack = canvas.props('plan').racks.find((r) => r.name === 'MMR-01')
    canvas.vm.$emit('activate', `r:${rack.id}`)
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('.fp-edit-bar').exists()).toBe(false)
    const after = wrapper.findComponent({ name: 'FloorPlanCanvas' }).props('plan')
    expect(after.racks.find((r) => r.name === 'MMR-01')).toMatchObject({ x: 1200, y: 1200 })
    const writes = fetchSpy.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')
    expect(writes).toEqual([])
    fetchSpy.mockRestore()
    wrapper.unmount()
  })
})
