<script setup>
/**
 * The simple filter compiles to NXSL (utils/objectQueryScript), so both modes run through
 * `POST /v1/objects/query` and "Show as query" can hand the form's script to the editor.
 *
 * The URL is the state: `?text=&mode=&class=&zone=&from=&to=&root=` for a filter, `?q=` for a
 * script. Nothing runs until Search is pressed: a query walks every readable object.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { useConfirm } from 'primevue/useconfirm'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import ObjectQueryFilterForm from '@/components/tools/ObjectQueryFilterForm.vue'
import ObjectQuerySavedList from '@/components/tools/ObjectQuerySavedList.vue'
import { useObjectQuery, useZoneNames } from '@/queries/useObjectQueries'
import { useObjectQueryStore } from '@/stores/objectQueryStore'
import { formatIpAddress, getClassLabel } from '@/utils/objectUtils'
import { compileObjectFilter } from '@/utils/objectQueryScript'
import {
  CONSUMED_FIELDS,
  RESULT_LIMIT,
  createModel,
  fromQuery,
  isBlank,
  toQuery,
  toRequest,
} from '@/utils/objectQueryModel'
import { objectQueryTarget, objectTarget } from '@/utils/routeTargets'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const store = useObjectQueryStore()
const zoneNames = useZoneNames()

/** The submitted query is whatever the URL says. */
const draft = ref(fromQuery(route.query))

const submitted = computed(() => fromQuery(route.query))

const advanced = ref(draft.value.script ? true : store.advanced)

// A link into the tool replaces the draft outright.
watch(
  () => route.query,
  (query) => {
    draft.value = fromQuery(query)
    if (draft.value.script) advanced.value = true
  },
)

watch(advanced, (value) => store.setAdvanced(value))

const MODE_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'advanced', label: 'Advanced' },
]

const mode = computed(() => (advanced.value ? 'advanced' : 'simple'))

const compiledScript = computed(() => compileObjectFilter(draft.value).script)

function toAdvanced() {
  if (!draft.value.script) draft.value.script = compiledScript.value
  advanced.value = true
}

function toSimple() {
  // The form cannot represent a hand-written script, so leaving advanced discards it.
  if (draft.value.script && draft.value.script !== compiledScript.value) {
    confirm.require({
      message: 'Switching back to the simple filter discards the query script. Continue?',
      header: 'Discard query script',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard',
      rejectLabel: 'Cancel',
      accept: () => {
        draft.value.script = ''
        advanced.value = false
      },
    })
    return
  }
  draft.value.script = ''
  advanced.value = false
}

function setMode(value) {
  if (value === mode.value) return
  if (value === 'advanced') toAdvanced()
  else toSimple()
}

/** An empty body leaves the query disabled, so a blank form costs no request. */
const request = computed(() => toRequest(submitted.value) ?? {})

const { data: results, isFetching, error, refetch } = useObjectQuery(request)

function search() {
  const target = objectQueryTarget(toQuery(draft.value))
  // Re-running the same query has to go through refetch: the route would not change.
  if (JSON.stringify(target.query ?? {}) === JSON.stringify(route.query)) refetch()
  else router.replace(target)
}

const hasQuery = computed(() => !isBlank(submitted.value))

const rows = computed(() =>
  (results.value ?? []).map((result) => {
    const object = result.object ?? {}
    const zoneUin = Number(result.fields?.zoneUIN)
    return {
      id: object.id,
      object,
      objectId: object.id,
      className: getClassLabel(object.class),
      name: object.name,
      ip: formatIpAddress(object.ipAddress),
      zone: Number.isFinite(zoneUin) ? (zoneNames.value.get(zoneUin) ?? String(zoneUin)) : '',
      fields: result.fields ?? {},
    }
  }),
)

const isTruncated = computed(() => rows.value.length >= RESULT_LIMIT)

const zoningEnabled = computed(() => zoneNames.value.size > 0)

