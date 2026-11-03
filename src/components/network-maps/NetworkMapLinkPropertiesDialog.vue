<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import LinkDataSourceRow from './LinkDataSourceRow.vue'
import { useObjectChildren } from '@/queries/useObjectQueries'
import { useScriptLibrary } from '@/queries/useScriptQueries'
import { MAP_LINK_COLOR_SOURCES, editLinkDataSource } from '@/utils/networkMapAdapters'
import { buildRoutingOptions, LINK_STYLE_LABELS } from '@/utils/networkMapUtils'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Null when the dialog is closed. */
  link: { type: Object, default: null },
  map: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'apply'])

const COLOR_SOURCES = MAP_LINK_COLOR_SOURCES

/** Legacy label text, too long to sit in the input as a placeholder. */
const CONNECTOR_NAME_HINT = 'Leave empty to use the interface name when an interface is set'

const ROUTING_OPTIONS = buildRoutingOptions()
const STYLE_OPTIONS = LINK_STYLE_LABELS.map((label, value) => ({ label, value }))

const activeTab = ref('general')
const form = ref({})
const objectStatusList = ref([])
const dciList = ref([])

const endpoint1 = computed(() => props.map?.elements.find((e) => e.id === props.link?.from) ?? null)
const endpoint2 = computed(() => props.map?.elements.find((e) => e.id === props.link?.to) ?? null)

const { data: interfaces1 } = useObjectChildren(
  computed(() => endpoint1.value?.objectId ?? null),
  ['Interface'],
)
const { data: interfaces2 } = useObjectChildren(
  computed(() => endpoint2.value?.objectId ?? null),
  ['Interface'],
)

function interfaceOptions(list, currentId) {
  const options = [
    { label: 'None', value: 0 },
    ...(list ?? []).map((o) => ({ label: o.name, value: o.id })),
  ]
  if (currentId && !options.some((o) => o.value === currentId)) {
    options.push({ label: `Interface #${currentId}`, value: currentId })
  }
  return options
}

const interface1Options = computed(() => interfaceOptions(interfaces1.value, form.value.interface1))
const interface2Options = computed(() => interfaceOptions(interfaces2.value, form.value.interface2))

const { data: scriptLibrary } = useScriptLibrary()
const scriptOptions = computed(() => {
  const options = (scriptLibrary.value ?? []).map((s) => ({ label: s.name, value: s.name }))
  if (form.value.colorProvider && !options.some((o) => o.value === form.value.colorProvider)) {
    options.unshift({ label: form.value.colorProvider, value: form.value.colorProvider })
  }
  return options
})

const statusObjectPickerVisible = ref(false)

/** Resolved from the map's own elements, else the id. */
function statusObjectName(id) {
  const el = props.map?.elements.find((e) => e.type === 'object' && e.objectId === id)
  return el?.objectName || `Object #${id}`
}

function addStatusObject(node) {
  statusObjectPickerVisible.value = false
  if (node?.id && !objectStatusList.value.includes(node.id)) {
    objectStatusList.value = [...objectStatusList.value, node.id]
  }
}

function removeStatusObject(index) {
  objectStatusList.value = objectStatusList.value.filter((_, i) => i !== index)
}

const dciNodePickerVisible = ref(false)

function addDciFromNode(node) {
  dciNodePickerVisible.value = false
  if (!node?.id) return
  dciList.value = [
    ...dciList.value,
    {
      nodeId: node.id,
      dciId: null,
      type: 1,
      instance: '',
      column: '',
      formatString: '',
      system: false,
      location: 'CENTER',
      direction: 'NONE',
    },
  ]
}

function updateDciEntry(index, patch) {
  dciList.value = dciList.value.map((d, i) => (i === index ? editLinkDataSource(d, patch) : d))
}

function removeDciEntry(index) {
  dciList.value = dciList.value.filter((_, i) => i !== index)
}

