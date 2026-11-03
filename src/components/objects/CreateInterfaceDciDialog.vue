<script setup>
// Each interface's DCIs go on its node; the choices are remembered per user, as in legacy.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useQueryClient } from '@tanstack/vue-query'
import FormField from '@/components/common/FormField.vue'
import { createDci } from '@/api/dciConfigApi'
import { adaptObject } from '@/api/objectAdapters'
import { getObject } from '@/api/objectsApi'
import { dciConfigKeys } from '@/queries/useDciConfigQueries'
import { objectKeys } from '@/queries/useObjectQueries'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import {
  buildInterfaceDcis,
  IF_NAME_PLACEHOLDER,
  INTERFACE_DCI_METRICS,
} from '@/utils/interfaceDci'
import { notify } from '@/utils/notify'
import { userPrefs } from '@/utils/appStorage'

const props = defineProps({
  visible: { type: Boolean, required: true },
  /** Tree rows are fine; full documents are fetched. */
  interfaces: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible'])

const PREFS_KEY = 'interfaceDciDialog'

const SCHEDULE_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: 'custom', label: 'Custom interval' },
]

const RETENTION_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: 'custom', label: 'Custom' },
  { value: 'none', label: 'Do not store' },
]

const rows = ref([])
const pollingScheduleType = ref('default')
const pollingInterval = ref(60)
const retentionType = ref('default')
const retentionTime = ref(30)
const isCreating = ref(false)

const single = computed(() => (props.interfaces.length === 1 ? props.interfaces[0] : null))

// With several interfaces the description keeps the placeholder, replaced per interface.
function descriptionFor(metric) {
  return single.value
    ? metric.description.replaceAll(IF_NAME_PLACEHOLDER, single.value.name ?? '')
    : metric.description
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    const saved = userPrefs.get(PREFS_KEY, {}) ?? {}
    rows.value = INTERFACE_DCI_METRICS.map((metric) => ({
      metric,
      enabled: saved.enabled?.[metric.id] ?? metric.enabledByDefault,
      delta: saved.delta?.[metric.id] ?? true,
      description: descriptionFor(metric),
    }))
    pollingScheduleType.value = saved.pollingScheduleType ?? 'default'
    pollingInterval.value = saved.pollingInterval ?? 60
    retentionType.value = saved.retentionType ?? 'default'
    retentionTime.value = saved.retentionTime ?? 30
  },
  { immediate: true },
)

const enabledRows = computed(() => rows.value.filter((row) => row.enabled))

const canSubmit = computed(
  () =>
    enabledRows.value.length > 0 &&
    (pollingScheduleType.value !== 'custom' || pollingInterval.value >= 2) &&
    (retentionType.value !== 'custom' || retentionTime.value >= 1),
)

function savePrefs() {
  userPrefs.set(PREFS_KEY, {
    enabled: Object.fromEntries(rows.value.map((row) => [row.metric.id, row.enabled])),
    delta: Object.fromEntries(rows.value.map((row) => [row.metric.id, row.delta])),
    pollingScheduleType: pollingScheduleType.value,
    pollingInterval: pollingInterval.value,
    retentionType: retentionType.value,
    retentionTime: retentionTime.value,
  })
}

const queryClient = useQueryClient()

async function fetchObject(id) {
  const raw = await queryClient.fetchQuery({
    queryKey: objectKeys.detail(id),
    queryFn: () => getObject(id),
    staleTime: 60_000,
  })
  return adaptObject(raw)
}

// Index, ifTable suffix and parents are not on a tree row.
async function resolveTarget(iface) {
  const full =
    iface.index !== undefined && iface.parents?.length ? iface : await fetchObject(iface.id)
  for (const parentId of full.parents ?? []) {
    const parent = await fetchObject(parentId)
    if (parent?.class === 'Node') return { iface: full, node: parent }
  }
  return { iface: full, node: null }
}

async function onCreate() {
  savePrefs()
  isCreating.value = true

  const choices = enabledRows.value.map((row) => ({
    metricId: row.metric.id,
    delta: row.delta,
    description: row.description,
  }))
  const schedule = {
    pollingScheduleType: pollingScheduleType.value,
    pollingInterval: pollingInterval.value,
    retentionType: retentionType.value,
    retentionTime: retentionTime.value,
  }

  // Settled per interface: one failure must not stop the rest.
  const outcomes = await mapConcurrent(
    props.interfaces,
    async (target) => {
      try {
        const { iface, node } = await resolveTarget(target)
        if (!node) return { name: target.name, error: 'Interface is not on a node' }
        const payloads = buildInterfaceDcis({ iface, node, choices, schedule })
        for (const payload of payloads) await createDci(node.id, payload)
        queryClient.invalidateQueries({ queryKey: dciConfigKeys.all(node.id) })
        return { name: target.name, created: payloads.length }
      } catch (err) {
        return { name: target.name, error: err?.message, status: err?.status }
      }
    },
    4,
  )

  isCreating.value = false
  report(outcomes)
  if (outcomes.some((outcome) => outcome.created)) emit('update:visible', false)
}

