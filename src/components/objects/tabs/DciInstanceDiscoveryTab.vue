<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DetailCard from '@/components/layout/DetailCard.vue'
import NxslScriptEditor from '@/components/common/NxslScriptEditor.vue'
import MibOidPickerDialog from '@/components/mibs/MibOidPickerDialog.vue'
import DciMetricPickerDialog from '../DciMetricPickerDialog.vue'
import OtlpAttributeKeysDialog from '../OtlpAttributeKeysDialog.vue'
import { notifyNotImplemented } from '@/utils/notImplemented'
import {
  TABLE_DISCOVERY_METHODS,
  parseTableDiscoveryData,
  formatTableDiscoveryData,
  parseOtlpDiscoveryData,
  formatOtlpDiscoveryData,
  parseOtlpKeyList,
  defaultOtlpNameFormat,
} from '@/utils/instanceDiscoveryData'
import FormField from '@/components/common/FormField.vue'

/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  form: { type: Object, required: true },
  /** Node or template. */
  ownerObject: { type: Object, default: null },
})

const DISCOVERY_METHOD_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'agentList', label: 'Agent list' },
  { value: 'agentTable', label: 'Agent table' },
  { value: 'snmpWalkValues', label: 'SNMP walk values' },
  { value: 'snmpWalkOids', label: 'SNMP walk OIDs' },
  { value: 'script', label: 'Script' },
  { value: 'winperf', label: 'Windows Performance Counters' },
  { value: 'webService', label: 'Web service' },
  { value: 'internalTable', label: 'Internal table' },
  { value: 'smclpTargets', label: 'SM-CLP targets' },
  { value: 'smclpProperties', label: 'SM-CLP properties' },
  { value: 'push', label: 'Push' },
  { value: 'otlp', label: 'OTLP' },
]

// Legacy InstanceDiscovery.getDataLabel.
const DISCOVERY_DATA_LABELS = {
  agentList: 'List Name',
  agentTable: 'Table Name',
  internalTable: 'Table Name',
  snmpWalkValues: 'Base SNMP OID',
  snmpWalkOids: 'Base SNMP OID',
  script: 'Script Name',
  webService: 'Web Service Request',
  winperf: 'Object Name',
  smclpTargets: 'Target',
  smclpProperties: 'Target',
  push: 'Pattern',
  otlp: 'Metric Name Pattern',
}

const INSTANCE_RETENTION_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: 'custom', label: 'Custom' },
]

const discoveryEnabled = computed(() => props.form.instanceDiscoveryMethod !== 'none')

const discoveryDataLabel = computed(
  () => DISCOVERY_DATA_LABELS[props.form.instanceDiscoveryMethod] ?? 'Discovery Data',
)

// Table methods store `table:column` and OTLP `pattern;keys;format` in the one data string.
const isTableDiscovery = computed(() =>
  TABLE_DISCOVERY_METHODS.has(props.form.instanceDiscoveryMethod),
)
const isOtlpDiscovery = computed(() => props.form.instanceDiscoveryMethod === 'otlp')

function updateTableDiscovery(patch) {
  const parts = parseTableDiscoveryData(props.form.instanceDiscoveryData)
  props.form.instanceDiscoveryData = formatTableDiscoveryData({ ...parts, ...patch })
}

function updateOtlpDiscovery(patch) {
  const parts = parseOtlpDiscoveryData(props.form.instanceDiscoveryData)
  props.form.instanceDiscoveryData = formatOtlpDiscoveryData({ ...parts, ...patch })
}

const discoverySource = computed({
  get: () => {
    const data = props.form.instanceDiscoveryData ?? ''
    if (isTableDiscovery.value) return parseTableDiscoveryData(data).table
    if (isOtlpDiscovery.value) return parseOtlpDiscoveryData(data).pattern
    return data
  },
  set: (value) => {
    if (isTableDiscovery.value) updateTableDiscovery({ table: value })
    else if (isOtlpDiscovery.value) updateOtlpDiscovery({ pattern: value })
    else props.form.instanceDiscoveryData = value
  },
})

const tableInstanceColumn = computed({
  get: () => parseTableDiscoveryData(props.form.instanceDiscoveryData).column,
  set: (column) => updateTableDiscovery({ column }),
})

const otlpKeyAttributes = computed({
  get: () => parseOtlpDiscoveryData(props.form.instanceDiscoveryData).keys,
  set: (keys) => updateOtlpDiscovery({ keys }),
})

const otlpNameFormat = computed({
  get: () => parseOtlpDiscoveryData(props.form.instanceDiscoveryData).format,
  set: (format) => updateOtlpDiscovery({ format }),
})

// Legacy reads these lists from the node over NXCP; no WebAPI route yet.
const PENDING_DISCOVERY_PICKERS = {
  agentList: 'Agent list selection',
  agentTable: 'Agent table selection',
}

const discoveryPicker = computed(() => {
  const method = props.form.instanceDiscoveryMethod
  if (['internalTable', 'script', 'webService', 'otlp'].includes(method)) return method
  if (method === 'snmpWalkValues' || method === 'snmpWalkOids') return 'mib'
  return PENDING_DISCOVERY_PICKERS[method] ? 'pending' : null
})

const discoveryListPickerVisible = ref(false)
const discoveryMibPickerVisible = ref(false)

function openDiscoveryPicker() {
  if (discoveryPicker.value === 'pending') {
    notifyNotImplemented(PENDING_DISCOVERY_PICKERS[props.form.instanceDiscoveryMethod])
  } else if (discoveryPicker.value === 'mib') {
    discoveryMibPickerVisible.value = true
  } else {
    discoveryListPickerVisible.value = true
  }
}

