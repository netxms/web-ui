<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useAiSkillsAndFunctions, useDisableAiItem, useEnableAiItem } from '@/queries/useAiQueries'

const toast = useToast()

const { data, isLoading, isFetching, isError, error, refetch } = useAiSkillsAndFunctions()
const { mutate: disableItem, isPending: isDisabling } = useDisableAiItem()
const { mutate: enableItem, isPending: isEnabling } = useEnableAiItem()

defineExpose({ refetch })

// Registered on the server (present in skills[] or functions[])
const registeredItems = computed(() => {
  const skills = (data.value?.skills ?? []).map((s) => ({
    ...s,
    itemType: 'S',
    typeLabel: 'Skill',
    registered: true,
    _key: `S:${s.name}`,
  }))
  const funcs = (data.value?.functions ?? []).map((f) => ({
    ...f,
    itemType: 'F',
    typeLabel: 'Function',
    registered: true,
    _key: `F:${f.name}`,
  }))
  return [...skills, ...funcs]
})

// Pre-registered future items: only in disabledExtras, not in skills[]/functions[]
const futureItems = computed(() => {
  const regKeys = new Set(registeredItems.value.map((i) => `${i.itemType}:${i.name}`))
  return (data.value?.disabledExtras ?? [])
    .filter((e) => !regKeys.has(`${e.type}:${e.name}`))
    .map((e) => ({
      name: e.name,
      description: null,
      disabled: true,
      itemType: e.type,
      typeLabel: e.type === 'S' ? 'Skill' : 'Function',
      registered: false,
      _key: `${e.type}:${e.name}`,
    }))
})

// Selecting in one table clears the other
const selectedRegistered = ref(null)
const selectedFuture = ref(null)

watch(selectedRegistered, (v) => {
  if (v) selectedFuture.value = null
})
watch(selectedFuture, (v) => {
  if (v) selectedRegistered.value = null
})

const selectedItem = computed(() => selectedRegistered.value || selectedFuture.value)

const canDisable = computed(
  () => selectedItem.value?.registered && !selectedItem.value?.disabled && !isDisabling.value,
)
const canEnable = computed(
  () => selectedItem.value?.registered && selectedItem.value?.disabled && !isEnabling.value,
)
const canRemove = computed(
  () => selectedItem.value != null && !selectedItem.value.registered && !isEnabling.value,
)

// For adding a pre-disabled future item
const TYPE_OPTIONS = [
  { value: 'S', label: 'Skill' },
  { value: 'F', label: 'Function' },
]

const showDisableDialog = ref(false)
const disableForm = ref({ type: 'S', name: '' })
const disableNameError = ref(false)

function openDisableDialog() {
  disableForm.value = { type: 'S', name: '' }
  disableNameError.value = false
  showDisableDialog.value = true
}

function confirmDisable() {
  disableNameError.value = !disableForm.value.name.trim()
  if (disableNameError.value) return
  const type = disableForm.value.type
  const name = disableForm.value.name.trim()
  disableItem(
    { type, name },
    {
      onSuccess: () => {
        showDisableDialog.value = false
        toast.add({
          severity: 'success',
          summary: 'Added',
          detail: `"${name}" added to disabled list.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Failed',
          detail: err.message ?? 'Could not add item to disabled list.',
          life: 5000,
        })
      },
    },
  )
}

function disableSelected() {
  const item = selectedItem.value
  if (!item?.registered || item.disabled) return
  disableItem(
    { type: item.itemType, name: item.name },
    {
      onSuccess: () => {
        toast.add({
          severity: 'success',
          summary: 'Disabled',
          detail: `"${item.name}" disabled.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Failed',
          detail: err.message ?? 'Could not disable item.',
          life: 5000,
        })
      },
    },
  )
}

function enableSelected() {
  const item = selectedItem.value
  if (!item?.registered || !item.disabled) return
  enableItem(
    { type: item.itemType, name: item.name },
    {
      onSuccess: () => {
        toast.add({
          severity: 'success',
          summary: 'Enabled',
          detail: `"${item.name}" enabled.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Failed',
          detail: err.message ?? 'Could not enable item.',
          life: 5000,
        })
      },
    },
  )
}

function removeSelected() {
  const item = selectedItem.value
  if (!item || item.registered) return
  enableItem(
    { type: item.itemType, name: item.name },
    {
      onSuccess: () => {
        selectedFuture.value = null
        toast.add({
          severity: 'success',
          summary: 'Removed',
          detail: `"${item.name}" removed from disabled list.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Failed',
          detail: err.message ?? 'Could not remove item.',
          life: 5000,
        })
      },
    },
  )
}

const sfColumns = [
  { id: 'typeLabel', field: 'typeLabel', label: 'Type', sortable: true, width: 100 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 190 },
  { id: 'description', field: 'description', label: 'Description', sortable: false, width: 400 },
  { id: 'mode', field: 'defaultMode', label: 'Mode', sortable: true, width: 110 },
  { id: 'disabled', field: 'disabled', label: 'Status', sortable: true, width: 110 },
]

function registeredRowClass(row) {
  return selectedRegistered.value?._key === row._key ? 'row--selected' : null
}
function futureRowClass(row) {
  return selectedFuture.value?._key === row._key ? 'row--selected row--future' : 'row--future'
}
</script>

