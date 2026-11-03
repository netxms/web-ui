import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import AreaDetailPanel from '@/components/geographical-areas/AreaDetailPanel.vue'

vi.mock('@/queries/useGeographicalAreaQueries', () => ({
  useUpdateGeographicalArea: () => ({ mutate: vi.fn(), isPending: ref(false) }),
  useDeleteGeographicalArea: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}))

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

enableAutoUnmount(afterEach)

function polygon(points) {
  const coords = points.map(([lat, lng]) => [lng, lat])
  coords.push(coords[0])
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } }
}

const AREA = {
  id: 1,
  name: 'test',
  comments: '',
  bounds: null,
  geoJson: polygon([
    [56.9, 23.95],
    [56.88, 23.94],
    [56.9, 24.03],
    [56.92, 24.01],
  ]),
}

// Like GeographicalAreasSection: every `update:editGeoJson` comes straight back in as the prop.
async function mountEditing() {
  const wrapper = mount(AreaDetailPanel, {
    attachTo: document.body,
    props: {
      area: AREA,
      isEditingGeometry: false,
      editGeoJson: null,
      'onUpdate:editGeoJson': (geoJson) => wrapper.setProps({ editGeoJson: geoJson }),
    },
    global: { plugins: [PrimeVue], directives: { tooltip: {} } },
  })
  await wrapper.setProps({
    editGeoJson: JSON.parse(JSON.stringify(AREA.geoJson)),
    isEditingGeometry: true,
  })
  return wrapper
}

const rowCount = (wrapper) => wrapper.findAll('.coord-table tbody tr').length

describe('AreaDetailPanel boundary points', () => {
  it('lists one row per polygon vertex', async () => {
    const wrapper = await mountEditing()
    expect(rowCount(wrapper)).toBe(4)
  })

  it('keeps the blank row that "Add point" appends', async () => {
    const wrapper = await mountEditing()
    const addButton = wrapper.findAll('button').find((b) => b.text() === 'Add point')
    await addButton.trigger('click')
    await flushPromises()
    expect(rowCount(wrapper)).toBe(5)
    const lastRowInput = wrapper.find('.coord-table tbody tr:last-child input')
    expect(document.activeElement).toBe(lastRowInput.element)
  })

  it('still rebuilds the rows when the map adds a vertex', async () => {
    const wrapper = await mountEditing()
    const ring = AREA.geoJson.geometry.coordinates[0]
    const coords = [...ring.slice(0, 2), [23.98, 56.91], ...ring.slice(2)]
    await wrapper.setProps({
      editGeoJson: { ...AREA.geoJson, geometry: { type: 'Polygon', coordinates: [coords] } },
    })
    expect(rowCount(wrapper)).toBe(5)
  })
})
