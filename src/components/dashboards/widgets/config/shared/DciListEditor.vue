<script setup>
import { ref } from 'vue'
import Button from 'primevue/button'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import DciListRow from './DciListRow.vue'
import { useWidgetEditor } from '../editorContext'

// Edits form.dciList (ChartDciConfig). Add flow: pick a node, then one of its DCIs in the row.
const { form } = useWidgetEditor()

const nodePickerVisible = ref(false)

const INFRA_PERSPECTIVES = [{ id: 'infrastructure', label: 'Infrastructure', rootId: 2 }]

function addFromNode(node) {
  if (!Array.isArray(form.dciList)) form.dciList = []
  form.dciList.push({
    nodeId: node.id,
    nodeName: node.name,
    dciId: null,
    name: '',
    color: null,
    lineChartType: -1,
    invertValues: false,
    useRawValues: false,
    displayFormat: '',
  })
  nodePickerVisible.value = false
}

function updateEntry(index, patch) {
  form.dciList[index] = { ...form.dciList[index], ...patch }
}

function removeEntry(index) {
  form.dciList.splice(index, 1)
}
</script>

<template>
  <div class="wpd-field wpd-field--column">
    <div class="dci-list-header">
      <span class="wpd-label">Data Collection Items</span>
      <Button
        label="Add DCI"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        @click="nodePickerVisible = true"
      />
    </div>
    <div v-if="!form.dciList?.length" class="dci-list-empty">
      No DCIs configured — add one to populate the chart.
    </div>
    <div v-else class="dci-list">
      <DciListRow
        v-for="(entry, i) in form.dciList"
        :key="`${entry.nodeId}-${entry.dciId}-${i}`"
        :entry="entry"
        @update="updateEntry(i, $event)"
        @remove="removeEntry(i)"
      />
    </div>
  </div>

  <ObjectPickerDialog
    v-model:visible="nodePickerVisible"
    title="Select Node"
    :perspectives="INFRA_PERSPECTIVES"
    @select="addFromNode"
  />
</template>

<style scoped>
.dci-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.dci-list {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.dci-list-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.375rem 0;
}
</style>
