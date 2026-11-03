import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import PrimeVue from 'primevue/config'
import TargetsView from '../TargetsView.vue'

const toastAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: toastAdd }),
}))

const confirmRequire = vi.fn()
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: confirmRequire }),
}))

const routerPush = vi.fn()
const routerReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}))

// The object picker pulls in the router singleton (for new-tab hrefs), which cannot be
// constructed against the mocked vue-router.
vi.mock('@/router', () => ({
  default: { resolve: () => ({ href: '/' }), push: vi.fn(), replace: vi.fn() },
}))

const bindAsyncMock = vi.fn()
const unbindAsyncMock = vi.fn()
let targetsData

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectChildren: () => ({
    data: targetsData,
    isLoading: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
  }),
  useBindObjectChild: () => ({ mutateAsync: bindAsyncMock }),
  useUnbindObjectChild: () => ({ mutateAsync: unbindAsyncMock, isPending: ref(false) }),
  useZoneNames: () => ref(new Map([[1, 'Zone A']])),
}))

vi.mock('@/composables/useActions', () => ({
  useActions: () => ({
    menuItems: ref([{ label: 'Properties', icon: 'pi pi-cog', command: vi.fn() }]),
  }),
}))

const AppTableStub = defineComponent({
  props: ['columns', 'rows'],
  emits: ['retry', 'row-contextmenu'],
  template: `
    <div>
      <div v-for="row in rows" :key="row.id" class="stub-row" :data-row-id="row.id">
        <template v-for="col in columns" :key="col.id">
          <slot name="cell" :col="col" :row="row" />
        </template>
      </div>
      <slot name="empty" />
    </div>
  `,
})

const EntityContextMenuStub = defineComponent({
  props: ['items'],
  setup(props, { expose }) {
    const contextData = ref(null)
    function show(event, rowData) {
      contextData.value = rowData
    }
    expose({ show, contextData })
    return {}
  },
  template: `
    <div class="ctx-menu-stub">
      <button
        v-for="(item, i) in items.filter((it) => !it.separator)"
        :key="i"
        class="ctx-item"
        @click="item.command && item.command()"
      >{{ item.label }}</button>
    </div>
  `,
})

const DialogStub = defineComponent({
  props: ['visible', 'header'],
  emits: ['update:visible'],
  template: `
    <div v-if="visible" class="dialog-stub">
      <div class="dialog-header">{{ header }}</div>
      <slot />
      <slot name="footer" />
    </div>
  `,
})

const BindableObjectPickerDialogStub = defineComponent({
  props: ['visible', 'classes'],
  emits: ['update:visible', 'select'],
  template: '<div />',
})

function mountView(object = { id: 100, class: 'Template', name: 'tmpl' }) {
  return mount(TargetsView, {
    props: { object },
    global: {
      plugins: [PrimeVue],
      stubs: {
        AppTable: AppTableStub,
        EntityContextMenu: EntityContextMenuStub,
        Dialog: DialogStub,
        BindableObjectPickerDialog: BindableObjectPickerDialogStub,
      },
      config: {
        globalProperties: {
          $plural: (count, singular, plural = `${singular}s`) =>
            `${count} ${count === 1 ? singular : plural}`,
        },
      },
    },
  })
}

const nodeTarget = {
  id: 5,
  name: 'node-a',
  class: 'Node',
  status: 0,
  zoneUIN: 1,
  primaryName: 'node-a.local',
  sysDescription: 'Linux box',
}

beforeEach(() => {
  toastAdd.mockClear()
  confirmRequire.mockClear()
  routerPush.mockClear()
  routerReplace.mockClear()
  bindAsyncMock.mockReset()
  unbindAsyncMock.mockReset()
  targetsData = ref([nodeTarget])
})

async function openRowMenu(wrapper) {
  await wrapper.find('[aria-label="Actions"]').trigger('click')
}

describe('TargetsView', () => {
  it('merges local target actions with the generic object action menu', async () => {
    const wrapper = mountView()
    await openRowMenu(wrapper)
    const labels = wrapper.findAll('.ctx-item').map((el) => el.text())
    expect(labels).toEqual(['Remove from template', 'Go to Object', 'Properties'])
  })

  it('clicking "Go to Object" navigates to the infrastructure route', async () => {
    const wrapper = mountView()
    await openRowMenu(wrapper)
    await wrapper.findAll('.ctx-item')[1].trigger('click')
    expect(routerPush).toHaveBeenCalledWith({
      name: 'infrastructure',
      params: { objectId: 5, viewId: 'status' },
    })
  })

  it('"Remove from template" opens the removal dialog, defaulting to removing DCIs', async () => {
    unbindAsyncMock.mockResolvedValue({})
    const wrapper = mountView()
    await openRowMenu(wrapper)
    await wrapper.findAll('.ctx-item')[0].trigger('click')

    const dialog = wrapper.find('.dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('node-a')

    await dialog.find('button.p-button-danger').trigger('click')
    expect(unbindAsyncMock).toHaveBeenCalledWith({
      parentId: 100,
      childId: 5,
      removeDci: true,
    })
  })

  it('choosing "Unbind DCIs from template" sends removeDci:false', async () => {
    unbindAsyncMock.mockResolvedValue({})
    const wrapper = mountView()
    await openRowMenu(wrapper)
    await wrapper.findAll('.ctx-item')[0].trigger('click')

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    await radios[1].setValue(true)

    await wrapper.find('.dialog-stub button.p-button-danger').trigger('click')
    expect(unbindAsyncMock).toHaveBeenCalledWith({
      parentId: 100,
      childId: 5,
      removeDci: false,
    })
  })

  it('filters targets by zone, primary host name, and description, not just name', async () => {
    targetsData.value = [
      nodeTarget,
      {
        id: 6,
        name: 'other',
        class: 'Node',
        status: 0,
        zoneUIN: 2,
        primaryName: '',
        sysDescription: '',
      },
    ]
    const wrapper = mountView()
    await wrapper.find('.filter-input').setValue('linux box')
    await flushPromises()
    const rows = wrapper.findAll('.stub-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-row-id')).toBe('5')
  })

  it('retries a template-exclusion conflict with force after user confirms replace', async () => {
    bindAsyncMock
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValueOnce({})
    confirmRequire.mockImplementation((options) => options.accept())

    const wrapper = mountView()
    const picker = wrapper.findComponent(BindableObjectPickerDialogStub)
    await picker.vm.$emit('select', [{ id: 7, name: 'conflicted-node' }])
    await flushPromises()

    expect(bindAsyncMock).toHaveBeenNthCalledWith(1, { parentId: 100, childId: 7 })
    expect(bindAsyncMock).toHaveBeenNthCalledWith(2, {
      parentId: 100,
      childId: 7,
      force: true,
    })
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Template applied' }),
    )
  })

  it('skips the bind when the user declines to replace the conflicting template', async () => {
    bindAsyncMock.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
    confirmRequire.mockImplementation((options) => options.reject())

    const wrapper = mountView()
    const picker = wrapper.findComponent(BindableObjectPickerDialogStub)
    await picker.vm.$emit('select', [{ id: 7, name: 'conflicted-node' }])
    await flushPromises()

    expect(bindAsyncMock).toHaveBeenCalledTimes(1)
    expect(toastAdd).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }))
  })
})