<template>
  <div class="ai-tab">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="tab-toolbar">
      <span class="tab-toolbar-title">Skills &amp; Functions</span>
      <div class="tab-toolbar-actions">
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          label="Add"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openDisableDialog"
        />
        <Button
          label="Disable"
          icon="pi pi-ban"
          size="small"
          text
          :disabled="!canDisable"
          :loading="isDisabling"
          @click="disableSelected"
        />
        <Button
          label="Enable"
          icon="pi pi-check"
          size="small"
          severity="success"
          text
          :disabled="!canEnable"
          :loading="isEnabling && selectedItem?.registered && selectedItem?.disabled"
          @click="enableSelected"
        />
        <Button
          label="Remove"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          text
          :disabled="!canRemove"
          :loading="isEnabling && selectedItem != null && !selectedItem.registered"
          @click="removeSelected"
        />
      </div>
    </div>

    <div v-if="isLoading" class="table-loading">
      <Skeleton v-for="i in 6" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

    <template v-else>
      <div class="sf-section-label">Registered</div>
      <AppTable
        :columns="sfColumns"
        :rows="registeredItems"
        striped
        column-borders
        resize-fit
        sort-field="name"
        :sort-order="1"
        :row-class="registeredRowClass"
        class="items-table"
        @row-click="(row) => (selectedRegistered = row)"
      >
        <template #cell="{ col, row }">
          <span
            v-if="col.id === 'typeLabel'"
            class="type-chip"
            :class="row.itemType === 'S' ? 'type-skill' : 'type-function'"
            >{{ row.typeLabel }}</span
          >
          <span v-else-if="col.id === 'name'" class="item-name">{{ row.name }}</span>
          <template v-else-if="col.id === 'description'">
            <span :class="{ 'text-muted': !row.description }">{{ row.description || '—' }}</span>
            <span v-if="row.parameters?.length" class="param-list">
              <span v-for="p in row.parameters" :key="p.name" class="param-chip">
                {{ p.name }}<span v-if="p.type" class="param-type">: {{ p.type }}</span>
              </span>
            </span>
          </template>
          <template v-else-if="col.id === 'mode'">
            <span v-if="row.itemType === 'S'" class="mode-cell">
              {{ row.defaultMode || 'loaded' }}
              <i
                v-if="row.supportsDelegation"
                v-tooltip.top="'Supports delegation'"
                class="pi pi-sitemap mode-icon"
              />
            </span>
            <span v-else class="text-muted">—</span>
          </template>
          <Tag
            v-else-if="col.id === 'disabled'"
            :value="row.disabled ? 'Disabled' : 'Enabled'"
            :severity="row.disabled ? 'secondary' : 'success'"
            outlined
          />
        </template>
        <template #empty>
          <div class="table-empty">No skills or functions registered.</div>
        </template>
      </AppTable>

      <!-- Only in disabledExtras -->
      <template v-if="futureItems.length > 0">
        <div class="sf-section-label sf-section-label--future">Pre-registered (not yet loaded)</div>
        <AppTable
          :columns="sfColumns"
          :rows="futureItems"
          column-borders
          resize-fit
          sort-field="name"
          :sort-order="1"
          :row-class="futureRowClass"
          class="items-table"
          @row-click="(row) => (selectedFuture = row)"
        >
          <template #cell="{ col, row }">
            <span
              v-if="col.id === 'typeLabel'"
              class="type-chip"
              :class="row.itemType === 'S' ? 'type-skill' : 'type-function'"
              >{{ row.typeLabel }}</span
            >
            <span v-else-if="col.id === 'name'" class="item-name text-muted">
              {{ row.name }}
            </span>
            <span v-else-if="col.id === 'description'" class="text-muted fst-italic">
              Not yet registered
            </span>
            <span v-else-if="col.id === 'mode'" class="text-muted">—</span>
            <Tag v-else-if="col.id === 'disabled'" value="Disabled" severity="secondary" outlined />
          </template>
        </AppTable>
      </template>
    </template>
  </div>

  <Dialog
    v-model:visible="showDisableDialog"
    header="Add to Disabled List"
    modal
    :style="{ width: '26rem' }"
    :draggable="false"
  >
    <div class="ai-dialog-body">
      <div class="ai-dialog-field">
        <label for="disable-type">Type</label>
        <Select
          id="disable-type"
          v-model="disableForm.type"
          :options="TYPE_OPTIONS"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div class="ai-dialog-field">
        <label for="disable-name">Name</label>
        <InputText
          id="disable-name"
          v-model="disableForm.name"
          :class="{ 'p-invalid': disableNameError }"
          placeholder="Exact skill or function name"
          fluid
        />
        <small v-if="disableNameError" class="error-text">Name is required.</small>
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="showDisableDialog = false" />
      <Button
        label="Add"
        severity="primary"
        :disabled="isDisabling"
        :loading="isDisabling"
        @click="confirmDisable"
      />
    </template>
  </Dialog>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.ai-tab :deep(.items-table .row--future td) {
  opacity: 0.65;
}

.sf-section-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.625rem 0 0.375rem;
  flex-shrink: 0;
}

.sf-section-label--future {
  margin-top: 1.25rem;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.type-skill {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.type-function {
  background: var(--p-purple-100);
  color: var(--p-purple-700);
}

.param-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-left: 0.5rem;
  vertical-align: middle;
}

.param-chip {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--p-surface-hover);
  color: var(--p-text-muted-color);
}

.param-type {
  opacity: 0.75;
}

.mode-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.mode-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
