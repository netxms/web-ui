<script setup>
// Legacy AgentLogViewer: the last megabyte of the agent's own log, scrolled to the end.
import { computed, inject, ref, watch } from 'vue'
import Button from 'primevue/button'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import ConfigTextViewer from '@/components/objects/ConfigTextViewer.vue'
import { downloadAgentLog } from '@/actions/agentLogCommands'
import { useAgentLogTail } from '@/queries/useAgentLogQueries'
import { describeAgentLogError } from '@/utils/agentLog'

const props = defineProps({
  object: { type: Object, required: true },
})

const isNode = computed(() => props.object.class === 'Node')
const objectId = computed(() => (isNode.value ? props.object.id : null))

const { data, isLoading, isFetching, isError, error, refetch } = useAgentLogTail(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const errorMessage = computed(() => (isError.value ? describeAgentLogError(error.value) : null))

const downloading = ref(false)

async function download() {
  downloading.value = true
  try {
    await downloadAgentLog(props.object)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="agent-log-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="agent-log-toolbar">
      <span class="agent-log-note">
        <template v-if="data?.truncated">Last 1 MB of the log</template>
        <template v-else-if="data">Whole log</template>
      </span>
      <Button
        label="Download"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        text
        class="agent-log-download"
        :disabled="!isNode"
        :loading="downloading"
        @click="download"
      />
    </div>

    <div v-if="!isNode" class="agent-log-notice">Only a node has an agent log.</div>
    <LoadingState v-else-if="isLoading" message="Reading agent log..." />
    <div v-else-if="isError" class="agent-log-notice">
      <QueryErrorState
        :error="error"
        :message="errorMessage"
        :retrying="isFetching"
        @retry="refetch()"
      />
    </div>
    <ConfigTextViewer
      v-else
      :text="data?.text ?? ''"
      label="Agent log"
      empty-message="The agent log is empty."
      scroll-to-end
    />
  </div>
</template>

<style scoped>
.agent-log-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.agent-log-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.agent-log-note {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.agent-log-download {
  margin-left: auto;
}

.agent-log-notice {
  padding: 1.5rem;
}
</style>
