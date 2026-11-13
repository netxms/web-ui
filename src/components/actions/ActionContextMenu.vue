<script setup>
import { onUnmounted, ref } from 'vue'
import ContextMenu from './SubmenuDelayContextMenu'
import ActionMenuIcon from './ActionMenuIcon.vue'
import { menuAnchorEvent } from '@/utils/menuAnchor'
import { isPlainLeftClick } from '@/utils/navigation'
import { findByShortcut, shortcutForEvent } from '@/composables/useActionShortcuts'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
})

const menuRef = ref(null)

// The overlay is portalled to <body>, outside every scope `useActionShortcuts` watches, so the
// menu handles its own items' shortcuts while open.

function handleMenuKeydown(event) {
  const shortcut = shortcutForEvent(event)
  if (!shortcut) return
  // PrimeVue owns Enter once the user has arrowed onto an item; running our own item too
  // would fire two actions from one keypress. `aria-activedescendant` is how the menu
  // reports that an item is focused.
  if (shortcut === 'Enter' && document.activeElement?.getAttribute('aria-activedescendant')) {
    return
  }

  const action = findByShortcut(props.items, shortcut)
  if (!action || action.disabled) return

  event.preventDefault()
  event.stopPropagation()
  // Same order as a click: the item runs, then the menu closes.
  action.command?.({ originalEvent: event, item: action })
  menuRef.value?.hide()
}

// On window in the capture phase, so the key is claimed before PrimeVue's list handler. Bound on
// `before-show`: `show` fires only after the open transition, leaving the menu deaf until then.
function onShow() {
  window.addEventListener('keydown', handleMenuKeydown, true)
}

function onHide() {
  window.removeEventListener('keydown', handleMenuKeydown, true)
}

onUnmounted(onHide)

/**
 * Items with a `url` are real links. A plain click runs the command (PrimeVue's handler on the
 * <li>) and must not follow the href; a modified click opens a new tab and must not run it.
 */
function onItemClick(event, item) {
  if (!item.url) return
  if (isPlainLeftClick(event)) {
    event.preventDefault()
    return
  }
  event.stopPropagation()
  menuRef.value?.hide()
}

/** Middle click never reaches PrimeVue's click handler, so only the menu needs closing. */
function onItemAuxClick(event, item) {
  if (item.url && event.button === 1) menuRef.value?.hide()
}

defineExpose({
  // A keyboard-fired click carries no pointer position; anchor it to the control it came
  // from rather than letting PrimeVue drop the menu in the top-left corner.
  show: (event) => menuRef.value?.show(menuAnchorEvent(event)),
  hide: () => menuRef.value?.hide(),
})
</script>

<template>
  <ContextMenu ref="menuRef" :model="items" @before-show="onShow" @before-hide="onHide">
    <template #item="{ item, props: itemProps }">
      <a
        v-bind="itemProps.action"
        class="action-menu-item"
        :class="{ 'is-danger': item.danger }"
        :href="item.url"
        @click="onItemClick($event, item)"
        @auxclick="onItemAuxClick($event, item)"
      >
        <ActionMenuIcon v-if="item.icon || item.iconImage" :item="item" class="action-menu-icon" />
        <span class="action-menu-label">{{ item.label }}</span>
        <span v-if="item.shortcut" class="action-menu-shortcut">{{ item.shortcut }}</span>
        <span v-if="item.items" class="pi pi-angle-right action-menu-submenu-icon" />
      </a>
    </template>
  </ContextMenu>
</template>

<style scoped>
.action-menu-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  user-select: none;
}

.action-menu-icon {
  width: 0.875rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.action-menu-item.is-danger .action-menu-label,
.action-menu-item.is-danger .action-menu-icon {
  color: var(--p-red-500);
}

.action-menu-label {
  flex: 1;
  font-size: 0.8125rem;
}

.action-menu-shortcut {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-left: auto;
  padding-left: 1.5rem;
}

.action-menu-submenu-icon {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  margin-left: auto;
}
</style>
