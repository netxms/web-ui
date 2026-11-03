<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import { useNavTarget } from '@/composables/useNavTarget'
import { useWorkingState } from '@/composables/useWorkingState'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'
import { toolTarget } from '@/utils/routeTargets'
import { groupToolsByFamily } from '@/views/tools/toolRegistry'

/** Keep structurally identical to the Logs sidebar (shared `sidebar-menu.css`). */
const props = defineProps({
  tools: { type: Array, default: () => [] },
  activeTool: { type: String, default: null },
})

const router = useRouter()
const { navBindings } = useNavTarget()
const filter = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filter } })

const catalogHref = resolveHref(toolTarget())

function openCatalog(event) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  router.push(toolTarget())
}

function openTool(id) {
  if (id !== props.activeTool) router.push(toolTarget(id))
}

const families = computed(() => {
  const search = filter.value.text.trim().toLowerCase()
  const tools = search
    ? props.tools.filter(
        (tool) =>
          tool.label.toLowerCase().includes(search) ||
          tool.description.toLowerCase().includes(search),
      )
    : props.tools
  return groupToolsByFamily(tools)
})
</script>

<template>
  <div class="sidebar-menu">
    <SidebarHeader title="Tools">
      <template #actions>
        <Button
          v-tooltip.bottom="'All tools'"
          as="a"
          :href="catalogHref"
          icon="pi pi-th-large"
          text
          severity="secondary"
          size="small"
          aria-label="All tools"
          @click="openCatalog"
        />
      </template>
    </SidebarHeader>
    <SidebarFilter v-model="filter" placeholder="Filter tools..." />

    <nav class="sidebar-menu-list">
      <div v-for="family in families" :key="family.id" class="menu-group">
        <div class="menu-group-label">{{ family.label }}</div>
        <div
          v-for="tool in family.tools"
          :key="tool.id"
          class="menu-item"
          :class="{ active: activeTool === tool.id, planned: !tool.component }"
          v-bind="navBindings(toolTarget(tool.id), () => openTool(tool.id))"
        >
          <i :class="tool.icon" class="menu-item-icon" />
          <span class="menu-item-label">{{ tool.label }}</span>
        </div>
      </div>
      <p v-if="families.length === 0" class="menu-empty">No tools match.</p>
    </nav>
  </div>
</template>

<style src="@/assets/styles/sidebar-menu.css" />
