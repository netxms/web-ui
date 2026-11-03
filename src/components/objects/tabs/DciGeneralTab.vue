<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import DciMetricPickerDialog from '@/components/objects/DciMetricPickerDialog.vue'
import MibOidPickerDialog from '@/components/mibs/MibOidPickerDialog.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import { useDciFlags } from '@/composables/useDciFlags'
import { useObject, useObjectSnmpConfig } from '@/queries/useObjectQueries'
import { useMappingTables, useMappingTable } from '@/queries/useMappingTableQueries'
import { labelForRight } from '@/auth/systemRights'
import { notifyNotImplemented } from '@/utils/notImplemented'
import { dciDataTypeForMibType } from '@/utils/snmpOid'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  form: { type: Object, required: true },
  dciType: { type: String, default: 'item' },
  /** Node or template. */
  objectId: { type: Number, default: null },
  ownerObject: { type: Object, default: null },
})

const ORIGIN_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'agent', label: 'NetXMS Agent' },
  { value: 'snmp', label: 'SNMP' },
  { value: 'websvc', label: 'Web Service' },
  { value: 'push', label: 'Push' },
  { value: 'winperf', label: 'Windows Performance Counters' },
  { value: 'smclp', label: 'SM-CLP' },
  { value: 'script', label: 'Script' },
  { value: 'ssh', label: 'SSH' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'driver', label: 'Network Device Driver' },
  { value: 'modbus', label: 'Modbus' },
  { value: 'ethernetip', label: 'EtherNet/IP' },
  { value: 'cloud', label: 'Cloud Connector' },
  { value: 'otlp', label: 'OTLP' },
  { value: 'trafficobserver', label: 'Traffic Observer' },
  { value: 'netconf', label: 'NETCONF' },
  { value: 'computed', label: 'Computed' },
]

const DATA_TYPE_OPTIONS = [
  { value: 'int32', label: 'Integer (32-bit)' },
  { value: 'uint32', label: 'Unsigned Integer (32-bit)' },
  { value: 'int64', label: 'Integer (64-bit)' },
  { value: 'uint64', label: 'Unsigned Integer (64-bit)' },
  { value: 'float', label: 'Floating Point' },
  { value: 'string', label: 'String' },
  { value: 'counter32', label: 'Counter (32-bit)' },
  { value: 'counter64', label: 'Counter (64-bit)' },
  { value: 'null', label: 'Null' },
]

const MULTIPLIER_MODE_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Yes' },
  { value: 2, label: 'No' },
]

// Legacy General.DATA_UNITS; the field stays editable for custom units.
const DATA_UNITS = [
  '%',
  '°C',
  '°F',
  'A',
  'B (IEC)',
  'b (IEC)',
  'B (Metric)',
  'b (Metric)',
  'B/s',
  'b/s',
  'dBm',
  'Epoch time',
  'Hz',
  'J',
  'lm',
  'lx',
  'N',
  'Pa',
  'rpm',
  's',
  'T',
  'Uptime',
  'W',
  'V',
  'Ω',
]

const SCHEDULE_TYPE_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: 'custom', label: 'Custom interval' },
  { value: 'advanced', label: 'Advanced schedule' },
]

const RETENTION_TYPE_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: 'custom', label: 'Custom' },
  { value: 'none', label: 'Do not store' },
]

const SNMP_RAW_VALUE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'int32', label: '32-bit signed integer' },
  { value: 'uint32', label: '32-bit unsigned integer' },
  { value: 'int64', label: '64-bit signed integer' },
  { value: 'uint64', label: '64-bit unsigned integer' },
  { value: 'double', label: 'Floating point' },
  { value: 'ipAddr', label: 'IPv4 address' },
  { value: 'macAddr', label: 'MAC address' },
  { value: 'ip6Addr', label: 'IPv6 address' },
]

const SNMP_VERSION_OPTIONS = [
  { value: 1, label: 'SNMP v1' },
  { value: 2, label: 'SNMP v2c' },
  { value: 3, label: 'SNMP v3' },
]

const metricLabel = computed(() => {
  switch (props.form.origin) {
    case 'snmp':
      return 'OID'
    case 'winperf':
      return 'Counter'
    case 'script':
      return 'Script name'
    case 'ssh':
      return 'Command'
    case 'mqtt':
      return 'Topic'
    default:
      return 'Metric'
  }
})

// Pushed, OTLP and computed values are never polled: no source node or schedule (legacy).
const pollable = computed(() => !['push', 'otlp', 'computed'].includes(props.form.origin))

