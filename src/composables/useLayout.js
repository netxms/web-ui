import { ref } from 'vue'
import { prefs } from '@/utils/appStorage'

const isNavCollapsed = ref(prefs.get('navCollapsed', false) === true)
const isSidebarVisible = ref(false)
// User preference, independent of whether the current route offers a sidebar at all.
const isSidebarCollapsed = ref(prefs.get('sidebarCollapsed', false) === true)
const isAiChatOpen = ref(false)

/** For sign-out: `isAiChatOpen` is module state and would outlive the session. */
export function closeAiChat() {
  isAiChatOpen.value = false
}

export function useLayout() {
  function toggleNav() {
    isNavCollapsed.value = !isNavCollapsed.value
    prefs.set('navCollapsed', isNavCollapsed.value)
  }

  function toggleSidebar() {
    isSidebarVisible.value = !isSidebarVisible.value
  }

  function toggleSidebarCollapsed() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
    prefs.set('sidebarCollapsed', isSidebarCollapsed.value)
  }

  function setSidebarVisible(visible) {
    isSidebarVisible.value = visible
  }

  function toggleAiChat() {
    isAiChatOpen.value = !isAiChatOpen.value
  }

  return {
    isNavCollapsed,
    isSidebarVisible,
    isSidebarCollapsed,
    isAiChatOpen,
    toggleNav,
    toggleSidebar,
    toggleSidebarCollapsed,
    setSidebarVisible,
    toggleAiChat,
    closeAiChat,
  }
}
