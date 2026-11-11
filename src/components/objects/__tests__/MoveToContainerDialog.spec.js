import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'

const { fullObject, parentsById } = vi.hoisted(() => ({
  fullObject: { value: null },
  parentsById: { value: new Map() },
}))

vi.mock('@/queries/useObjectQueries', async () => {
  const { computed: c, toValue } = await import('vue')
  return {
    useObject: (id) => ({
      data: c(() => (toValue(id) ? fullObject.value : null)),
      isLoading: ref(false),
    }),
    useObjectsByIds: (ids) => ({
      unresolvedIds: c(() => toValue(ids).filter((i) => !parentsById.value.has(i))),
      objectsById: c(
        () =>
          new Map(
            toValue(ids)
              .filter((i) => parentsById.value.has(i))
              .map((i) => [i, parentsById.value.get(i)]),
          ),
      ),
    }),
  }
})

const MoveToContainerDialog = (await import('../MoveToContainerDialog.vue')).default

const PickerStub = defineComponent({
  props: { objects: Array, excludeIds: Array, confirmDisabled: Boolean, multiSelect: Boolean },
  emits: ['select', 'update:visible'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'picker', 'data-disabled': String(props.confirmDisabled) },
        slots.default?.(),
      )
  },
})

// PrimeVue's Select needs matchMedia, which jsdom lacks.
const SelectStub = defineComponent({
  name: 'SelectStub',
  props: { modelValue: Number, options: Array },
  emits: ['update:modelValue'],
  setup: () => () => h('div', { class: 'select' }),
})

const HALL_A = { id: 20, name: 'Hall A', class: 'Room' }
const HALL_B = { id: 21, name: 'Hall B', class: 'Room' }
const POWER = { id: 22, name: 'Feed A', class: 'PowerDomain' }
const RACK = { id: 5, name: 'R01', class: 'Rack' }
const TARGET = { id: 30, name: 'Hall C', class: 'Room' }

function mountDialog(props) {
  return mount(MoveToContainerDialog, {
    props: { visible: true, ...props },
    global: { plugins: [PrimeVue], stubs: { ContainerPickerDialog: PickerStub, Select: SelectStub } },
  })
}

function pick(wrapper, target = TARGET) {
  wrapper.findComponent(PickerStub).vm.$emit('select', target)
  return wrapper.emitted('select')?.[0]?.[0]
}

beforeEach(() => {
  fullObject.value = null
  parentsById.value = new Map([
    [HALL_A.id, HALL_A],
    [HALL_B.id, HALL_B],
    [POWER.id, POWER],
  ])
})

describe('MoveToContainerDialog', () => {
  it('moves from the tree row the menu was opened on', () => {
    const wrapper = mountDialog({ objects: [RACK], treeParents: new Map([[RACK.id, HALL_A]]) })

    expect(wrapper.text()).toContain('from Hall A to:')
    expect(wrapper.findComponent(PickerStub).props('excludeIds')).toEqual([HALL_A.id])
    expect(pick(wrapper)).toEqual({ target: TARGET, moves: [{ object: RACK, source: HALL_A }] })
  })

  it('finds the only container when the row is unknown', () => {
    fullObject.value = { ...RACK, parents: [HALL_A.id, 99] }
    const wrapper = mountDialog({ objects: [RACK] })

    expect(wrapper.text()).toContain('from Hall A to:')
    expect(pick(wrapper).moves[0].source).toEqual(HALL_A)
  })

  it('asks which container to move from when there are several', () => {
    fullObject.value = { ...RACK, parents: [HALL_A.id, HALL_B.id, POWER.id] }
    const wrapper = mountDialog({ objects: [RACK] })

    const select = wrapper.findComponent(SelectStub)
    expect(select.props('options').map((o) => o.name)).toEqual(['Hall A', 'Hall B', 'Feed A'])
    select.vm.$emit('update:modelValue', HALL_B.id)
    return wrapper.vm.$nextTick().then(() => {
      expect(pick(wrapper).moves[0].source).toEqual(HALL_B)
    })
  })

  it('blocks the move of an object outside every container', () => {
    fullObject.value = { ...RACK, parents: [99] }
    const wrapper = mountDialog({ objects: [RACK] })

    expect(wrapper.text()).toContain('is not in any container')
    expect(wrapper.find('.picker').attributes('data-disabled')).toBe('true')
    expect(pick(wrapper)).toBeUndefined()
  })

  it('moves a range from each row, offering the shared source only when there is one', () => {
    const other = { id: 6, name: 'R02', class: 'Rack' }
    const wrapper = mountDialog({
      objects: [RACK, other],
      treeParents: new Map([
        [RACK.id, HALL_A],
        [other.id, HALL_B],
      ]),
    })

    expect(wrapper.findComponent(PickerStub).props('excludeIds')).toEqual([])
    expect(pick(wrapper).moves.map((m) => m.source.id)).toEqual([HALL_A.id, HALL_B.id])
  })
})
