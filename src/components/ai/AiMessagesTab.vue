<script setup>
// AI messages (what background AI tasks and operators leave for a user) exist only over NXCP,
// with no WebAPI route, so this tab shows the legacy `AiMessagesView` layout under construction.
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { notifyNotImplemented } from '@/utils/notImplemented'

const messageColumns = [
  { id: 'id', field: 'id', label: 'ID', sortable: false, width: 70 },
  { id: 'type', field: 'type', label: 'Type', sortable: false, width: 90 },
  { id: 'status', field: 'status', label: 'Status', sortable: false, width: 90 },
  { id: 'title', field: 'title', label: 'Title', sortable: false, width: 300 },
  { id: 'object', field: 'object', label: 'Related Object', sortable: false, width: 160 },
  { id: 'created', field: 'created', label: 'Created', sortable: false, width: 150 },
  { id: 'expires', field: 'expires', label: 'Expires', sortable: false, width: 150 },
]
</script>

<template>
  <UnderConstructionOverlay
    message="AI messages have no WebAPI endpoint yet - the server exposes them over NXCP only."
  >
    <div class="ai-tab">
      <div class="tab-toolbar">
        <span class="tab-toolbar-title">AI Messages</span>
        <div class="tab-toolbar-actions">
          <Button
            label="Approve"
            icon="pi pi-check"
            size="small"
            severity="secondary"
            text
            @click="notifyNotImplemented('Approve AI message')"
          />
          <Button
            label="Reject"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            @click="notifyNotImplemented('Reject AI message')"
          />
          <Button
            label="Delete"
            icon="pi pi-trash"
            size="small"
            severity="secondary"
            text
            @click="notifyNotImplemented('Delete AI message')"
          />
        </div>
      </div>

      <AppTable
        :columns="messageColumns"
        :rows="[]"
        striped
        column-borders
        resize-fit
        class="items-table"
      >
        <template #empty>
          <div class="table-empty">No AI messages.</div>
        </template>
      </AppTable>

      <div class="message-content">Select a message to view its content.</div>
    </div>
  </UnderConstructionOverlay>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.message-content {
  margin-top: 0.75rem;
  padding: 1.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  background: var(--p-surface-card);
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  text-align: center;
}
</style>