function report(outcomes) {
  const done = outcomes.filter((outcome) => outcome.created)
  const created = done.reduce((total, outcome) => total + outcome.created, 0)
  if (done.length > 0) {
    notify({
      summary: created === 1 ? 'DCI created' : `${created} DCIs created`,
      detail: done.length === 1 ? done[0].name : `On ${done.length} interfaces`,
    })
  }

  // 403 is already toasted by api/client.js.
  const failed = outcomes.filter((outcome) => outcome.error !== undefined && outcome.status !== 403)
  if (failed.length > 0) {
    notify({
      severity: 'error',
      summary:
        failed.length === 1
          ? 'Could not create interface DCIs'
          : `Could not create DCIs for ${failed.length} interfaces`,
      detail:
        failed.length === 1
          ? `${failed[0].name}: ${failed[0].error ?? 'unknown error'}`
          : failed.map((outcome) => outcome.name).join(', '),
      life: 6000,
    })
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Create Interface DCIs"
    modal
    :style="{ width: '760px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="iface-dci-body">
      <p class="iface-dci-hint">
        <template v-if="single">
          Create data collection items for <strong>{{ single.name }}</strong> on its node.
        </template>
        <template v-else>
          Create data collection items for <strong>{{ interfaces.length }} interfaces</strong> on
          their nodes. <code>{{ IF_NAME_PLACEHOLDER }}</code> in a description is replaced with each
          interface's name.
        </template>
      </p>

      <fieldset class="form-fieldset">
        <legend>Data</legend>
        <div class="iface-dci-grid" role="group" aria-label="Metrics">
          <span class="iface-dci-head">Metric</span>
          <span class="iface-dci-head">Description</span>
          <span class="iface-dci-head">Average per second</span>
          <template v-for="row in rows" :key="row.metric.id">
            <label class="iface-dci-metric">
              <Checkbox v-model="row.enabled" binary />
              <span>{{ row.metric.label }}</span>
            </label>
            <InputText
              v-model="row.description"
              :disabled="!row.enabled"
              :aria-label="`${row.metric.label} description`"
              size="small"
              class="iface-dci-description"
            />
            <span class="iface-dci-delta">
              <Checkbox
                v-model="row.delta"
                binary
                :disabled="!row.enabled"
                :aria-label="`${row.metric.label} as average per second`"
              />
            </span>
          </template>
        </div>
      </fieldset>

      <fieldset class="form-fieldset">
        <legend>Options</legend>
        <div class="iface-dci-options">
          <FormField label="Polling" v-slot="{ id }">
            <Select
              :input-id="id"
              v-model="pollingScheduleType"
              :options="SCHEDULE_OPTIONS"
              option-label="label"
              option-value="value"
            />
          </FormField>
          <FormField
            v-if="pollingScheduleType === 'custom'"
            label="Interval (seconds)"
            v-slot="{ id }"
          >
            <InputNumber :input-id="id" v-model="pollingInterval" :min="2" :max="10000" />
          </FormField>
          <FormField label="Retention" v-slot="{ id }">
            <Select
              :input-id="id"
              v-model="retentionType"
              :options="RETENTION_OPTIONS"
              option-label="label"
              option-value="value"
            />
          </FormField>
          <FormField v-if="retentionType === 'custom'" label="Retention (days)" v-slot="{ id }">
            <InputNumber :input-id="id" v-model="retentionTime" :min="1" :max="10000" />
          </FormField>
        </div>
      </fieldset>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button
        label="Create"
        icon="pi pi-plus"
        :disabled="!canSubmit"
        :loading="isCreating"
        @click="onCreate"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.iface-dci-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.iface-dci-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.iface-dci-grid {
  display: grid;
  grid-template-columns: max-content 1fr max-content;
  align-items: center;
  gap: 0.375rem 0.75rem;
}

.iface-dci-head {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.iface-dci-metric {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  cursor: pointer;
  user-select: none;
}

.iface-dci-description {
  width: 100%;
}

.iface-dci-delta {
  display: flex;
  justify-content: center;
}

.iface-dci-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
</style>
