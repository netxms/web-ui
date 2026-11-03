<script setup>
// AI agent tasks exist only over NXCP, with no WebAPI route, so this shows the legacy view's
// shape behind the under-construction overlay.
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import UnderConstructionOverlay from '@/components/common/UnderConstructionOverlay.vue'
import { notifyNotImplemented } from '@/utils/notImplemented'

const taskColumns = [
  { id: 'id', field: 'id', label: 'ID', sortable: false, width: 80 },
  { id: 'description', field: 'description', label: 'Description', sortable: false, width: 300 },
  { id: 'owner', field: 'owner', label: 'Owner', sortable: false, width: 150 },
  { id: 'state', field: 'state', label: 'State', sortable: false, width: 110 },
  { id: 'lastExecution', field: 'lastExecution', label: 'Last execution', width: 150 },
  { id: 'nextExecution', field: 'nextExecution', label: 'Next execution', width: 150 },
  { id: 'explanation', field: 'explanation', label: 'Explanation', sortable: false, width: 300 },
]
</script>

<template>
  <UnderConstructionOverlay
    message="AI tasks have no WebAPI endpoint yet - the server exposes them over NXCP only."
  >
    <div class="ai-tab">
      <div class="tab-toolbar">
        <span class="tab-toolbar-title">AI Tasks</span>
        <div class="tab-toolbar-actions">
          <Button
            label="Add"
            icon="pi pi-plus"
            size="small"
            severity="primary"
            @click="notifyNotImplemented('Add AI task')"
          />
        </div>
      </div>

      <AppTable
        :columns="taskColumns"
        :rows="[]"
        striped
        column-borders
        resize-fit
        class="items-table"
      >
        <template #empty>
          <div class="table-empty">No AI tasks.</div>
        </template>
      </AppTable>
    </div>
  </UnderConstructionOverlay>
</template>

<style src="@/assets/styles/ai-section.css" />