// Legacy reads these lists from the node over NXCP; the WebAPI has no route for them yet.
const NODE_LIST_ORIGINS = {
  trafficobserver: { label: 'Traffic observer metric list', tables: true },
  winperf: { label: 'Windows performance counter list', tables: false },
  smclp: { label: 'SM-CLP target list', tables: false },
}

const isTable = computed(() => props.dciType === 'table')

const metricPicker = computed(() => {
  const origin = props.form.origin
  if (origin === 'internal') return isTable.value ? 'internalTable' : 'internalMetric'
  if (origin === 'agent') return isTable.value ? 'agentTable' : 'agentMetric'
  // The server cannot collect a table from a device driver; legacy lists agent tables here.
  if (origin === 'driver') return isTable.value ? null : 'driverMetric'
  if (origin === 'script') return 'script'
  if (origin === 'websvc') return isTable.value ? null : 'webService'
  if (origin === 'otlp') return isTable.value ? null : 'otlp'
  if (origin === 'snmp') return 'mib'
  const pending = NODE_LIST_ORIGINS[origin]
  return pending && (pending.tables || !isTable.value) ? 'pending' : null
})

const listPickerVisible = ref(false)
const mibPickerVisible = ref(false)

// Legacy lists what the source node offers when one overrides the owner.
const { data: sourceNodeObject } = useObject(() =>
  pollable.value && props.form.sourceNode ? props.form.sourceNode : null,
)
const pickerObject = computed(() =>
  pollable.value && props.form.sourceNode ? (sourceNodeObject.value ?? null) : props.ownerObject,
)
// Separate from the object, which stays null for a source node the user cannot read: the list's
// own 403 then says why.
const pickerObjectId = computed(() =>
  pollable.value && props.form.sourceNode ? props.form.sourceNode : props.objectId,
)

function openMetricPicker() {
  if (metricPicker.value === 'pending') {
    notifyNotImplemented(NODE_LIST_ORIGINS[props.form.origin].label)
  } else if (metricPicker.value === 'mib') {
    mibPickerVisible.value = true
  } else {
    listPickerVisible.value = true
  }
}

function onMetricPicked({ name, description, dataType }) {
  props.form.name = name
  props.form.description = description
  if (!isTable.value && dataType) props.form.dataType = dataType
}

function onOidPicked(oid, mibNode) {
  props.form.name = oid
  if (!mibNode) return
  props.form.description = mibNode.name ?? props.form.description
  if (!isTable.value) props.form.dataType = dciDataTypeForMibType(mibNode.type)
}

const flags = useDciFlags(props.form)

// Instance discovery from a root DCI on the same object sets templateId to the owner.
const fromTemplate = computed(() => (props.form.templateId ?? 0) !== 0)
const fromInstanceDiscovery = computed(() => props.form.templateId === props.objectId)

// Templates have no SNMP agents to offer, so there the name is typed in free-form (legacy).
const { data: nodeSnmpConfig } = useObjectSnmpConfig(
  computed(() => (props.ownerObject?.class === 'Node' ? props.objectId : null)),
)

const snmpAgentOptions = computed(() => (nodeSnmpConfig.value?.agents ?? []).map((a) => a.name))

// An additional agent's configuration overrides the per-DCI port/version/context.
const useAdditionalSnmpAgent = computed(() => !!props.form.snmpAgentName?.trim())

// Listing mapping tables needs "Manage mapping tables" and reading one does not, so without
// the right the select is disabled but still shows the table (as in legacy).
const {
  data: mappingTables,
  isLoading: isLoadingMappingTables,
  error: mappingTablesError,
} = useMappingTables()
const mappingTablesRefused = computed(() => !!mappingTablesError.value)
const { data: currentMappingTable } = useMappingTable(
  computed(() => (mappingTablesRefused.value ? (props.form.mappingTableId ?? 0) : 0)),
)

