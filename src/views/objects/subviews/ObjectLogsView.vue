<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import LogExplorer from '@/components/logs/LogExplorer.vue'
import { getObjectApplicableLogs } from '@/config/logCatalog'
import { useLogs } from '@/queries/useLogQueries'
import { useLogPrefsStore } from '@/stores/logPrefsStore'
import { createObjectFilter } from '@/utils/logQueryModel'

/**
 * The log explorer with the object's related-object column pinned as a locked filter, so the
 * legacy object-context log views come to one switcher.
 */
const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const prefs = useLogPrefsStore()
const { data: logs } = useLogs()

const available = computed(() => getObjectApplicableLogs(logs.value ?? [], props.object))

const selected = ref(null)

/**
 * `?log=<name>` (from the context menu) wins over the remembered choice, but only once:
 * switching away from it must stick.
 */
let requestedLog = route.query.log ?? null

/** Prefer the log the user last looked at, when this object supports it. */
watch(
  [available, () => props.object.id],
  ([list]) => {
    if (list.length === 0) {
      selected.value = null
      return
    }
    const requested = list.find((log) => log.name === requestedLog)
    if (requested) {
      requestedLog = null
      selected.value = requested.name
      return
    }
    if (selected.value && list.some((log) => log.name === selected.value)) return
    const remembered = list.find((log) => log.name === prefs.lastLog)
    selected.value = (remembered ?? list[0]).name
  },
  { immediate: true },
)

// A second "Logs > Syslog" while on the tab only changes the query string.
watch(
  () => route.query.log,
  (name) => {
    if (!name || !available.value.some((log) => log.name === name)) return
    requestedLog = null
    selected.value = name
  },
)

const selectedLog = computed(
  () => available.value.find((log) => log.name === selected.value) ?? null,
)

/** `equals`, not `childOf`: the legacy object log viewer shows this object's records only. */
const lockedFilters = computed(() =>
  selectedLog.value?.objectIdColumn
    ? [
        createObjectFilter(
          selectedLog.value.objectIdColumn,
          props.object.id,
          props.object.name,
          true,
        ),
      ]
    : [],
)

/**
 * Only an explicit switch is remembered, or one object whose class supports a single log would
 * change what every later object defaults to.
 */
function selectLog(name) {
  selected.value = name
  prefs.setLastLog(name)
}

const refreshSignal = inject('viewRefreshSignal', null)
const refreshKey = ref(0)
if (refreshSignal) watch(refreshSignal, () => refreshKey.value++)
</script>

<template>
  <div class="object-logs-view">
    <EmptyState
      v-if="available.length === 0"
      icon="pi pi-list"
      title="No logs available for this object"
      message="No log this account can read records data against objects of this class."
    />

    <LogExplorer
      v-else-if="selected"
      :key="`${object.id}-${selected}-${refreshKey}`"
      :log-name="selected"
      :log="selectedLog"
      :switchable-logs="available"
      :locked-filters="lockedFilters"
      compact
      @switch-log="selectLog"
    />
  </div>
</template>

<style scoped>
.object-logs-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
