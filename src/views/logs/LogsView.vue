<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LogCatalog from '@/components/logs/LogCatalog.vue'
import LogExplorer from '@/components/logs/LogExplorer.vue'
import LogSidebar from '@/components/logs/LogSidebar.vue'
import { useLogs } from '@/queries/useLogQueries'
import { useLogPrefsStore } from '@/stores/logPrefsStore'
import { logTarget } from '@/utils/routeTargets'

/**
 *   /logs            catalog of every readable log, no sidebar
 *   /logs/:logName   the explorer
 *
 * Query state lives in the route query so a filtered log is a shareable link.
 */
const route = useRoute()
const router = useRouter()
const prefs = useLogPrefsStore()

const { data: logs, isLoading, error, refetch } = useLogs()

const activeLogName = computed(() => route.params.logName ?? null)

const activeLog = computed(
  () => (logs.value ?? []).find((log) => log.name === activeLogName.value) ?? null,
)

/**
 * The path segment is case insensitive and accepts table names; redirect to the canonical
 * spelling so links, history and the sidebar highlight agree.
 */
watch([logs, activeLogName], ([list, name]) => {
  if (!name || !list) return
  const canonical = list.find((log) => log.name.toLowerCase() === name.toLowerCase())
  if (canonical && canonical.name !== name) {
    router.replace({ ...logTarget(canonical.name), query: route.query })
  }
})

watch(
  activeLogName,
  (name) => {
    if (name) prefs.setLastLog(name)
  },
  { immediate: true },
)
</script>

<template>
  <Teleport v-if="activeLogName" defer to="#sidebar-content">
    <LogSidebar :logs="logs ?? []" :active-log="activeLogName" />
  </Teleport>

  <LogExplorer
    v-if="activeLogName"
    :key="activeLogName"
    :log-name="activeLogName"
    :log="activeLog"
    :switchable-logs="logs ?? []"
    class="logs-view-explorer"
  />

  <LogCatalog v-else :logs="logs ?? []" :loading="isLoading" :error="error" @retry="refetch()" />
</template>

<style scoped>
.logs-view-explorer {
  height: 100%;
}
</style>
