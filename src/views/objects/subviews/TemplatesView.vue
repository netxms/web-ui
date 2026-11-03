<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import StatusTag from '@/components/common/StatusTag.vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import BindableObjectPickerDialog from '@/components/objects/BindableObjectPickerDialog.vue'
import {
  useObject,
  useObjectsByIds,
  useBindObjectChild,
  useUnbindObjectChild,
} from '@/queries/useObjectQueries'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

// Sub-tree nodes carry children, not parents, so fetch the full object.
const { data: fullObject, isLoading, isFetching, refetch } = useObject(objectId)

const parentIds = computed(() => fullObject.value?.parents ?? [])
const { objectsById } = useObjectsByIds(parentIds)

const appliedTemplates = computed(() => {
  const map = objectsById.value
  return parentIds.value.map((id) => map.get(id)).filter((o) => o && o.class === 'Template')
})

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const { mutateAsync: bindAsync } = useBindObjectChild()
const { mutateAsync: unbindAsync } = useUnbindObjectChild()
const toast = useToast()

const filterText = ref('')

useWorkingState('applied-templates', { view: { filterText } })
const filteredTemplates = computed(() => {
  if (!filterText.value) return appliedTemplates.value
  const search = filterText.value.toLowerCase()
  return appliedTemplates.value.filter((t) => (t.name ?? '').toLowerCase().includes(search))
})

const COLUMNS = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 300 },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 110 },
  { id: 'actions', field: null, label: '', sortable: false, width: 44 },
]

const pickerVisible = ref(false)

async function onApplySelected(selected) {
  if (!selected?.length) return
  try {
    await Promise.all(selected.map((t) => bindAsync({ parentId: t.id, childId: objectId.value })))
    toast.add({
      severity: 'success',
      summary: selected.length === 1 ? 'Template applied' : `${selected.length} templates applied`,
      life: 2500,
    })
  } catch {
    toast.add({ severity: 'error', summary: 'Apply failed', life: 3000 })
  }
}

const removeDialogVisible = ref(false)
const removeTarget = ref(null)
const removing = ref(false)

function openRemoveDialog(template) {
  removeTarget.value = template
  removeDialogVisible.value = true
}

async function confirmRemove(removeDci) {
  if (!removeTarget.value) return
  removing.value = true
  try {
    await unbindAsync({ parentId: removeTarget.value.id, childId: objectId.value, removeDci })
    toast.add({ severity: 'success', summary: 'Template removed', life: 2500 })
    removeDialogVisible.value = false
    removeTarget.value = null
  } catch {
    toast.add({ severity: 'error', summary: 'Remove failed', life: 3000 })
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="templates-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="templates-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter templates..."
          class="filter-input"
        />
      </IconField>
      <span v-if="!isLoading" class="templates-count">{{
        $plural(filteredTemplates.length, 'template')
      }}</span>
      <Button
        label="Apply Template..."
        icon="pi pi-arrow-right"
        size="small"
        severity="primary"
        class="apply-btn"
        @click="pickerVisible = true"
      />
    </div>

    <AppTable
      :columns="COLUMNS"
      :rows="filteredTemplates"
      :loading="isLoading"
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="applied-templates"
      resize-fit
    >
      <template #cell="{ col, row }">
        <template v-if="col.id === 'status'">
          <StatusTag :status="row.status" />
        </template>
        <template v-else-if="col.id === 'actions'">
          <Button
            icon="pi pi-times"
            text
            rounded
            severity="danger"
            size="small"
            class="row-action-btn"
            aria-label="Remove"
            @click.stop="openRemoveDialog(row)"
          />
        </template>
      </template>
      <template #empty>
        <div class="empty-message">
          No templates are applied to this object. Use "Apply Template..." to add one.
        </div>
      </template>
    </AppTable>

    <BindableObjectPickerDialog
      v-model:visible="pickerVisible"
      :classes="['Template']"
      @select="onApplySelected"
    />

    <Dialog
      :visible="removeDialogVisible"
      header="Remove Template"
      modal
      :style="{ width: '28rem' }"
      @update:visible="removeDialogVisible = $event"
    >
      <p class="remove-message">
        Remove "{{ removeTarget?.name }}" from this object's applied templates?
      </p>
      <p class="remove-hint">
        Data collection items and other configuration inherited from this template can optionally be
        removed as well.
      </p>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="removeDialogVisible = false" />
        <Button
          label="Remove"
          severity="secondary"
          outlined
          :loading="removing"
          @click="confirmRemove(false)"
        />
        <Button
          label="Remove and Delete DCIs"
          severity="danger"
          :loading="removing"
          @click="confirmRemove(true)"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.templates-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.templates-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.templates-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.apply-btn {
  margin-left: auto;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.remove-message {
  margin: 0 0 0.5rem;
}

.remove-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
