<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import { usePollExecutionStore } from '@/stores/pollExecutionStore'
import PollOutput from '@/components/objects/PollOutput.vue'
import { pollTypesForObject } from '@/utils/pollTypes'
import { formatTimeShort } from '@/utils/timeFormat'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const route = useRoute()
const router = useRouter()
const pollStore = usePollExecutionStore()

const availablePolls = computed(() => pollTypesForObject(props.object))

// Driven by the route entityId param, falling back to the first available.
const activeTab = computed(() => {
  const fromRoute = route.params.entityId
  if (fromRoute && availablePolls.value.some((p) => p.id === fromRoute)) return fromRoute
  return availablePolls.value[0]?.id || null
})

function execution(pollId) {
  return pollStore.getExecution(props.object.id, pollId)
}

function isRunning(pollId) {
  return execution(pollId)?.status === 'running'
}

function statusIcon(pollId) {
  const status = execution(pollId)?.status
  if (status === 'running') return 'pi pi-spin pi-spinner'
  if (status === 'completed') return 'pi pi-check-circle'
  if (status === 'error') return 'pi pi-times-circle'
  return null
}

function statusClass(pollId) {
  const status = execution(pollId)?.status
  if (status === 'running') return 'status-running'
  if (status === 'completed') return 'status-ok'
  if (status === 'error') return 'status-err'
  return null
}

function lastRunLabel(pollId) {
  const exec = execution(pollId)
  if (!exec?.startedAt) return null
  const time = formatTimeShort(exec.completedAt || exec.startedAt)
  if (exec.status === 'running') return `Started ${formatTimeShort(exec.startedAt)}`
  if (exec.status === 'completed') return `Completed ${time}`
  if (exec.status === 'error') return `Failed ${time}`
  return null
}

// More than one perspective hosts this view, so the route keeps its own name.
function pollRoute(pollId) {
  return { name: route.name, params: { ...route.params, entityId: pollId } }
}

function handleTabChange(pollId) {
  router.push(pollRoute(pollId))
}

function handleRun(pollId) {
  if (!availablePolls.value.some((p) => p.id === pollId)) return
  pollStore.start(props.object.id, pollId)
}

// autorun=1 comes from the context menu.
watch(
  () => [route.params.entityId, route.query.autorun],
  ([pollType, autorun]) => {
    if (autorun !== '1' || !pollType) return
    // Cleared first so a refresh doesn't re-trigger.
    router.replace(pollRoute(pollType))
    handleRun(pollType)
  },
  { immediate: true },
)
</script>

<template>
  <div class="polls-view">
    <Tabs
      v-if="availablePolls.length"
      :value="activeTab"
      scrollable
      class="polls-tabs"
      @update:value="handleTabChange"
    >
      <TabList>
        <Tab v-for="poll in availablePolls" :key="poll.id" :value="poll.id" class="poll-tab">
          <i :class="poll.icon" class="poll-tab-icon" />
          <span>{{ poll.label }}</span>
          <i
            v-if="statusIcon(poll.id)"
            :class="[statusIcon(poll.id), statusClass(poll.id), 'poll-tab-status']"
          />
        </Tab>
      </TabList>

      <TabPanels class="polls-tab-panels">
        <TabPanel
          v-for="poll in availablePolls"
          :key="poll.id"
          :value="poll.id"
          class="poll-panel"
        >
          <div class="poll-toolbar">
            <div class="poll-toolbar-left">
              <Button
                label="Run Poll"
                icon="pi pi-play"
                size="small"
                :disabled="isRunning(poll.id)"
                :loading="isRunning(poll.id)"
                @click="handleRun(poll.id)"
              />
              <Button
                v-tooltip.bottom="'Clear output'"
                icon="pi pi-eraser"
                label="Clear Output"
                size="small"
                severity="secondary"
                :disabled="!execution(poll.id)?.lines.length"
                @click="pollStore.clearOutput(object.id, poll.id)"
              />
              <span v-if="lastRunLabel(poll.id)" class="poll-last-run">
                {{ lastRunLabel(poll.id) }}
              </span>
            </div>
          </div>

          <PollOutput :execution="execution(poll.id)" empty-hint='Click "Run Poll" to start.' />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <div v-else class="polls-unsupported">
      <i class="pi pi-info-circle" />
      <span>No polls available for this object type.</span>
    </div>
  </div>
</template>

<style scoped>
.polls-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.polls-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.polls-tab-panels {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.polls-tab-panels :deep(.p-tabpanel) {
  height: 100%;
  padding: 0;
}

.poll-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.poll-tab-icon {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.poll-tab-status {
  font-size: 0.75rem;
  margin-left: 0.125rem;
}

.poll-tab-status.status-running {
  color: var(--p-primary-color);
}

.poll-tab-status.status-ok {
  color: var(--p-green-500);
}

.poll-tab-status.status-err {
  color: var(--p-red-500);
}

.poll-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.poll-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
  gap: 0.75rem;
}

.poll-toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.poll-last-run {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.polls-unsupported {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}
</style>