// OTLP: after the metric, legacy asks which of its attribute keys identify an instance.
const otlpKeysDialog = ref({ visible: false, metricName: '', keys: [], initial: [] })

function onDiscoverySourcePicked({ name, instanceColumn, attributeKeys }) {
  if (isTableDiscovery.value) {
    updateTableDiscovery(instanceColumn ? { table: name, column: instanceColumn } : { table: name })
  } else if (isOtlpDiscovery.value) {
    updateOtlpDiscovery({ pattern: name })
    if (attributeKeys?.length) {
      otlpKeysDialog.value = {
        visible: true,
        metricName: name,
        keys: attributeKeys,
        initial: parseOtlpKeyList(otlpKeyAttributes.value),
      }
    }
  } else {
    props.form.instanceDiscoveryData = name
  }
}

function onOtlpKeysPicked(keys) {
  const patch = { keys: keys.join(',') }
  if (keys.length && !otlpNameFormat.value.trim()) patch.format = defaultOtlpNameFormat(keys)
  updateOtlpDiscovery(patch)
}

// -1 is the server default (DataCollection.InstanceRetentionTime); 0 drops a vanished instance
// at the next discovery poll.
const customInstanceRetention = computed(() => (props.form.instanceRetentionTime ?? -1) >= 0)

function setInstanceRetentionMode(mode) {
  if (mode === 'custom') {
    if (!customInstanceRetention.value) props.form.instanceRetentionTime = 7
  } else {
    props.form.instanceRetentionTime = -1
  }
}
</script>

<template>
  <div class="instance-discovery-tab">
    <div class="tab-cards-grid">
      <DetailCard title="Discovery" wide>
        <FormField label="Method" v-slot="{ id }">
          <Select
            :input-id="id"
            v-model="form.instanceDiscoveryMethod"
            :options="DISCOVERY_METHOD_OPTIONS"
            option-label="label"
            option-value="value"
            class="form-input"
          />
        </FormField>

        <template v-if="discoveryEnabled">
          <FormField :label="discoveryDataLabel" v-slot="{ id }">
            <div class="inline-fields">
              <InputText :id="id" v-model="discoverySource" class="form-input" />
              <Button
                v-if="discoveryPicker"
                label="Select..."
                icon="pi pi-search"
                size="small"
                outlined
                severity="secondary"
                @click="openDiscoveryPicker"
              />
            </div>
          </FormField>
          <FormField v-if="isTableDiscovery" label="Instance Column" v-slot="{ id }">
            <InputText
              :id="id"
              v-model="tableInstanceColumn"
              class="form-input"
              placeholder="Column holding the instance, e.g. NAME"
            />
          </FormField>
          <template v-if="isOtlpDiscovery">
            <FormField label="Instance Key Attributes" v-slot="{ id }">
              <InputText
                :id="id"
                v-model="otlpKeyAttributes"
                class="form-input"
                placeholder="Comma-separated attribute keys"
              />
            </FormField>
            <FormField label="Instance Name Format" v-slot="{ id }">
              <InputText
                :id="id"
                v-model="otlpNameFormat"
                class="form-input"
                placeholder="Optional, e.g. %{host.name}:%{device}"
              />
            </FormField>
          </template>
          <FormField label="Instance Retention" group>
            <div class="inline-fields">
              <Select
                :model-value="customInstanceRetention ? 'custom' : 'default'"
                :options="INSTANCE_RETENTION_OPTIONS"
                option-label="label"
                option-value="value"
                class="form-input-md"
                @update:model-value="setInstanceRetentionMode"
              />
              <InputNumber
                v-if="customInstanceRetention"
                v-model="form.instanceRetentionTime"
                :min="0"
                :allow-empty="false"
                class="form-input-sm"
                suffix=" days"
              />
            </div>
          </FormField>
        </template>
      </DetailCard>

      <DetailCard v-if="discoveryEnabled" title="Instance Filter" wide>
        <FormField label="Filter Script" group class="form-field--full">
          <NxslScriptEditor
            v-model="form.instanceFilter"
            hint-key="dci-instance-filter"
            show-compile
            :rows="5"
            class="form-input"
          />
        </FormField>
      </DetailCard>
    </div>

    <DciMetricPickerDialog
      v-if="discoveryPicker && discoveryPicker !== 'mib' && discoveryPicker !== 'pending'"
      v-model:visible="discoveryListPickerVisible"
      :kind="discoveryPicker"
      :object="ownerObject"
      @select="onDiscoverySourcePicked"
    />
    <OtlpAttributeKeysDialog
      v-model:visible="otlpKeysDialog.visible"
      :metric-name="otlpKeysDialog.metricName"
      :keys="otlpKeysDialog.keys"
      :initial="otlpKeysDialog.initial"
      @select="onOtlpKeysPicked"
    />
    <MibOidPickerDialog
      v-model:visible="discoveryMibPickerVisible"
      :oid="discoveryPicker === 'mib' ? discoverySource : ''"
      header="Select Base OID"
      walk
      @select="(oid) => (form.instanceDiscoveryData = oid)"
    />
  </div>
</template>

<style scoped>
.instance-discovery-tab {
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

.form-field--full {
  align-items: flex-start;
  padding-top: 0.75rem;
}

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

.form-input-sm {
  width: 8rem;
}

.form-input-md {
  width: 12rem;
}

.inline-fields {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}
</style>
