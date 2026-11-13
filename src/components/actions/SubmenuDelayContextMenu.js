import ContextMenu from 'primevue/contextmenu'

// PrimeVue swaps the open submenu on the first mouseenter, so a pointer cutting diagonally
// towards a submenu opens whichever sibling it brushes. Here a sibling takes over only after the
// pointer rests on it; leaving it first (into the open submenu, or out of the menu) cancels.
export const SUBMENU_SWITCH_DELAY_MS = 200

const base = ContextMenu.methods

export default {
  // ContextMenuSub finds its host (classes, pass-through) by this name.
  name: 'ContextMenu',
  extends: ContextMenu,
  beforeUnmount() {
    clearTimeout(this.submenuSwitchTimer)
  },
  methods: {
    onItemMouseEnter(event) {
      clearTimeout(this.submenuSwitchTimer)
      const { processedItem } = event
      const siblingOpen = this.activeItemPath.some(
        (p) => p.parentKey === processedItem.parentKey && p.key !== processedItem.key,
      )
      if (!siblingOpen) {
        base.onItemMouseEnter.call(this, event)
        return
      }

      // currentTarget is only set while the event dispatches.
      const element = event.originalEvent.currentTarget
      const cancel = () => clearTimeout(timer)
      const timer = setTimeout(() => {
        element.removeEventListener('mouseleave', cancel)
        base.onItemMouseEnter.call(this, event)
      }, SUBMENU_SWITCH_DELAY_MS)
      element.addEventListener('mouseleave', cancel, { once: true })
      this.submenuSwitchTimer = timer
    },
    onItemClick(event) {
      clearTimeout(this.submenuSwitchTimer)
      base.onItemClick.call(this, event)
    },
    hide() {
      clearTimeout(this.submenuSwitchTimer)
      base.hide.call(this)
    },
  },
}
