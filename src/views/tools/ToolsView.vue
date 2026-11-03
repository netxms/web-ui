<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import ToolCatalog from '@/components/tools/ToolCatalog.vue'
import ToolSidebar from '@/components/tools/ToolSidebar.vue'
import { usePermissions } from '@/composables/usePermissions'
import { getAvailableTools } from './toolRegistry'

/**
 *   /tools          catalog of every tool the account may open, no sidebar
 *   /tools/:toolId  the tool; each tool owns its own state and URL query
 */
const route = useRoute()
const { can } = usePermissions()

const tools = computed(() => getAvailableTools(can.value))

const activeToolId = computed(() => route.params.toolId ?? null)

/** Null means a bad URL: the router guard already redirects tools the account cannot open. */
const activeTool = computed(() =>
  activeToolId.value ? (tools.value.find((tool) => tool.id === activeToolId.value) ?? null) : null,
)
</script>

<template>
  <Teleport v-if="activeToolId" defer to="#sidebar-content">
    <ToolSidebar :tools="tools" :active-tool="activeToolId" />
  </Teleport>

  <component
    :is="activeTool.component"
    v-if="activeTool?.component"
    :key="activeTool.id"
    class="tools-view-tool"
  />

  <UnderConstructionOverlay
    v-else-if="activeTool"
    :message="`${activeTool.label} is not available yet.`"
    class="tools-view-tool"
  >
    <EmptyState
      :icon="activeTool.icon"
      :title="activeTool.label"
      :message="activeTool.description"
    />
  </UnderConstructionOverlay>

  <EmptyState
    v-else-if="activeToolId"
    icon="pi pi-question-circle"
    title="No such tool"
    :message="`There is no tool called &quot;${activeToolId}&quot; in this perspective.`"
  />

  <ToolCatalog v-else :tools="tools" />
</template>

<style scoped>
.tools-view-tool {
  height: 100%;
}
</style>