const mappingTableOptions = computed(() => {
  const options = [{ value: 0, label: '(none)' }]
  const id = props.form.mappingTableId ?? 0
  if (mappingTablesRefused.value) {
    if (id > 0) options.push({ value: id, label: currentMappingTable.value?.name ?? `[${id}]` })
    return options
  }
  const tables = [...(mappingTables.value ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  for (const table of tables) options.push({ value: table.id, label: table.name })
  // A table deleted since the DCI was saved stays selected, by id, until it is changed.
  if (id > 0 && mappingTables.value && !tables.some((table) => table.id === id)) {
    options.push({ value: id, label: `[${id}]` })
  }
  return options
})

const mappingTablesHint = computed(() => {
  if (!mappingTablesRefused.value) return ''
  if (mappingTablesError.value?.status === 403) {
    return `Choosing a table requires the "${labelForRight('manageMappingTbls')}" system right.`
  }
  return 'Mapping tables could not be loaded.'
})

const useCustomSnmpPort = computed({
  get: () => props.form.snmpPort !== 0,
  set: (v) => {
    props.form.snmpPort = v ? props.form.snmpPort || 161 : 0
  },
})

const useCustomSnmpVersion = computed({
  get: () => props.form.snmpVersion !== 0,
  set: (v) => {
    props.form.snmpVersion = v ? props.form.snmpVersion || 2 : 0
  },
})
</script>

<template>
  <div class="general-tab">
    <div class="tab-cards-grid">
      <DetailCard title="Metric Source" :wide="true">
        <FormField label="Origin" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.origin"
            :options="ORIGIN_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="pollable" label="Source Node" group>
          <ObjectPickerField
            v-model="form.sourceNode"
            empty-label="(this object)"
            dialog-title="Select Proxy Node"
            class="form-input"
          />
        </FormField>
        <FormField :label="metricLabel" v-slot="{ id }">
          <div class="inline-fields">
            <InputText
              :id="id"
              v-model="form.name"
              class="form-input"
              placeholder="e.g. System.CPU.Usage"
            />
            <Button
              v-if="metricPicker"
              label="Select..."
              icon="pi pi-search"
              size="small"
              outlined
              severity="secondary"
              @click="openMetricPicker"
            />
          </div>
        </FormField>
        <FormField label="Description" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.description"
            class="form-input"
            placeholder="Human-readable display name"
          />
        </FormField>
        <FormField v-if="fromTemplate" label="Local Changes" group>
          <Checkbox
            v-model="flags.templateOverride.value"
            binary
            input-id="dci-template-override"
          />
          <label for="dci-template-override" class="checkbox-label">{{
            fromInstanceDiscovery
              ? 'Protect local changes from instance discovery updates'
              : 'Protect local changes from template updates (kept if removed from the template)'
          }}</label>
        </FormField>
      </DetailCard>

      <DetailCard v-if="dciType === 'item'" title="Data & Display">
        <FormField label="Data Type" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.dataType"
            :options="DATA_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField label="Unit" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.unitName"
            :options="DATA_UNITS"
            editable
            class="form-input"
            placeholder="e.g. %, B/s, ms"
          />
        </FormField>
        <FormField label="Use Multipliers" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="flags.multiplierMode.value"
            :options="MULTIPLIER_MODE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField label="Mapping Table" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.mappingTableId"
            :options="mappingTableOptions"
            option-label="label"
            option-value="value"
            :loading="isLoadingMappingTables"
            :disabled="mappingTablesRefused"
            filter
            class="form-input"
          />
        </FormField>
        <div v-if="mappingTablesHint" class="form-field">
          <span class="form-field__label" aria-hidden="true" />
          <span class="field-hint">{{ mappingTablesHint }}</span>
        </div>
      </DetailCard>

      <DetailCard title="Collection Schedule">
        <FormField label="Schedule" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.pollingScheduleType"
            :options="SCHEDULE_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="!pollable"
            class="form-input"
          />
        </FormField>
        <FormField v-if="form.pollingScheduleType === 'custom'" label="Interval" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.pollingInterval"
            :disabled="!pollable"
            class="form-input"
            placeholder="Seconds, e.g. 60"
          />
        </FormField>
        <div v-if="form.pollingScheduleType === 'advanced'" class="form-field">
          <!-- Spacer for the label column, so the hint lines up with the fields above. -->
          <span class="form-field__label" aria-hidden="true" />
          <span class="field-hint">Advanced schedules are managed server-side.</span>
        </div>
      </DetailCard>

      <DetailCard title="Data Retention">
        <FormField label="Retention" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.retentionType"
            :options="RETENTION_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>
        <FormField v-if="form.retentionType === 'custom'" label="Retention Time" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.retentionTime"
            class="form-input"
            placeholder="Days, e.g. 90"
          />
        </FormField>
        <template v-if="dciType === 'item'">
          <FormField label="Save Every" v-slot="{ id }">
            <InputNumber
              :input-id="id"
              v-model="form.sampleSaveInterval"
              class="form-input"
              :min="1"
              suffix=" sample(s)"
            />
          </FormField>
          <FormField label="Save Only Changed Values" v-slot="{ id }">
            <Checkbox :input-id="id" v-model="flags.storeChangesOnly.value" binary />
          </FormField>
        </template>
      </DetailCard>

      <!-- Shown regardless of origin, as in legacy. -->
      <DetailCard title="SNMP Settings">
        <template v-if="dciType === 'item'">
          <FormField label="Interpret Raw Value" group>
            <div class="inline-fields">
              <Checkbox v-model="flags.rawValueOctetString.value" binary input-id="snmp-octet" />
              <Select
                v-model="form.snmpRawValueType"
                :options="SNMP_RAW_VALUE_OPTIONS"
                option-label="label"
                option-value="value"
                class="form-input"
                :disabled="!flags.rawValueOctetString.value"
              />
            </div>
          </FormField>
          <FormField label="MIB Enum Values" group>
            <Checkbox
              v-model="flags.useSnmpMibEnum.value"
              binary
              input-id="snmp-mib-enum"
              :disabled="form.origin !== 'snmp'"
            />
            <label for="snmp-mib-enum" class="checkbox-label"
              >Use enum values from MIB for display</label
            >
          </FormField>
        </template>
        <FormField label="Additional SNMP Agent" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.snmpAgentName"
            :options="snmpAgentOptions"
            editable
            class="form-input"
            placeholder="(node's primary SNMP agent)"
          />
        </FormField>
        <FormField label="SNMP Port" group>
          <div class="inline-fields">
            <Checkbox
              v-model="useCustomSnmpPort"
              binary
              input-id="snmp-custom-port"
              :disabled="useAdditionalSnmpAgent"
            />
            <InputNumber
              v-model="form.snmpPort"
              class="form-input"
              :min="1"
              :max="65535"
              :disabled="useAdditionalSnmpAgent || !useCustomSnmpPort"
              placeholder="node default"
            />
          </div>
        </FormField>
        <FormField label="SNMP Version" group>
          <div class="inline-fields">
            <Checkbox
              v-model="useCustomSnmpVersion"
              binary
              input-id="snmp-custom-version"
              :disabled="useAdditionalSnmpAgent"
            />
            <Select
              v-model="form.snmpVersion"
              :options="SNMP_VERSION_OPTIONS"
              option-label="label"
              option-value="value"
              class="form-input"
              :disabled="useAdditionalSnmpAgent || !useCustomSnmpVersion"
            />
          </div>
        </FormField>
        <FormField label="Context" v-slot="{ id }">
          <InputText
            :id="id"
            v-model="form.snmpContext"
            class="form-input"
            placeholder="SNMP v3 context"
            :disabled="useAdditionalSnmpAgent"
          />
        </FormField>
      </DetailCard>

      <!-- Not gated by origin, as in legacy. -->
      <DetailCard v-if="dciType === 'item'" title="Windows Performance Counters">
        <FormField label="Sample Count" v-slot="{ id }">
          <InputNumber
            :input-id="id"
            v-model="form.sampleCount"
            class="form-input"
            :min="0"
            :max="65535"
            placeholder="0 to disable"
          />
        </FormField>
        <span class="field-hint field-hint--block"
          >Sample count for average value calculation (0 to disable).</span
        >
      </DetailCard>
    </div>

    <DciMetricPickerDialog
      v-if="metricPicker && metricPicker !== 'mib' && metricPicker !== 'pending'"
      v-model:visible="listPickerVisible"
      :kind="metricPicker"
      :object="pickerObject"
      :object-id="pickerObjectId"
      @select="onMetricPicked"
    />
    <MibOidPickerDialog
      v-model:visible="mibPickerVisible"
      :oid="form.origin === 'snmp' ? form.name : ''"
      walk
      @select="onOidPicked"
    />
  </div>
</template>

<style scoped>
.general-tab {
  flex: 1;
  overflow-y: auto;
  background: var(--p-surface-ground);
}

.tab-cards-grid {
  columns: 2;
  column-gap: 1rem;
  padding: 1.5rem;
}

.tab-cards-grid :deep(.detail-card) {
  break-inside: avoid;
  margin-bottom: 1rem;
}

.tab-cards-grid :deep(.detail-card--wide) {
  column-span: all;
}

.form-field {
  display: flex;
  /* Overrides `column` from the global .form-field in forms.css. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

/* `:deep` reaches the FormField label; bare `label` covers hand-rolled markup. */
.form-field label,
.form-field :deep(.form-field__label) {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 9rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.field-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.inline-fields {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.checkbox-label {
  width: auto !important;
  font-weight: normal !important;
  cursor: pointer;
}

.field-hint--block {
  display: block;
  padding: 0.5rem 0;
}
</style>
