import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { House, Bell, Siren, Settings, List, Wrench, Sparkles } from 'lucide-vue-next'
import * as objectsApi from '@/api/objectsApi'
import { getNavItem } from '@/utils/objectUtils'
import { useAuthStore } from '@/stores/authStore'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { visibleGroups } from '@/views/configuration/configSections'
import { getAvailableTools } from '@/views/tools/toolRegistry'

/**
 * Navigation layout, grouped after the legacy client's perspective sections.
 *
 * An item is a static entry (`{ label, icon, route }`) or a slot (`{ objectClass }`) filled from
 * the server's object roots; slots without a root are dropped, and so are sections left empty.
 *
 * `isVisible(can)` hides a static item the account cannot use any of. `requiredComponent` hides
 * it on a server without that subsystem; such an item stays out of `hiddenItems` too, since no
 * grant would bring it back.
 */
const NAV_SECTIONS = [
  {
    id: 'general',
    items: [{ label: 'Home', icon: House, route: '/home' }],
  },
  {
    id: 'objects',
    label: 'Objects',
    items: [
      { objectClass: 'ServiceRoot' },
      { objectClass: 'AssetRoot' },
      { objectClass: 'TemplateRoot' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    items: [
      { label: 'Alarms', icon: Bell, route: '/alarms' },
      { label: 'Incidents', icon: Siren, route: '/incidents' },
      { objectClass: 'DashboardRoot' },
      { objectClass: 'NetworkMapRoot' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    items: [{ objectClass: 'BusinessServiceRoot' }],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    items: [
      {
        label: 'AI',
        icon: Sparkles,
        route: '/ai',
        requiredComponent: SERVER_COMPONENTS.AI_ASSISTANT,
        isVisible: (can) => can.useAiAssistant || can.viewEventLog,
      },
      // No predicate: GET /v1/logs is already access-filtered server-side.
      { label: 'Logs', icon: List, route: '/logs' },
      {
        label: 'Tools',
        icon: Wrench,
        route: '/tools',
        isVisible: (can) => getAvailableTools(can).length > 0,
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    placement: 'bottom',
    items: [
      {
        label: 'Configuration',
        icon: Settings,
        route: '/configuration',
        isVisible: (can) => visibleGroups(can).length > 0,
      },
    ],
  },
]

export const useNavigationStore = defineStore('navigation', () => {
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref(null)
  const authStore = useAuthStore()
  const { can } = usePermissions()
  const { has: hasServerComponent } = useServerComponents()

  /** @param {{ requiredComponent?: string }} item */
  function isOnServer(item) {
    return !item.requiredComponent || hasServerComponent(item.requiredComponent)
  }

  const objectItems = ref({})

  const navSections = computed(() =>
    NAV_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      placement: section.placement ?? 'top',
      items: section.items
        .map((item) => (item.objectClass ? objectItems.value[item.objectClass] : item))
        .filter(Boolean)
        .filter(isOnServer)
        .filter((item) => !item.isVisible || item.isVisible(can.value)),
    })).filter((section) => section.items.length > 0),
  )

  /**
   * Static perspectives withheld from this account. Object roots are excluded: a missing root
   * may equally mean the server has no such tree.
   */
  const hiddenItems = computed(() =>
    NAV_SECTIONS.flatMap((section) =>
      section.items.filter(
        (item) => isOnServer(item) && item.isVisible && !item.isVisible(can.value),
      ),
    ),
  )

  const navItems = computed(() => navSections.value.flatMap((section) => section.items))

  async function loadNavigation() {
    // A sign-in starts this before the rail mounts, and the rail asks again on mount.
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const objects = await objectsApi.getObjects()
      const items = {}
      for (const object of objects) {
        const item = getNavItem(object)
        if (item) items[object.class] = item
      }
      objectItems.value = items
      loaded.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  // Roots are ACL-filtered per account, but the Pinia instance outlives a sign-out.
  watch(
    () => authStore.sessionGuid,
    (guid) => {
      objectItems.value = {}
      loaded.value = false
      error.value = null
      if (guid) loadNavigation()
    },
  )

  return { navSections, navItems, hiddenItems, loaded, error, loadNavigation }
})
