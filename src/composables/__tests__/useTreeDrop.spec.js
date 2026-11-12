import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTreeDrop } from '@/composables/useTreeDrop'

const hints = ref({})
const confirmRequire = vi.fn()

vi.mock('@/queries/useServerQueries', () => ({
  useClientConfigurationHints: () => ({ hint: (name) => hints.value[name] ?? null }),
}))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

const root = { id: 2, name: 'Infrastructure', class: 'ServiceRoot' }
const alpha = { id: 500, name: 'DataCenter-Alpha', class: 'Container' }
const office = { id: 112, name: 'Office', class: 'Container' }
const tablet = { id: 529, name: 'iPad', class: 'MobileDevice' }
const parents = { '500-529': alpha, 500: root, 112: root }

const drop = (copy = false) => ({
  rows: [{ object: tablet, path: '500-529' }],
  target: office,
  targetPath: '112',
  copy,
})

function setup(options = {}) {
  const onMove = vi.fn()
  const onCopy = vi.fn()
  const tree = useTreeDrop({
    movableClasses: new Set(['MobileDevice']),
    copyableClasses: new Set(['MobileDevice', 'Node']),
    canBind: (child, parent) => parent === 'Container' || parent === 'ServiceRoot',
    parentOf: (path) => parents[path] ?? null,
    onMove,
    onCopy,
    ...options,
  })
  return { tree, onMove, onCopy }
}

describe('useTreeDrop', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    hints.value = {}
    confirmRequire.mockReset()
  })

  it('moves at once when the server leaves it enabled', () => {
    const { tree, onMove } = setup()

    expect(tree.canDrag(tablet)).toBe(true)
    expect(tree.canDrop(drop())).toBe(true)
    tree.onDrop(drop())

    expect(onMove).toHaveBeenCalledWith({
      target: office,
      moves: [{ object: tablet, source: alpha }],
    })
    expect(confirmRequire).not.toHaveBeenCalled()
  })

  it('binds on a copy, with the dragged objects only', () => {
    const { tree, onCopy, onMove } = setup()

    tree.onDrop(drop(true))

    expect(onCopy).toHaveBeenCalledWith({ target: office, objects: [tablet] })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('has no copy without an onCopy, and drags only what it could move then', () => {
    const { tree } = setup({ onCopy: undefined })

    expect(tree.canDrop(drop(true))).toBe(false)
    expect(tree.canDrag({ id: 1, class: 'Node' })).toBe(false)
  })

  it('asks first under the server hint, and moves only on accept', () => {
    hints.value = { 'ObjectBrowser.DragAndDropMode': '1' }
    const { tree, onMove } = setup()

    tree.onDrop(drop())

    expect(onMove).not.toHaveBeenCalled()
    const [options] = confirmRequire.mock.calls[0]
    expect(options.message).toBe('Move "iPad" to "Office"?')
    options.accept()
    expect(onMove).toHaveBeenCalledOnce()
  })

  it('drags nothing once the user turns it off, whatever the server says', () => {
    const { tree, onMove } = setup()
    useSidebarStore().setDragAndDrop('disable')

    expect(tree.canDrag(tablet)).toBe(false)
    expect(tree.canDrop(drop())).toBe(false)
    tree.onDrop(drop())
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does nothing with a drop the rules refuse', () => {
    const { tree, onMove } = setup()

    tree.onDrop({ ...drop(), target: alpha, targetPath: '500' })

    expect(onMove).not.toHaveBeenCalled()
  })
})
