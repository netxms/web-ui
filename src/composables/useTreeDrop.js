import { computed } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useClientConfigurationHints } from '@/queries/useServerQueries'
import { dropConfirmation, effectiveDragAndDropMode, planTreeDrop } from '@/utils/treeDragDrop'

/**
 * Drag and drop between the rows of an ObjectSidebarTree, as the legacy object browser has it:
 * a drop moves the dragged rows out of the parent they hang under, Ctrl+drop (where `onCopy` is
 * given) binds them and keeps that parent. The server hint `ObjectBrowser.DragAndDropMode`, or
 * the user's own choice, can turn it off or have it ask first.
 *
 * @param {object} options
 * @param {Set<string>} options.movableClasses
 * @param {Set<string>} [options.copyableClasses]
 * @param {(childClass: string, parentClass: string) => boolean} options.canBind
 * @param {(path: string) => object|null} options.parentOf - the object a row hangs under
 * @param {(drop: {target: object, moves: Array<{object: object, source: object}>}) => void} options.onMove
 * @param {(drop: {target: object, objects: object[]}) => void} [options.onCopy]
 * @returns {{ mode: import('vue').ComputedRef<string>, canDrag: Function, canDrop: Function, onDrop: Function }}
 *   the last three are ObjectSidebarTree's `can-drag`, `can-drop` and `@drop`
 */
export function useTreeDrop({
  movableClasses,
  copyableClasses,
  canBind,
  parentOf,
  onMove,
  onCopy,
}) {
  const sidebarStore = useSidebarStore()
  const { hint } = useClientConfigurationHints()
  const confirm = useConfirm()

  const mode = computed(() =>
    effectiveDragAndDropMode(sidebarStore.dragAndDrop, hint('ObjectBrowser.DragAndDropMode')),
  )
  const copyable = onCopy ? copyableClasses : null

  function canDrag(node) {
    if (mode.value === 'disable') return false
    return movableClasses.has(node.class) || Boolean(copyable?.has(node.class))
  }

  function plan({ rows, target, targetPath, copy }) {
    const allowed = copy ? copyable : movableClasses
    if (mode.value === 'disable' || !allowed) return null
    if (!rows.every((row) => allowed.has(row.object.class))) return null
    return planTreeDrop({ rows, target, targetPath, copy, canBind, parentOf })
  }

  function onDrop(drop) {
    const moves = plan(drop)
    if (!moves) return
    const { target, copy } = drop
    const objects = moves.map((move) => move.object)
    const run = () => (copy ? onCopy({ target, objects }) : onMove({ target, moves }))
    if (mode.value !== 'confirm') {
      run()
      return
    }
    confirm.require({
      ...dropConfirmation({ objects, target, copy }),
      icon: 'pi pi-question-circle',
      rejectLabel: 'Cancel',
      accept: run,
    })
  }

  return { mode, canDrag, canDrop: (drop) => plan(drop) !== null, onDrop }
}
