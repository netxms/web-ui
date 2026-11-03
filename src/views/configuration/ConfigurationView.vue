<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import RestrictedDisclosure from '@/components/common/RestrictedDisclosure.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { labelForComponent } from '@/config/serverComponents'
import { useEppChains } from '@/queries/useEppQueries'
import { configTarget } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'
import { useWorkingState } from '@/composables/useWorkingState'
import {
  DEFAULT_SECTION,
  visibleGroups,
  hiddenSections,
  isSectionPermitted,
  isSectionAvailable,
  requiredRightForSection,
  requiredComponentForSection,
  getSectionLabel,
} from './configSections'

const route = useRoute()
const router = useRouter()
const { can } = usePermissions()
const { components } = useServerComponents()

const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })

const activeSection = computed(() => route.params.sectionId || DEFAULT_SECTION)

// Event Processing is also readable through a per-chain access list, which only the server can
// resolve; only accounts lacking the right ask.
const { data: eppChainsData, isFetching: isFetchingEppChains } = useEppChains({
  enabled: computed(() => !can.value.manageEpp),
})

const runtimeGates = computed(() => {
  if (can.value.manageEpp) return { eppChainAccess: true }
  // `null` while outstanding: the section stays listed until the server refuses it.
  if (eppChainsData.value === undefined)
    return { eppChainAccess: isFetchingEppChains.value ? null : false }
  return { eppChainAccess: eppChainsData.value.length > 0 }
})

const hidden = computed(() => hiddenSections(can.value, runtimeGates.value, components.value))

// A missing component means absent, not forbidden. The synchronous router guard cannot see
// `components`, so the view answers for it.
const missingComponent = computed(() => {
  const required = requiredComponentForSection(activeSection.value)
  return isSectionAvailable({ requiredComponent: required }, components.value) ? null : required
})

// Runtime gates are left out: such a section renders its own restricted state from the server.
const activeSectionPermitted = computed(() =>
  isSectionPermitted({ requiredRight: requiredRightForSection(activeSection.value) }, can.value),
)

/** First right of the active section's requirement, for the locked state's copy. */
const activeSectionRight = computed(() => {
  const required = requiredRightForSection(activeSection.value)
  return (Array.isArray(required) ? required[0] : required) ?? ''
})

// Permission filtering first, so the text filter can never surface a forbidden section.
const filteredMenuGroups = computed(() => {
  const permitted = visibleGroups(can.value, runtimeGates.value, components.value)
  if (!filterState.value.text) return permitted
  const search = filterState.value.text.toLowerCase()
  return permitted
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(search)),
    }))
    .filter((group) => group.items.length > 0)
})

const { navBindings } = useNavTarget()

function navigateToSection(sectionId) {
  router.push(configTarget(sectionId))
}

