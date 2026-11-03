<script setup>
/**
 * Standing instructions of an AI operator instance (legacy AiOperatorInstructions property
 * page): text the operator writes for itself and reads back on every iteration. An
 * administrator can edit it, lock it so updates from the model are ignored, and restore an
 * earlier version from the history. Edits are part of the operator form and apply on Save.
 */
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import AppTable from '@/components/common/AppTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import { useAiOperatorInstructionsHistory } from '@/queries/useAiOperatorQueries'
import { formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  operatorId: { type: Number, required: true },
})

const instructions = defineModel('instructions', { type: String, default: '' })
const locked = defineModel('locked', { type: Boolean, default: false })

const { data, isLoading, error, refetch } = useAiOperatorInstructionsHistory(() => props.operatorId)

const rows = computed(() => data.value ?? [])

const columns = [
  { id: 'timestamp', field: 'timestamp', label: 'Changed', width: 170 },
  { id: 'iteration', field: 'iteration', label: 'Iteration', width: 90 },
  { id: 'previousText', field: 'previousText', label: 'Previous text', width: 360 },
  { id: 'actions', field: 'actions', label: '', width: 90 },
]

const viewed = ref(null)
const viewVisible = computed({
  get: () => viewed.value != null,
  set: (visible) => {
    if (!visible) viewed.value = null
  },
})

function view(row) {
  viewed.value = row
}

/** Copies the old text into the form; Save applies it, as in legacy. */
function restore(row) {
  instructions.value = row.previousText ?? ''
  viewed.value = null
}
</script>

<template>
  <DetailCard title="Standing Instructions" wide>
    <div class="instructions-field">
      <Textarea
        v-model="instructions"
        :rows="8"
        aria-label="Standing instructions"
        class="instructions-area"
      />
      <small class="hint-text">
        Written by the operator itself; injected after the persona prompt.
      </small>
    </div>

    <div class="instructions-lock">
      <ToggleSwitch v-model="locked" input-id="op-instructions-locked" />
      <label for="op-instructions-locked">
        Locked (updates returned by the operator are ignored)
      </label>
    </div>

    <div class="history">
      <span class="history-caption">History</span>
      <LoadingState v-if="isLoading" compact />
      <AppTable
        v-else
        :columns="columns"
        :rows="rows"
        :error="error"
        striped
        resize-fit
        compact
        :page-size="10"
        class="history-table"
        @row-click="view"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'timestamp'">{{ formatDateTime(row.timestamp) || '-' }}</span>
          <span v-else-if="col.id === 'iteration'">{{ row.iteration }}</span>
          <span
            v-else-if="col.id === 'previousText'"
            class="previous-text"
            :class="{ 'text-muted': !row.previousText }"
            >{{ row.previousText || '(empty)' }}</span
          >
          <span v-else-if="col.id === 'actions'" class="row-actions">
            <Button
              v-tooltip.top="'View'"
              icon="pi pi-eye"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="View"
              @click.stop="view(row)"
            />
            <Button
              v-tooltip.top="'Restore'"
              icon="pi pi-replay"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="Restore"
              @click.stop="restore(row)"
            />
          </span>
        </template>
        <template #empty>
          <div class="history-empty">No earlier versions</div>
        </template>
      </AppTable>
    </div>

    <Dialog
      v-model:visible="viewVisible"
      header="Previous Instructions"
      modal
      :style="{ width: '40rem' }"
      :draggable="false"
    >
      <p v-if="viewed" class="viewed-meta">
        {{ formatDateTime(viewed.timestamp) || '-' }}, iteration {{ viewed.iteration }}
      </p>
      <pre class="viewed-text" :class="{ 'text-muted': !viewed?.previousText }">{{
        viewed?.previousText || '(empty)'
      }}</pre>
      <template #footer>
        <Button label="Close" severity="secondary" text autofocus @click="viewVisible = false" />
        <Button label="Restore" icon="pi pi-replay" @click="restore(viewed)" />
      </template>
    </Dialog>
  </DetailCard>
</template>

<style scoped>
.instructions-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.instructions-area {
  width: 100%;
  font-size: 0.8125rem;
  resize: vertical;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.instructions-lock {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
  font-size: 0.875rem;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-surface-border);
}

.history-caption {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.history-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
}

.history-table :deep(tbody tr) {
  cursor: pointer;
}

.history-empty {
  padding: 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.previous-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  gap: 0.125rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.viewed-meta {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.viewed-text {
  margin: 0;
  max-height: 24rem;
  overflow-y: auto;
  padding: 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-ground);
  font-family: inherit;
  font-size: 0.8125rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
