<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import AppTable from '@/components/common/AppTable.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { useEventTemplates } from '@/queries/useEventTemplateQueries'
import { normalizeSeverity, severityLabels } from '@/utils/alarmDisplay'

// Port of the legacy EventSelectionDialog. The message template shows on hover over the name
// rather than as a column. Single mode emits the code on click; `multiple` emits an array on OK.
const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  modelValue: {
    type: [Number, Array],
    default: null,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:visible', 'update:modelValue'])

const COLUMNS = [
  { id: 'code', field: 'code', label: 'Code', sortable: true, width: 100 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 340 },
  { id: 'tags', field: 'tags', label: 'Tags', width: 180 },
]

const { data: eventTemplatesData, isLoading, isError, error, refetch } = useEventTemplates()

const search = ref('')

const localSelected = ref(new Set())

watch(
  () => props.visible,
  (v) => {
    if (v) {
      search.value = ''
      if (props.multiple) {
        localSelected.value = new Set(Array.isArray(props.modelValue) ? props.modelValue : [])
      } else {
        localSelected.value = new Set()
      }
    }
  },
)

function tagList(event) {
  return Array.isArray(event.tags) ? event.tags : []
}

function severityLabel(severity) {
  return severityLabels[normalizeSeverity(severity)] ?? severityLabels.normal
}

// AppTable keys rows, and their selection, by `id`.
const rows = computed(() => (eventTemplatesData.value ?? []).map((t) => ({ ...t, id: t.code })))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(
    (e) =>
      (e.name ?? '').toLowerCase().includes(q) ||
      String(e.code).includes(q) ||
      tagList(e).some((tag) => tag.toLowerCase().includes(q)),
  )
})

function onRowClick(event) {
  if (props.multiple) {
    const next = new Set(localSelected.value)
    if (next.has(event.code)) {
      next.delete(event.code)
    } else {
      next.add(event.code)
    }
    localSelected.value = next
  } else {
    emit('update:modelValue', event.code)
    emit('update:visible', false)
  }
}

// AppTable reports only visible rows, so picks hidden by the filter are kept as they were.
function onSelectionChange(next) {
  const visible = new Set(filtered.value.map((e) => e.code))
  const merged = new Set([...localSelected.value].filter((code) => !visible.has(code)))
  for (const code of next) {
    if (visible.has(code)) merged.add(code)
  }
  localSelected.value = merged
}

function confirm() {
  emit('update:modelValue', [...localSelected.value])
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Event"
    modal
    :style="{ width: '760px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <div class="toolbar">
        <IconField style="width: 100%">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="search"
            data-filter-input
            placeholder="Filter by name, code or tag..."
            size="small"
            style="width: 100%"
            autofocus
          />
        </IconField>
      </div>

      <AppTable
        :columns="COLUMNS"
        :rows="filtered"
        :loading="isLoading"
        :error="isError ? error : null"
        sort-field="code"
        :sort-order="1"
        :selectable="multiple"
        :selected-ids="localSelected"
        striped
        column-borders
        resize-fit
        class="event-table"
        @row-click="onRowClick"
        @selection-change="onSelectionChange"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'code'" class="event-code">
            <StatusIcon
              v-tooltip.top="severityLabel(row.severity)"
              :status="row.severity"
              size="1.5em"
            />
            {{ row.code }}
          </span>
          <span
            v-else-if="col.id === 'name'"
            class="event-name"
            :title="row.message || undefined"
            >{{ row.name }}</span
          >
          <span
            v-else-if="col.id === 'tags'"
            class="event-tags"
            :class="{ 'text-muted': !tagList(row).length }"
            >{{ tagList(row).join(', ') || '-' }}</span
          >
        </template>
        <template #empty>{{ search ? 'No matching events' : 'No event templates' }}</template>
      </AppTable>
    </div>

    <template #footer>
      <template v-if="multiple">
        <span class="footer-hint">{{ $plural(localSelected.size, 'event') }} selected</span>
        <Button label="Cancel" severity="secondary" size="small" @click="close" />
        <Button label="OK" size="small" @click="confirm" />
      </template>
      <template v-else>
        <span class="footer-hint">Click an event to select it</span>
        <Button label="Cancel" severity="secondary" size="small" @click="close" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.picker-layout {
  display: flex;
  flex-direction: column;
  height: 500px;
  margin: -1.25rem;
  margin-top: 0;
  overflow: hidden;
}

.toolbar {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.event-table {
  flex: 1;
  min-height: 0;
}

.event-code {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  color: var(--p-text-muted-color);
}

.event-name {
  display: block;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-tags {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.footer-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: auto;
  align-self: center;
}
</style>
