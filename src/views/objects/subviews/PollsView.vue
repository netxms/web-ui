<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import { usePollExecutionStore } from '@/stores/pollExecutionStore'
import { usePollExecution } from '@/composables/usePollExecution'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { formatTimeShort } from '@/utils/timeFormat'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const POLL_TYPES = {
  Node: [
    { id: 'status', label: 'Status', icon: 'pi pi-info-circle' },
    { id: 'configuration', label: 'Configuration', icon: 'pi pi-cog' },
    { id: 'topology', label: 'Topology', icon: 'pi pi-share-alt' },
    { id: 'instanceDiscovery', label: 'Instance Discovery', icon: 'pi pi-search' },
  ],
  Container: [{ id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' }],
  Collector: [{ id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' }],
  TemplateGroup: [{ id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' }],
  TemplateRoot: [{ id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' }],
}

const route = useRoute()
const router = useRouter()
const pollStore = usePollExecutionStore()
const { runPoll } = usePollExecution()

const availablePolls = computed(() => POLL_TYPES[props.object?.class] || [])

// Driven by the route entityId param, falling back to the first available.
const activeTab = computed(() => {
  const fromRoute = route.params.entityId
  if (fromRoute && availablePolls.value.some((p) => p.id === fromRoute)) return fromRoute
  return availablePolls.value[0]?.id || null
})

const outputRefs = ref({})

function execution(pollId) {
  return pollStore.getExecution(`${props.object.id}-${pollId}`)
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
  if (!exec) return null
  const time = formatTimeShort(exec.completedAt || exec.startedAt)
  if (exec.status === 'running') return `Started ${formatTimeShort(exec.startedAt)}`
  if (exec.status === 'completed') return `Completed ${time}`
  if (exec.status === 'error') return `Failed ${time}`
  return null
}

function handleTabChange(pollId) {
  router.push({
    name: 'infrastructure',
    params: { objectId: props.object.id, viewId: 'polls', entityId: pollId },
  })
}

async function handleRun(pollId) {
  const poll = availablePolls.value.find((p) => p.id === pollId)
  if (!poll) return
  await runPoll(props.object, poll.id, poll.label)
}

watch(
  () =>
    availablePolls.value.map((p) => ({
      id: p.id,
      output: execution(p.id)?.streamOutput,
    })),
  async (vals) => {
    await nextTick()
    for (const { id, output } of vals) {
      if (output && outputRefs.value[id]) {
        outputRefs.value[id].scrollTop = outputRefs.value[id].scrollHeight
      }
    }
  },
  { deep: true },
)

// autorun=1 comes from the context menu.
watch(
  () => [route.params.entityId, route.query.autorun],
  ([pollType, autorun]) => {
    if (autorun !== '1' || !pollType) return
    // Cleared first so a refresh doesn't re-trigger.
    router.replace({
      name: 'infrastructure',
      params: { objectId: props.object.id, viewId: 'polls', entityId: pollType },
    })
    handleRun(pollType)
  },
  { immediate: true },
)
</script>

<template>
  <UnderConstructionOverlay message="Coming soon">
    <div class="polls-view">
      <Tabs
        v-if="availablePolls.length"
        :value="activeTab"
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
                  :label="`Run ${poll.label} Poll`"
                  icon="pi pi-play"
                  size="small"
                  :disabled="isRunning(poll.id)"
                  :loading="isRunning(poll.id)"
                  @click="handleRun(poll.id)"
                />
                <span v-if="lastRunLabel(poll.id)" class="poll-last-run">
                  {{ lastRunLabel(poll.id) }}
                </span>
              </div>
            </div>

            <div
              :ref="(el) => (outputRefs[poll.id] = el)"
              class="poll-output"
              :class="{ 'poll-output--empty': !execution(poll.id) }"
            >
              <template v-if="!execution(poll.id)">
                <span class="poll-empty-hint">Click "Run {{ poll.label }} Poll" to start.</span>
              </template>

              <template v-else>
                <pre class="poll-output-text">{{ execution(poll.id).streamOutput }}</pre>

                <div v-if="execution(poll.id).status === 'pending'" class="poll-status-line">
                  <i class="pi pi-spin pi-spinner" />
                  <span>Sending poll request...</span>
                </div>

                <div
                  v-if="execution(poll.id).status === 'error'"
                  class="poll-status-line poll-status-line--error"
                >
                  <i class="pi pi-times-circle" />
                  <span>{{ execution(poll.id).error }}</span>
                </div>
              </template>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <div v-else class="polls-unsupported">
        <i class="pi pi-info-circle" />
        <span>No polls available for this object type.</span>
      </div>
    </div>
  </UnderConstructionOverlay>
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

.poll-output {
  flex: 1;
  overflow: auto;
  padding: 0.75rem;
  background: var(--p-surface-card);
  min-height: 0;
}

.poll-output--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.poll-empty-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.poll-output-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--p-text-color);
}

.poll-status-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
}

.poll-status-line--error {
  color: var(--p-red-500);
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