function moveDciEntry(index, delta) {
  const target = index + delta
  if (target < 0 || target >= dciList.value.length) return
  const next = [...dciList.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  dciList.value = next
}

watch(
  () => [props.visible, props.link],
  () => {
    const link = props.link
    if (!props.visible || !link) return
    activeTab.value = 'general'
    form.value = {
      label: link.label ?? '',
      labelPosition: link.labelPosition ?? 50,
      connectorName1: link.connectorName1 ?? '',
      connectorName2: link.connectorName2 ?? '',
      interface1: link.interface1 ?? 0,
      interface2: link.interface2 ?? 0,
      routing: link.routing ?? 0,
      style: link.style ?? 0,
      width: link.width ?? 0,
      excludeFromAutoUpdate: link.excludeFromAutoUpdate ?? false,
      colorSource: link.colorSource ?? COLOR_SOURCES.DEFAULT,
      customColor: link.customColor ?? '#0000ff',
      colorProvider: link.colorProvider ?? '',
      useActiveThresholds: link.useActiveThresholds ?? false,
      useInterfaceUtilization: link.useInterfaceUtilization ?? false,
    }
    objectStatusList.value = [...(link.objectStatusList ?? [])]
    dciList.value = (link.dciList ?? []).map((d) => ({ ...d }))
  },
  { immediate: true },
)

function apply() {
  if (!props.link) return
  const patch = {
    label: form.value.label,
    connectorName1: form.value.connectorName1,
    connectorName2: form.value.connectorName2,
    interface1: form.value.interface1 ?? 0,
    interface2: form.value.interface2 ?? 0,
    routing: form.value.routing,
    style: form.value.style,
    width: form.value.width ?? 0,
    labelPosition: form.value.labelPosition ?? 50,
    excludeFromAutoUpdate: form.value.excludeFromAutoUpdate,
    colorSource: form.value.colorSource,
    useActiveThresholds: form.value.useActiveThresholds,
    useInterfaceUtilization: form.value.useInterfaceUtilization,
    objectStatusList: [...objectStatusList.value],
    dciList: dciList.value.filter((d) => d.dciId).map((d) => ({ ...d })),
  }
  if (form.value.colorSource === COLOR_SOURCES.CUSTOM) {
    patch.customColor = form.value.customColor
  }
  if (form.value.colorSource === COLOR_SOURCES.SCRIPT) {
    patch.colorProvider = form.value.colorProvider ?? ''
  }
  emit('apply', patch)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Link Properties"
    :modal="true"
    :closable="true"
    :style="{ width: '820px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <Tabs v-model:value="activeTab" class="link-props-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="color">Color</Tab>
        <Tab value="dataSources">Data Sources</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="link-props-form">
            <FormField label="Label" v-slot="{ id }">
              <InputText autofocus :id="id" v-model="form.label" size="small" class="full-width" />
            </FormField>
            <FormField label="Label position" v-slot="{ id }">
              <div class="label-position-row">
                <input
                  v-model.number="form.labelPosition"
                  type="range"
                  min="0"
                  max="100"
                  class="label-position-slider"
                />
                <InputNumber
                  :input-id="id"
                  v-model="form.labelPosition"
                  :min="0"
                  :max="100"
                  show-buttons
                  size="small"
                  class="label-position-number"
                />
              </div>
            </FormField>

            <div class="two-col">
              <fieldset class="connector-group">
                <legend :title="`Connector 1 — ${endpoint1?.objectName || 'unknown'}`">
                  Connector 1 — {{ endpoint1?.objectName || 'unknown' }}
                </legend>
                <FormField label="Name" v-slot="{ id }">
                  <InputText
                    :id="id"
                    v-model="form.connectorName1"
                    v-tooltip.top="CONNECTOR_NAME_HINT"
                    size="small"
                    class="full-width"
                    placeholder="Interface name"
                  />
                </FormField>
                <FormField label="Interface" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="form.interface1"
                    :options="interface1Options"
                    option-label="label"
                    option-value="value"
                    filter
                    size="small"
                    class="full-width"
                  />
                </FormField>
              </fieldset>

              <fieldset class="connector-group">
                <legend :title="`Connector 2 — ${endpoint2?.objectName || 'unknown'}`">
                  Connector 2 — {{ endpoint2?.objectName || 'unknown' }}
                </legend>
                <FormField label="Name" v-slot="{ id }">
                  <InputText
                    :id="id"
                    v-model="form.connectorName2"
                    v-tooltip.top="CONNECTOR_NAME_HINT"
                    size="small"
                    class="full-width"
                    placeholder="Interface name"
                  />
                </FormField>
                <FormField label="Interface" v-slot="{ id }">
                  <Select
                    :input-id="id"
                    v-model="form.interface2"
                    :options="interface2Options"
                    option-label="label"
                    option-value="value"
                    filter
                    size="small"
                    class="full-width"
                  />
                </FormField>
              </fieldset>
            </div>

            <div class="two-col">
              <FormField label="Routing algorithm" v-slot="{ id }">
                <Select
                  :input-id="id"
                  v-model="form.routing"
                  :options="ROUTING_OPTIONS"
                  option-label="label"
                  option-value="value"
                  size="small"
                  class="full-width"
                />
              </FormField>
              <FormField label="Line style" v-slot="{ id }">
                <Select
                  :input-id="id"
                  v-model="form.style"
                  :options="STYLE_OPTIONS"
                  option-label="label"
                  option-value="value"
                  size="small"
                  class="full-width"
                />
              </FormField>
            </div>
            <FormField label="Line width (0 for map default)" v-slot="{ id }">
              <div class="props-row">
                <InputNumber
                  :input-id="id"
                  v-model="form.width"
                  :min="0"
                  :max="100"
                  show-buttons
                  size="small"
                />
                <div class="prop-inline">
                  <Checkbox
                    v-model="form.excludeFromAutoUpdate"
                    input-id="link-exclude-auto"
                    :binary="true"
                  />
                  <label for="link-exclude-auto">Exclude from automatic updates</label>
                </div>
              </div>
            </FormField>
          </div>
        </TabPanel>

        <TabPanel value="color">
          <div class="link-props-form">
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-default"
                :value="COLOR_SOURCES.DEFAULT"
              />
              <label for="cs-default">Default color</label>
            </div>
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-iface"
                :value="COLOR_SOURCES.INTERFACE_STATUS"
              />
              <label for="cs-iface">Based on interface status</label>
            </div>
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-util"
                :value="COLOR_SOURCES.LINK_UTILIZATION"
              />
              <label for="cs-util">Based on interface utilization</label>
            </div>
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-object"
                :value="COLOR_SOURCES.OBJECT_STATUS"
              />
              <label for="cs-object">Based on object status</label>
            </div>
            <div class="color-source-detail">
              <div class="status-object-list">
                <div v-if="objectStatusList.length === 0" class="status-object-empty">
                  No status source objects
                </div>
                <div
                  v-for="(id, i) in objectStatusList"
                  :key="`${id}-${i}`"
                  class="status-object-row"
                >
                  <span class="status-object-name">{{ statusObjectName(id) }}</span>
                  <Button
                    aria-label="Remove status object"
                    icon="pi pi-times"
                    size="small"
                    text
                    severity="danger"
                    :disabled="form.colorSource !== COLOR_SOURCES.OBJECT_STATUS"
                    @click="removeStatusObject(i)"
                  />
                </div>
              </div>
              <Button
                label="Add..."
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                :disabled="form.colorSource !== COLOR_SOURCES.OBJECT_STATUS"
                @click="statusObjectPickerVisible = true"
              />
              <div class="prop-inline">
                <Checkbox
                  v-model="form.useActiveThresholds"
                  input-id="link-thresholds"
                  :binary="true"
                  :disabled="form.colorSource !== COLOR_SOURCES.OBJECT_STATUS"
                />
                <label for="link-thresholds">Include active thresholds into calculation</label>
              </div>
              <div class="prop-inline">
                <Checkbox
                  v-model="form.useInterfaceUtilization"
                  input-id="link-utilization"
                  :binary="true"
                  :disabled="form.colorSource !== COLOR_SOURCES.OBJECT_STATUS"
                />
                <label for="link-utilization">Include interface utilization into calculation</label>
              </div>
            </div>
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-script"
                :value="COLOR_SOURCES.SCRIPT"
              />
              <label for="cs-script">Script</label>
            </div>
            <div class="color-source-detail">
              <Select
                v-model="form.colorProvider"
                :options="scriptOptions"
                option-label="label"
                option-value="value"
                filter
                show-clear
                placeholder="Select script"
                size="small"
                class="full-width"
                :disabled="form.colorSource !== COLOR_SOURCES.SCRIPT"
              />
            </div>
            <div class="prop-inline">
              <RadioButton
                v-model="form.colorSource"
                input-id="cs-custom"
                :value="COLOR_SOURCES.CUSTOM"
              />
              <label for="cs-custom">Custom color</label>
            </div>
            <div class="color-source-detail prop-inline">
              <ColorPickerField
                v-model="form.customColor"
                :disabled="form.colorSource !== COLOR_SOURCES.CUSTOM"
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="dataSources">
          <div class="link-props-form">
            <div class="dci-list-header">
              <span class="dci-list-label">Data Collection Items</span>
              <Button
                label="Add DCI"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                @click="dciNodePickerVisible = true"
              />
            </div>
            <div v-if="dciList.length === 0" class="status-object-empty">
              No data sources configured — DCI values can be shown on the link label.
            </div>
            <div v-else>
              <LinkDataSourceRow
                v-for="(entry, i) in dciList"
                :key="`${entry.nodeId}-${entry.dciId}-${i}`"
                :entry="entry"
                :index="i"
                :count="dciList.length"
                :element1-name="endpoint1?.objectName ?? ''"
                :element2-name="endpoint2?.objectName ?? ''"
                @update="updateDciEntry(i, $event)"
                @remove="removeDciEntry(i)"
                @move="moveDciEntry(i, $event)"
              />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button label="Apply" @click="apply" />
    </template>
  </Dialog>

  <ObjectPickerDialog
    v-model:visible="statusObjectPickerVisible"
    title="Select Status Source Object"
    @select="addStatusObject"
  />

  <ObjectPickerDialog
    v-model:visible="dciNodePickerVisible"
    title="Select Node"
    @select="addDciFromNode"
  />
</template>

<style scoped>
.link-props-tabs {
  margin: 0 -1.25rem;
}

.link-props-tabs :deep(.p-tabpanels) {
  padding: 1rem 1.25rem 0.25rem;
}

.link-props-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 340px;
}

:deep(.link-props-form input) {
  max-width: 100%;
}

.full-width {
  width: 100%;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.two-col {
  display: grid;
  /* minmax(0,...) so a long connector legend cannot widen its column */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.875rem 1.25rem;
  align-items: start;
}

.props-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.label-position-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.label-position-slider {
  flex: 1;
  min-width: 0;
}

.label-position-number {
  width: 5.5rem;
  flex-shrink: 0;
}

.connector-group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.625rem 0.875rem 0.875rem;
  margin: 0;
  min-width: 0;
}

.connector-group legend {
  display: block;
  max-width: 100%;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0 0.375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.color-source-detail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-left: 1.75rem;
}

.color-source-detail.prop-inline {
  flex-direction: row;
}

.status-object-list {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  max-height: 9rem;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
}

.status-object-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.375rem 0;
}

.status-object-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.status-object-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dci-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dci-list-label {
  font-size: 0.8125rem;
  font-weight: 600;
}
</style>
