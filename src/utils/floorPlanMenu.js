/**
 * The floor plan's right-click menu, in the network map's pattern: a header and a few items for
 * what was clicked, Add and Place for the floor. Item keys are the editor's (`r:`, `e:`, `v:`).
 */
import { ELEMENT_TYPES } from './floorPlanEdits'

const header = (label) => ({ label, class: 'context-menu-header', disabled: true })

/** What the remove command does to `items`, as the edit bar and the side panel name it. */
export function removeLabelFor(items) {
  const kinds = new Set(items.map((item) => item.kind))
  if (kinds.size === 1 && kinds.has('rack')) return 'Remove from plan'
  if (kinds.size === 1 && kinds.has('vertex')) return 'Delete corner'
  return items.length === 1 ? 'Delete' : 'Remove'
}

function floorItems(point, ctx) {
  const { run } = ctx
  const items = []
  if (ctx.canEdit) {
    items.push({
      label: 'Add',
      icon: 'pi pi-plus',
      items: ELEMENT_TYPES.map((t) => ({
        label: t.label,
        command: () => run.addElement(t.type, point),
      })),
    })
    if (ctx.unplaced.length) {
      items.push({
        label: 'Place rack here',
        icon: 'pi pi-arrows-alt',
        items: ctx.unplaced.map((rack) => ({
          label: rack.name,
          command: () => run.placeRack(rack.id, point),
        })),
      })
    }
    items.push({ separator: true })
  }
  items.push({ label: 'Fit to view', icon: 'pi pi-expand', command: () => run.fit() })
  if (ctx.roomPropertiesHref) {
    items.push({
      label: 'Room properties...',
      icon: 'pi pi-cog',
      url: ctx.roomPropertiesHref,
      command: () => run.openRoomProperties(),
    })
  }
  return items
}

function selectionItems(target, ctx) {
  const { run } = ctx
  const selected = ctx.selectedItems
  const title = selected.length > 1 ? `${selected.length} selected` : ctx.nameOf(target.key)
  const items = [header(title)]
  const rackId = target.kind === 'rack' ? Number(target.key.slice(2)) : null
  const href = selected.length <= 1 && rackId != null ? ctx.rackHref(rackId) : null
  if (href) {
    items.push({
      label: 'Open rack',
      icon: 'pi pi-external-link',
      url: href,
      command: () => run.openRack(rackId),
    })
  }
  if (!ctx.editMode) return items

  items.push({ separator: true })
  if (selected.some((item) => item.kind !== 'vertex')) {
    items.push(
      { label: 'Rotate left', icon: 'pi pi-replay', command: () => run.rotate(-90) },
      { label: 'Rotate right', icon: 'pi pi-refresh', command: () => run.rotate(90) },
    )
  }
  if (selected.filter((item) => item.kind === 'rack').length > 1) {
    items.push({
      label: 'Line up as a row',
      icon: 'pi pi-align-justify',
      command: () => run.lineUp(),
    })
  }
  const lastCorner = selected.length === 1 && target.kind === 'vertex' && !ctx.canRemoveVertex
  items.push({
    label: removeLabelFor(selected),
    icon: 'pi pi-trash',
    disabled: lastCorner,
    command: () => run.remove(),
  })
  return items
}

/**
 * @param {{ kind: 'floor'|'rack'|'element'|'vertex'|'wall', key?: string|null,
 *   edge?: number|null, point: {x: number, y: number} }} target
 * @param {object} ctx
 * @param {boolean} ctx.editMode
 * @param {boolean} ctx.canEdit - the floor's Add and Place switch to edit mode on their own
 * @param {object[]} ctx.selectedItems - `editor.selectedItems`, the clicked item among them
 * @param {object[]} ctx.unplaced - the room's racks without a position
 * @param {boolean} ctx.canRemoveVertex
 * @param {(key: string) => string} ctx.nameOf
 * @param {(rackId: number) => string|null} ctx.rackHref
 * @param {string|null} ctx.roomPropertiesHref
 * @param {Record<string, Function>} ctx.run - addElement, placeRack, rotate, remove, lineUp,
 *   insertVertex, openRack, fit, openRoomProperties
 */
export function floorPlanMenuItems(target, ctx) {
  if (target.kind === 'wall') {
    return [
      header('Wall'),
      { separator: true },
      {
        label: 'Add corner here',
        icon: 'pi pi-plus',
        command: () => ctx.run.insertVertex(target.edge, target.point),
      },
    ]
  }
  if (target.kind === 'floor') return floorItems(target.point, ctx)
  const selected = ctx.editMode ? ctx.selectedItems : []
  return selectionItems(target, { ...ctx, selectedItems: selected.length ? selected : [target] })
}
