<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import AppTable from '@/components/common/AppTable.vue'
import { useScriptLibrary } from '@/queries/useScriptQueries'
import { useWebServiceDefinitions } from '@/queries/useWebServiceQueries'
import { useOtlpMetrics } from '@/queries/useDciConfigQueries'
import { internalMetricsFor, internalTablesFor } from '@/utils/internalDciMetrics'
import { getDciDataTypeLabel } from '@/utils/objectUtils'

// Emits `select` with `{ name, description, dataType, instanceColumn }` (plus `attributeKeys`
// for OTLP); `dataType` is null where the source has none.
const props = defineProps({
  visible: { type: Boolean, required: true },
  /** @type {'internalMetric'|'internalTable'|'script'|'webService'|'otlp'} */
  kind: { type: String, required: true },
  /** DCI owner or overriding source node; null lists everything. */
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'select'])

const KINDS = {
  internalMetric: {
    header: 'Select Internal Metric',
    noun: 'metric',
    columns: [
      { id: 'description', field: 'description', label: 'Description', sortable: true, width: 300 },
      { id: 'name', field: 'name', label: 'Name', sortable: true, width: 280 },
      { id: 'dataType', field: 'dataTypeLabel', label: 'Data Type', sortable: true, width: 160 },
    ],
  },
  internalTable: {
    header: 'Select Internal Table',
    noun: 'table',
    columns: [
      { id: 'description', field: 'description', label: 'Description', sortable: true, width: 260 },
      { id: 'name', field: 'name', label: 'Name', sortable: true, width: 260 },
      { id: 'instanceColumn', field: 'instanceColumn', label: 'Instance Column', width: 180 },
    ],
  },
  script: {
    header: 'Select Script',
    noun: 'script',
    columns: [{ id: 'name', field: 'name', label: 'Name', sortable: true, width: 600 }],
  },
  webService: {
    header: 'Select Web Service Definition',
    noun: 'definition',
    columns: [
      { id: 'name', field: 'name', label: 'Name', sortable: true, width: 240 },
      { id: 'url', field: 'url', label: 'URL', sortable: true, width: 420 },
    ],
  },
  otlp: {
    header: 'Select OTLP Metric',
    noun: 'metric',
    columns: [
      { id: 'name', field: 'name', label: 'Name', sortable: true, width: 340 },
      { id: 'type', field: 'typeLabel', label: 'Type', sortable: true, width: 110 },
      { id: 'attributes', field: 'attributes', label: 'Attribute Keys', width: 240 },
    ],
  },
}

const OTLP_TYPE_LABELS = { gauge: 'Gauge', sum: 'Sum', histogram: 'Histogram' }

const config = computed(() => KINDS[props.kind] ?? KINDS.internalMetric)

const search = ref('')

const scripts = useScriptLibrary(() => props.visible && props.kind === 'script')
const webServices = useWebServiceDefinitions(() => props.visible && props.kind === 'webService')

const otlpNodeId = computed(() => (props.object?.class === 'Node' ? props.object.id : null))
const otlpMetrics = useOtlpMetrics(otlpNodeId, () => props.visible && props.kind === 'otlp')

const remote = computed(() => {
  if (props.kind === 'script') return scripts
  if (props.kind === 'webService') return webServices
  if (props.kind === 'otlp') return otlpMetrics
  return null
})

// 404 means the server runs without its OTLP module.
const otlpUnavailable = computed(
  () => props.kind === 'otlp' && otlpMetrics.error.value?.status === 404,
)

const isLoading = computed(() => remote.value?.isLoading.value ?? false)
const loadError = computed(() =>
  remote.value?.isError.value && !otlpUnavailable.value ? remote.value.error.value : null,
)

const emptyText = computed(() => {
  if (search.value) return `No matching ${config.value.noun}s`
  if (props.kind === 'otlp') {
    if (otlpUnavailable.value) return 'This server does not list OTLP metrics (no OTLP module)'
    if (!otlpNodeId.value) return 'OTLP metrics are recorded per node; this owner has none'
    return 'No OTLP metrics received from this node yet'
  }
  return `No ${config.value.noun}s available`
})

function retry() {
  remote.value?.refetch()
}

const rows = computed(() => {
  switch (props.kind) {
    case 'internalTable':
      return internalTablesFor(props.object).map((t) => {
        const instanceColumn = t.instanceColumns.join(', ')
        return {
          id: t.name,
          name: t.name,
          description: t.description,
          instanceColumn,
          result: { name: t.name, description: t.description, dataType: null, instanceColumn },
        }
      })
    case 'script':
      return (scripts.data.value ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        result: { name: s.name, description: s.name, dataType: 'string', instanceColumn: '' },
      }))
    case 'webService':
      // The server reads `definition:path`; the path is typed after the colon.
      return (webServices.data.value ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        url: d.url,
        result: { name: `${d.name}:`, description: d.name, dataType: 'string', instanceColumn: '' },
      }))
    case 'otlp':
      // Legacy collects OTLP values as floating point.
      return (otlpMetrics.data.value ?? []).map((m) => ({
        id: m.name,
        name: m.name,
        typeLabel: OTLP_TYPE_LABELS[m.type] ?? m.type,
        attributes: (m.attributeKeys ?? []).join(', '),
        result: {
          name: m.name,
          description: m.name,
          dataType: 'float',
          instanceColumn: '',
          attributeKeys: m.attributeKeys ?? [],
        },
      }))
    default:
      return internalMetricsFor(props.object).map((m) => ({
        id: m.name,
        name: m.name,
        description: m.description,
        dataTypeLabel: getDciDataTypeLabel(m.dataType),
        result: { name: m.name, description: m.description, dataType: m.dataType },
      }))
  }
})

watch(
  () => props.visible,
  (v) => {
    if (v) search.value = ''
  },
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) =>
    config.value.columns.some((col) =>
      String(row[col.field] ?? '')
        .toLowerCase()
        .includes(q),
    ),
  )
})

function onRowClick(row) {
  emit('select', row.result)
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="config.header"
    modal
    :style="{ width: '820px' }"
    :breakpoints="{ '900px': '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-layout">
      <div class="toolbar">
        <IconField style="width: 100%">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="search"
            data-filter-input
            placeholder="Filter..."
            size="small"
            style="width: 100%"
            autofocus
          />
        </IconField>
      </div>

      <AppTable
        :columns="config.columns"
        :rows="filtered"
        :loading="isLoading"
        :error="loadError"
        :sort-field="config.columns[0].field"
        :sort-order="1"
        striped
        column-borders
        resize-fit
        class="picker-table"
        @row-click="onRowClick"
        @retry="retry"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'name'" class="mono" :title="row.name">{{ row.name }}</span>
          <span v-else class="cell-text" :title="row[col.field] || undefined">{{
            row[col.field]
          }}</span>
        </template>
        <template #empty>{{ emptyText }}</template>
      </AppTable>
    </div>

    <template #footer>
      <span class="footer-hint">Click a {{ config.noun }} to select it</span>
      <Button label="Cancel" severity="secondary" size="small" @click="close" />
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

.picker-table {
  flex: 1;
  min-height: 0;
}

.mono {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
}

.cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footer-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: auto;
  align-self: center;
}
</style>
