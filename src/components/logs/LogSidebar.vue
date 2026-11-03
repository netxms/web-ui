<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import { getLogCatalogEntry, groupLogsByFamily } from '@/config/logCatalog'
import { useNavTarget } from '@/composables/useNavTarget'
import { useWorkingState } from '@/composables/useWorkingState'
import { isPlainLeftClick, resolveHref } from '@/utils/navigation'
import { logTarget } from '@/utils/routeTargets'

const props = defineProps({
  logs: { type: Array, default: () => [] },
  activeLog: { type: String, default: null },
})

const emit = defineEmits(['select'])

const router = useRouter()
const { navBindings } = useNavTarget()
const filter = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filter } })

const catalogHref = resolveHref(logTarget())

function openCatalog(event) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  router.push(logTarget())
}

// `navBindings` handles only modified and middle clicks.
function openLog(name) {
  emit('select', name)
  if (name !== props.activeLog) router.push(logTarget(name))
}

const families = computed(() => {
  const search = filter.value.text.trim().toLowerCase()
  const logs = search
    ? props.logs.filter((log) => {
        const entry = getLogCatalogEntry(log.name)
        return entry.label.toLowerCase().includes(search) || log.name.toLowerCase().includes(search)
      })
    : props.logs
  return groupLogsByFamily(logs)
})
</script>

<template>
  <div class="sidebar-menu">
    <SidebarHeader title="Logs">
      <template #actions>
        <Button
          as="a"
          :href="catalogHref"
          icon="pi pi-th-large"
          text
          severity="secondary"
          size="small"
          aria-label="All logs"
          v-tooltip.bottom="'All logs'"
          @click="openCatalog"
        />
      </template>
    </SidebarHeader>
    <SidebarFilter v-model="filter" placeholder="Filter logs..." />

    <nav class="sidebar-menu-list">
      <div v-for="family in families" :key="family.id" class="menu-group">
        <div class="menu-group-label">{{ family.label }}</div>
        <div
          v-for="log in family.logs"
          :key="log.name"
          class="menu-item"
          :class="{ active: activeLog === log.name }"
          v-bind="navBindings(logTarget(log.name), () => openLog(log.name))"
        >
          <i :class="getLogCatalogEntry(log.name).icon" class="menu-item-icon" />
          <span class="menu-item-label">{{ getLogCatalogEntry(log.name).label }}</span>
        </div>
      </div>
      <p v-if="families.length === 0" class="menu-empty">No logs match.</p>
    </nav>
  </div>
</template>

<style src="@/assets/styles/sidebar-menu.css" />
