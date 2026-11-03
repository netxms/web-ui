<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useLayout } from '@/composables/useLayout'

const sidebarContent = ref(null)
const hasTeleportedContent = ref(false)
let observer = null

function checkContent() {
  if (!sidebarContent.value) return
  hasTeleportedContent.value = sidebarContent.value.children.length > 1
}

onMounted(() => {
  observer = new MutationObserver(checkContent)
  observer.observe(sidebarContent.value, { childList: true })
  checkContent()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  stopResize()
})

const sidebarStore = useSidebarStore()
const sidebarStyle = computed(() => ({ width: `${sidebarStore.sidebarWidth}px` }))

const { toggleSidebarCollapsed } = useLayout()

let startX = 0
let startWidth = 0

function onPointerMove(event) {
  sidebarStore.setSidebarWidth(startWidth + (event.clientX - startX))
}

function stopResize() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopResize)
  document.body.classList.remove('sidebar-resizing')
}

function startResize(event) {
  startX = event.clientX
  startWidth = sidebarStore.sidebarWidth
  document.body.classList.add('sidebar-resizing')
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopResize)
}
</script>

<template>
  <aside class="app-sidebar" :style="sidebarStyle" aria-label="Sidebar">
    <div id="sidebar-content" ref="sidebarContent" class="app-sidebar-content">
      <p v-show="!hasTeleportedContent" class="app-sidebar-placeholder">
        Sidebar content will appear here based on the active view.
      </p>
    </div>
    <button
      class="app-sidebar-collapse"
      type="button"
      aria-label="Collapse sidebar"
      v-tooltip.right="'Collapse sidebar'"
      @click="toggleSidebarCollapsed"
    >
      <i class="pi pi-chevron-left" />
    </button>
    <div
      class="app-sidebar-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      @pointerdown.prevent="startResize"
    />
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: relative;
  width: 280px;
  border-right: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.15s;
}

.app-sidebar-resize-handle:hover {
  background: var(--p-primary-color);
}

/* Keep a consistent resize cursor and suppress selection while dragging */
:global(body.sidebar-resizing) {
  cursor: col-resize;
  user-select: none;
}

.app-sidebar-collapse {
  position: absolute;
  right: 0;
  bottom: 0.75rem;
  z-index: 11;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--p-surface-border);
  border-right: none;
  border-radius: 4px 0 0 4px;
  background: var(--p-surface-card);
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s,
    color 0.15s;
}

.app-sidebar:hover .app-sidebar-collapse,
.app-sidebar-collapse:focus-visible {
  opacity: 1;
}

.app-sidebar-collapse:hover {
  color: var(--p-primary-color);
}

.app-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.app-sidebar-placeholder {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