const sectionComponents = {
  'object-tools': defineAsyncComponent(() => import('./sections/ObjectToolsSection.vue')),
  'server-config': defineAsyncComponent(() => import('./sections/ServerConfigSection.vue')),
  'users-groups': defineAsyncComponent(() => import('./sections/UsersGroupsSection.vue')),
  'two-factor-auth': defineAsyncComponent(() => import('./sections/TwoFactorAuthSection.vue')),
  'dci-summary-tables': defineAsyncComponent(
    () => import('./sections/DciSummaryTablesSection.vue'),
  ),
  epp: defineAsyncComponent(() => import('./sections/EppSection.vue')),
  actions: defineAsyncComponent(() => import('./sections/ActionsSection.vue')),
  'event-templates': defineAsyncComponent(() => import('./sections/EventTemplatesSection.vue')),
  'notification-channels': defineAsyncComponent(
    () => import('./sections/NotificationChannelsSection.vue'),
  ),
  'chat-bots': defineAsyncComponent(() => import('./sections/ChatBotsSection.vue')),
  'event-forwarders': defineAsyncComponent(() => import('./sections/EventForwardersSection.vue')),
  'image-library': defineAsyncComponent(() => import('./sections/ImageLibrarySection.vue')),
  'geographical-areas': defineAsyncComponent(
    () => import('./sections/GeographicalAreasSection.vue'),
  ),
  'script-library': defineAsyncComponent(() => import('./sections/ScriptLibrarySection.vue')),
  'persistent-storage': defineAsyncComponent(
    () => import('./sections/PersistentStorageSection.vue'),
  ),
  'mapping-tables': defineAsyncComponent(() => import('./sections/MappingTablesSection.vue')),
  'snmp-trap-mappings': defineAsyncComponent(
    () => import('./sections/SnmpTrapMappingsSection.vue'),
  ),
  'agent-tunnels': defineAsyncComponent(() => import('./sections/AgentTunnelsSection.vue')),
  'log-parsers': defineAsyncComponent(() => import('./sections/LogParsersSection.vue')),
  'scheduled-tasks': defineAsyncComponent(() => import('./sections/ScheduledTasksSection.vue')),
  'ssh-keys': defineAsyncComponent(() => import('./sections/SshKeysSection.vue')),
  'web-service-definitions': defineAsyncComponent(
    () => import('./sections/WebServiceDefinitionsSection.vue'),
  ),
  'object-categories': defineAsyncComponent(() => import('./sections/ObjectCategoriesSection.vue')),
  'alarm-categories': defineAsyncComponent(() => import('./sections/AlarmCategoriesSection.vue')),
  'ai-assistant': defineAsyncComponent(() => import('./sections/AiAssistantSection.vue')),
  'asset-management-schema': defineAsyncComponent(
    () => import('./sections/AssetManagementSchemaSection.vue'),
  ),
}

const fallbackComponent = defineAsyncComponent(() => import('./sections/ComingSoonSection.vue'))

const activeSectionComponent = computed(
  () => sectionComponents[activeSection.value] || fallbackComponent,
)
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="config-sidebar">
      <SidebarHeader title="Configuration" />
      <SidebarFilter v-model="filterState" placeholder="Filter sections..." />

      <nav class="config-menu">
        <div v-for="group in filteredMenuGroups" :key="group.label" class="menu-group">
          <div class="menu-group-label">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="menu-item"
            :class="{ active: activeSection === item.id }"
            :data-tour="`config-section-${item.id}`"
            role="link"
            :aria-current="activeSection === item.id ? 'page' : undefined"
            v-bind="navBindings(configTarget(item.id), () => navigateToSection(item.id))"
          >
            <i :class="item.icon" class="menu-item-icon" />
            <span class="menu-item-label">{{ item.label }}</span>
          </div>
        </div>
      </nav>

      <RestrictedDisclosure :items="hidden" noun="section" />
    </div>
  </Teleport>

  <div class="configuration-view">
    <!-- Availability first: no grant of rights fixes a missing component. -->
    <EmptyState
      v-if="missingComponent"
      icon="pi pi-server"
      :title="`${getSectionLabel(activeSection)} is not available on this server`"
      :message="`This server is not running the ${labelForComponent(missingComponent)} component.`"
    />
    <!-- The in-place case: a redirect landing here, or rights revoked while open. -->
    <RestrictedState
      v-else-if="!activeSectionPermitted"
      :right="activeSectionRight"
      :title="`${getSectionLabel(activeSection)} unavailable`"
    />
    <component :is="activeSectionComponent" v-else />
  </div>
</template>

<style scoped>
.configuration-view {
  display: flex;
  flex-direction: column;
  height: calc(100% + 1rem);
  margin: -1rem;
}

.config-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.config-menu {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.menu-group {
  margin-bottom: 0.5rem;
}

.menu-group-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0.75rem 0.25rem;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--p-text-color);
  transition: background-color 0.15s;
}

.menu-item:hover {
  background: var(--p-surface-hover);
}

.menu-item.active {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
  font-weight: 500;
}

.menu-item-icon {
  font-size: 0.875rem;
  width: 1.25rem;
  text-align: center;
  flex-shrink: 0;
}

.menu-item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