/** Field names beyond the standard columns: only advanced queries assign such globals. */
const dynamicColumns = computed(() => {
  const names = new Set()
  for (const row of rows.value) {
    for (const name of Object.keys(row.fields)) {
      if (!CONSUMED_FIELDS.has(name)) names.add(name)
    }
  }
  return [...names].map((name) => ({
    id: `field:${name}`,
    field: name,
    label: name,
    sortable: true,
    width: 160,
    dynamic: true,
  }))
})

const columns = computed(() => [
  { id: 'objectId', field: 'objectId', label: 'ID', sortable: true, width: 80 },
  { id: 'className', field: 'className', label: 'Class', sortable: true, width: 140 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 260 },
  { id: 'ip', field: 'ip', label: 'IP Address', sortable: true, width: 140 },
  ...(zoningEnabled.value
    ? [{ id: 'zone', field: 'zone', label: 'Zone', sortable: true, width: 140 }]
    : []),
  ...dynamicColumns.value,
])

/** Dynamic columns live in the row's field map rather than on it. */
function cellValue(row, col) {
  return col.dynamic ? (row.fields[col.field] ?? '') : row[col.field]
}

const contextMenu = ref(null)

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  return [
    {
      label: 'Copy name',
      icon: 'pi pi-copy',
      disabled: !row?.name,
      command: () => navigator.clipboard.writeText(row.name),
    },
    {
      label: 'Copy IP address',
      icon: 'pi pi-copy',
      disabled: !row?.ip,
      command: () => navigator.clipboard.writeText(row.ip),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function applySavedQuery(query) {
  draft.value = { ...createModel(), script: query.script }
  advanced.value = true
  search()
}
</script>

<template>
  <div class="object-query-view">
    <div class="query-panel">
      <div class="panel-toolbar">
        <SelectButton
          :model-value="mode"
          :options="MODE_OPTIONS"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          @update:model-value="setMode"
        />
        <Button
          v-if="!advanced"
          label="Show as query"
          icon="pi pi-code"
          size="small"
          text
          severity="secondary"
          @click="toAdvanced"
        />
        <div class="toolbar-actions">
          <span v-if="hasQuery && !isFetching" class="item-count">
            {{ $plural(rows.length, 'object', 'objects') }}
            <template v-if="isTruncated"> (result limit reached)</template>
          </span>
          <Button
            v-tooltip.bottom="'Refresh'"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            rounded
            aria-label="Refresh"
            :disabled="!hasQuery"
            @click="refetch()"
          />
          <Button
            label="Search"
            icon="pi pi-search"
            size="small"
            :loading="isFetching"
            @click="search"
          />
        </div>
      </div>

      <ObjectQueryFilterForm v-if="!advanced" v-model="draft" @submit="search" />

      <div v-else class="advanced-panel">
        <NxslScriptEditor
          v-model="draft.script"
          hint-key="object-query"
          placeholder='type == NODE && name ilike "*core*"'
          show-compile
          :rows="8"
          class="query-editor"
        />
        <ObjectQuerySavedList :current-script="draft.script" @select="applySavedQuery" />
      </div>
    </div>

    <EmptyState
      v-if="!hasQuery"
      icon="pi pi-search"
      title="Find an object"
      message="Enter a search string, narrow by class, zone or IP range, then press Search. An empty filter would match every object, so nothing runs until you ask."
      class="query-prompt"
    />

    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :loading="isFetching && rows.length === 0"
      :error="error"
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="object-query"
      striped
      size="small"
      auto-width
      class="query-table"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch()"
    >
      <template #cell="{ col, row }">
        <AppLink v-if="col.id === 'name'" :to="objectTarget(row.object)" class="cell-link">{{
          row.name
        }}</AppLink>
        <span v-else>{{ cellValue(row, col) || 'n/a' }}</span>
      </template>

      <template #empty>No objects match this query.</template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.object-query-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  margin: -1rem;
}

.query-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.advanced-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  gap: 0.75rem;
  align-items: start;
}

@media (width <= 60rem) {
  .advanced-panel {
    grid-template-columns: 1fr;
  }
}

.query-editor {
  min-width: 0;
}

.query-table {
  flex: 1;
  min-height: 0;
}

.query-prompt {
  flex: 1;
}

.cell-link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}
</style>
