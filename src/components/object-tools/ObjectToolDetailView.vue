<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import RadioButton from 'primevue/radiobutton'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { useToast } from 'primevue/usetoast'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import ObjectToolInputFieldDialog from './ObjectToolInputFieldDialog.vue'
import ObjectToolColumnDialog from './ObjectToolColumnDialog.vue'
import AclPicker from '@/components/common/AclPicker.vue'
import IconPickerDialog from '@/components/icons/IconPickerDialog.vue'
import { ICON_CATALOG, ICON_MAP } from '@/components/icons/iconCatalog.js'
import MacroInputField from '@/components/common/MacroInputField.vue'
import { GLOBAL_MACROS, createInputFieldMacros } from '@/utils/macroDefinitions'
import { useCreateObjectTool, useUpdateObjectTool } from '@/queries/useObjectToolQueries'
import { useImageLibraryItem, useLibraryImageForIcon } from '@/queries/useImageLibraryQueries'
import { ICON_LIBRARY_CATEGORY } from '@/utils/iconSvg'
import {
  TOOL_TYPES,
  TABLE_TYPES,
  OUTPUT_TYPES,
  TCP_TUNNEL_TYPES,
  CONTAINER_CONTEXT_TYPES,
  MULTI_CLASS_TYPES,
  APPLICABLE_NODE,
  APPLICABLE_INTERFACE,
  APPLICABLE_SENSOR,
  APPLICABLE_ACCESS_POINT,
  FILTER_REQUIRES_SNMP,
  FILTER_REQUIRES_AGENT,
  FILTER_REQUIRES_OID_MATCH,
  FILTER_REQUIRES_NODE_OS_MATCH,
  FILTER_REQUIRES_TEMPLATE_MATCH,
  FILTER_REQUIRES_CUSTOM_ATTRIBUTE_MATCH,
  FILTER_REQUIRES_SSH,
  FILTER_REQUIRES_ETHERNET_IP,
  FILTER_REQUIRES_MODBUS_TCP,
  inputTypeLabel,
  columnFormatLabel,
  buildToolForm,
  buildToolPayload,
  parseToolData,
} from '@/utils/objectToolUtils'

const props = defineProps({
  tool: {
    type: Object,
    default: null,
  },
  /** The account may read tools but not change them: shown in full, with no way to save. */
  readonly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])

const toast = useToast()

const isNew = computed(() => props.tool === null)

const headerTitle = computed(() =>
  isNew.value ? 'New Object Tool' : (props.tool?.name ?? 'Object Tool'),
)

const form = ref(buildToolForm(props.tool))

watch(
  () => props.tool,
  (tool) => {
    form.value = buildToolForm(tool)
  },
  { deep: true },
)

function onTypeChange(newType) {
  form.value.dataFields = parseToolData(newType, '')
  form.value.flags.snmpIndexedByValue = false
  form.value.flags.setupTcpTunnel = false
  form.value.flags.generatesOutput = false
  form.value.flags.runInContainerContext = false
  form.value.flags.suppressSuccessMessage = false
  if (!MULTI_CLASS_TYPES.has(newType)) {
    form.value.applicableClasses = APPLICABLE_NODE
  }
}

const isDirty = computed(
  () => JSON.stringify(form.value) !== JSON.stringify(buildToolForm(props.tool)),
)

const showIconPicker = ref(false)
const isLucideIcon = computed(
  () => typeof form.value.icon === 'string' && form.value.icon.startsWith('lucide:'),
)
const lucideIconName = computed(() => (isLucideIcon.value ? form.value.icon.slice(7) : null))
const iconComponent = computed(() => (lucideIconName.value ? ICON_MAP[lucideIconName.value] : null))
const iconImageId = computed(() => (!isLucideIcon.value ? (form.value.icon ?? null) : null))
const { data: iconImage } = useImageLibraryItem(iconImageId)

const toolType = computed(() => form.value.type)
const hasColumns = computed(() => TABLE_TYPES.has(toolType.value))
const hasExecutionOptions = computed(() => OUTPUT_TYPES.has(toolType.value))
const hasTcpTunnel = computed(() => TCP_TUNNEL_TYPES.has(toolType.value))
const hasRunInContainer = computed(() => CONTAINER_CONTEXT_TYPES.has(toolType.value))
const isMultiClass = computed(() => MULTI_CLASS_TYPES.has(toolType.value))

const fullMacros = computed(() => [
  ...GLOBAL_MACROS,
  ...createInputFieldMacros(form.value.inputFields),
])
const confirmMacros = GLOBAL_MACROS

function getApplicableClass(bit) {
  return (form.value.applicableClasses & bit) !== 0
}

function setApplicableClass(bit, value) {
  if (value) {
    form.value.applicableClasses |= bit
  } else {
    form.value.applicableClasses &= ~bit
  }
}

function getFilterFlag(flag) {
  return (form.value.filter.flags & flag) !== 0
}

function setFilterFlag(flag, value) {
  if (value) {
    form.value.filter.flags |= flag
  } else {
    form.value.filter.flags &= ~flag
  }
}

const showInputFieldDialog = ref(false)
const editingInputField = ref(null)
const selectedInputField = ref(null)

const inputFieldExistingNames = computed(() => {
  const editingName = editingInputField.value?.name
  return form.value.inputFields.map((f) => f.name).filter((n) => n !== editingName)
})

function openAddInputField() {
  editingInputField.value = null
  showInputFieldDialog.value = true
}

function openEditInputField(field) {
  editingInputField.value = { ...field }
  showInputFieldDialog.value = true
}

function onInputFieldConfirm(field) {
  const idx = form.value.inputFields.findIndex((f) => f.name === editingInputField.value?.name)
  if (idx >= 0) {
    form.value.inputFields = form.value.inputFields.map((f, i) => (i === idx ? field : f))
  } else {
    form.value.inputFields = [...form.value.inputFields, field]
  }
  selectedInputField.value = null
}

function deleteInputField(field) {
  form.value.inputFields = form.value.inputFields.filter((f) => f.name !== field.name)
  if (selectedInputField.value?.name === field.name) selectedInputField.value = null
}

const showColumnDialog = ref(false)
const editingColumn = ref(null)
const selectedColumn = ref(null)

function openAddColumn() {
  editingColumn.value = null
  showColumnDialog.value = true
}

function openEditColumn(col) {
  editingColumn.value = { ...col }
  showColumnDialog.value = true
}

function onColumnConfirm(col) {
  const idx = form.value.columns.findIndex((c) => c.name === editingColumn.value?.name)
  if (idx >= 0) {
    form.value.columns = form.value.columns.map((c, i) => (i === idx ? col : c))
  } else {
    form.value.columns = [...form.value.columns, col]
  }
  selectedColumn.value = null
}

function deleteColumn(col) {
  form.value.columns = form.value.columns.filter((c) => c.name !== col.name)
  if (selectedColumn.value?.name === col.name) selectedColumn.value = null
}

const activeTab = ref('general')

const { mutate: createTool, isPending: isCreating } = useCreateObjectTool()
const { mutate: updateTool, isPending: isUpdating } = useUpdateObjectTool()
const { mutateAsync: libraryImageForIcon, isPending: isAddingIcon } = useLibraryImageForIcon()
const isSaving = computed(() => isCreating.value || isUpdating.value || isAddingIcon.value)

const ICON_LIBRARY_HINT = `Saving the tool adds the chosen icon to the image library ("${ICON_LIBRARY_CATEGORY}" category), where the legacy console finds it too.`

/**
 * The server stores a tool's icon as an image-library guid only and silently drops a `lucide:`
 * name, so a built-in icon is added to the library (or the existing copy reused) first.
 *
 * @returns {Promise<boolean>} false when the icon could not be added; the save stops there
 */
async function resolveIconForSave() {
  if (!isLucideIcon.value) return true
  const entry = ICON_CATALOG.flatMap((group) => group.icons).find(
    (icon) => icon.name === lucideIconName.value,
  )
  if (!entry) {
    form.value.icon = null
    return true
  }
  try {
    form.value.icon = await libraryImageForIcon({ name: entry.label, component: entry.component })
    return true
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Icon not saved',
      detail:
        err?.status === 403
          ? 'A standard icon is added to the image library when the tool is saved, which needs the "Manage image library" right. Choose one under Custom Images instead.'
          : (err?.message ?? 'Could not add the icon to the image library.'),
      life: 7000,
    })
    return false
  }
}

async function save() {
  if (!(await resolveIconForSave())) return
  const payload = buildToolPayload(form.value)
  if (isNew.value) {
    createTool(payload, {
      onSuccess: (result) => {
        toast.add({
          severity: 'success',
          summary: 'Created',
          detail: `Tool "${result.name}" created.`,
          life: 3000,
        })
        emit('close')
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Create Failed',
          detail: err.message ?? 'Failed to create tool.',
          life: 5000,
        })
      },
    })
  } else {
    updateTool(
      { toolId: props.tool.id, data: payload },
      {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Saved',
            detail: `Tool "${form.value.name}" saved.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Save Failed',
            detail: err.message ?? 'Failed to save tool.',
            life: 5000,
          })
        },
      },
    )
  }
}

function discard() {
  form.value = buildToolForm(props.tool)
}

const dataFieldLabel = computed(() => {
  switch (toolType.value) {
    case 'internal':
      return 'Operation'
    case 'action':
      return "Agent's command"
    case 'snmp-table':
      return 'Title'
    case 'agent-list':
      return 'Title'
    case 'agent-table':
      return 'Title'
    case 'url':
      return 'URL'
    case 'command':
      return 'Command'
    case 'server-command':
      return 'Command'
    case 'file-download':
      return 'Remote file name'
    case 'server-script':
      return 'Script'
    case 'ssh-command':
      return 'Command'
    default:
      return 'Data'
  }
})
</script>

<template>
  <div class="object-tool-detail">
    <EntityDetailHeader :title="headerTitle" subtitle="Object Tool" @back="emit('close')">
      <template v-if="!readonly" #actions>
        <Button
          label="Discard"
          icon="pi pi-times"
          size="small"
          severity="secondary"
          text
          :disabled="!isDirty || isSaving"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          size="small"
          severity="primary"
          :disabled="!isDirty || isSaving || !form.name"
          :loading="isSaving"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <Message v-if="readonly" severity="secondary" :closable="false" class="readonly-banner">
      You have read-only access to object tools, so this tool cannot be changed here.
    </Message>

    <Tabs v-model:value="activeTab" class="detail-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="filter">Filter</Tab>
        <Tab value="acl">Access Control</Tab>
        <Tab value="inputFields">Input Fields</Tab>
        <Tab v-if="hasColumns" value="columns">Columns</Tab>
      </TabList>

      <!-- As in EppRuleDetailView: one disabled fieldset, and the tab strip outside it so the tool
           can still be read through. -->
      <fieldset class="detail-form" :disabled="readonly">
        <TabPanels>
          <TabPanel value="general">
            <div class="detail-cards-grid">
              <DetailCard title="General" :wide="true">
                <div class="general-grid">
                  <div class="fields-top">
                    <div class="form-field">
                      <label for="t-name">Name <span class="required">*</span></label>
                      <InputText id="t-name" v-model="form.name" class="form-input" />
                    </div>
                    <div class="form-field">
                      <label for="t-desc">Description</label>
                      <Textarea
                        id="t-desc"
                        v-model="form.description"
                        class="form-input"
                        rows="2"
                        auto-resize
                      />
                    </div>
                  </div>

                  <div
                    class="icon-cell"
                    :class="{ 'icon-cell--empty': !iconComponent && !iconImage }"
                  >
                    <span class="icon-cell-label">Icon</span>
                    <button
                      class="icon-cell-picker"
                      type="button"
                      v-tooltip.bottom="form.icon ? 'Click to change icon' : 'Click to select icon'"
                      :aria-label="form.icon ? 'Change icon' : 'Select icon'"
                      @click="showIconPicker = true"
                    >
                      <component
                        v-if="iconComponent"
                        :is="iconComponent"
                        :size="32"
                        stroke-width="1.5"
                        class="icon-lucide"
                      />
                      <img
                        v-else-if="iconImage?.dataUrl"
                        :src="iconImage.dataUrl"
                        alt="Tool icon"
                        class="icon-img"
                      />
                      <i v-else class="pi pi-image icon-empty-glyph" />
                    </button>
                    <button
                      v-if="form.icon"
                      class="icon-clear-btn"
                      type="button"
                      v-tooltip.top="'Remove icon'"
                      @click.stop="form.icon = null"
                    >
                      <i class="pi pi-trash" />
                    </button>
                  </div>

                  <div class="form-field">
                    <label for="t-type">Type</label>
                    <Select
                      id="t-type"
                      v-model="form.type"
                      :disabled="readonly"
                      :options="TOOL_TYPES"
                      option-label="label"
                      option-value="value"
                      class="form-input"
                      @update:model-value="onTypeChange"
                    />
                  </div>

                  <div
                    v-if="
                      !['agent-list', 'agent-table', 'snmp-table', 'file-download'].includes(
                        toolType,
                      )
                    "
                    class="form-field"
                  >
                    <label :for="'t-data'">{{ dataFieldLabel }}</label>
                    <MacroInputField
                      id="t-data"
                      v-model="form.dataFields.data"
                      :macros="fullMacros"
                      class="form-input"
                    />
                  </div>

                  <div v-if="toolType === 'snmp-table'" class="form-field">
                    <label for="t-title-snmp">Title</label>
                    <InputText
                      id="t-title-snmp"
                      v-model="form.dataFields.title"
                      class="form-input"
                    />
                  </div>

                  <div v-if="toolType === 'file-download'" class="form-field">
                    <label for="t-remotefile">Remote file name</label>
                    <MacroInputField
                      id="t-remotefile"
                      v-model="form.dataFields.remoteFileName"
                      :macros="fullMacros"
                      class="form-input"
                    />
                  </div>

                  <template v-if="toolType === 'agent-list' || toolType === 'agent-table'">
                    <div class="form-field">
                      <label for="t-title">Title</label>
                      <MacroInputField
                        id="t-title"
                        v-model="form.dataFields.title"
                        :macros="fullMacros"
                        class="form-input"
                      />
                    </div>
                    <div class="form-field">
                      <label for="t-param">Parameter</label>
                      <MacroInputField
                        id="t-param"
                        v-model="form.dataFields.parameter"
                        :macros="fullMacros"
                        class="form-input"
                      />
                    </div>
                  </template>

                  <div v-if="toolType === 'agent-list'" class="form-field">
                    <label for="t-regexp">Regular expression</label>
                    <InputText id="t-regexp" v-model="form.dataFields.regexp" class="form-input" />
                  </div>
                </div>
              </DetailCard>

              <DetailCard v-if="toolType === 'snmp-table'" title="SNMP List Options">
                <div class="card-opts">
                  <div class="option-group">
                    <p class="option-group-label">
                      Use as index for second and subsequent columns:
                    </p>
                    <label class="radio-row">
                      <RadioButton
                        v-model="form.flags.snmpIndexedByValue"
                        :value="false"
                        input-id="snmp-index-oid"
                      />
                      <span>OID suffix of first column</span>
                    </label>
                    <label class="radio-row">
                      <RadioButton
                        v-model="form.flags.snmpIndexedByValue"
                        :value="true"
                        input-id="snmp-index-value"
                      />
                      <span>Value of first column</span>
                    </label>
                  </div>
                </div>
              </DetailCard>

              <DetailCard v-if="toolType === 'file-download'" title="File Options">
                <div class="card-opts">
                  <div class="form-field">
                    <label for="t-maxsize">Max download size (bytes, 0 = unlimited)</label>
                    <InputNumber
                      id="t-maxsize"
                      v-model="form.dataFields.maxSize"
                      :min="0"
                      class="form-input"
                    />
                  </div>
                  <label class="option-row">
                    <ToggleSwitch v-model="form.dataFields.followChanges" />
                    <span>Follow file changes</span>
                  </label>
                </div>
              </DetailCard>

              <DetailCard v-if="hasExecutionOptions" title="Execution Options">
                <div class="card-opts">
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.generatesOutput" />
                    <span>Command generates output</span>
                  </label>
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.suppressSuccessMessage" />
                    <span>Suppress notification of successful execution</span>
                  </label>
                </div>
              </DetailCard>

              <DetailCard v-if="hasTcpTunnel" title="TCP Tunnel">
                <div class="card-opts">
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.setupTcpTunnel" />
                    <span>Setup TCP tunnel to remote port</span>
                  </label>
                  <template v-if="form.flags.setupTcpTunnel">
                    <div class="form-field">
                      <label for="t-remoteport">Remote port</label>
                      <InputNumber
                        id="t-remoteport"
                        v-model="form.remotePort"
                        :min="1"
                        :max="65535"
                        class="form-input"
                      />
                    </div>
                    <div class="form-field">
                      <label for="t-remotehost">Remote host</label>
                      <InputText id="t-remotehost" v-model="form.remoteHost" class="form-input" />
                    </div>
                  </template>
                </div>
              </DetailCard>

              <DetailCard title="Confirmation">
                <div class="card-opts">
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.askConfirmation" />
                    <span>Require confirmation before execution</span>
                  </label>
                  <div v-if="form.flags.askConfirmation" class="form-field">
                    <label for="t-confirm-msg">Confirmation message</label>
                    <MacroInputField
                      id="t-confirm-msg"
                      v-model="form.confirmationMessage"
                      :macros="confirmMacros"
                      class="form-input"
                    />
                  </div>
                </div>
              </DetailCard>

              <DetailCard title="Show in Commands">
                <div class="card-opts">
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.showInCommands" />
                    <span>Show this tool in node commands</span>
                  </label>
                  <template v-if="form.flags.showInCommands">
                    <div class="form-field">
                      <label for="t-cmdname">Command name</label>
                      <InputText id="t-cmdname" v-model="form.commandName" class="form-input" />
                    </div>
                    <div class="form-field">
                      <label for="t-cmdshort">Short name</label>
                      <InputText
                        id="t-cmdshort"
                        v-model="form.commandShortName"
                        class="form-input"
                      />
                    </div>
                  </template>
                </div>
              </DetailCard>

              <DetailCard title="Other Options">
                <div class="card-opts">
                  <label class="option-row">
                    <ToggleSwitch v-model="form.flags.disabled" />
                    <span>Disabled</span>
                  </label>
                  <label v-if="hasRunInContainer" class="option-row">
                    <ToggleSwitch v-model="form.flags.runInContainerContext" />
                    <span>Run in container context</span>
                  </label>
                </div>
              </DetailCard>
            </div>
          </TabPanel>

          <TabPanel value="filter">
            <div class="detail-cards-grid">
              <DetailCard title="Applicable Object Types">
                <div class="applicable-types-row">
                  <label class="option-row">
                    <Checkbox
                      :model-value="getApplicableClass(APPLICABLE_NODE)"
                      :disabled="true"
                      binary
                      @update:model-value="setApplicableClass(APPLICABLE_NODE, $event)"
                    />
                    <span>Node</span>
                  </label>
                  <label class="option-row">
                    <Checkbox
                      :model-value="getApplicableClass(APPLICABLE_INTERFACE)"
                      :disabled="!isMultiClass"
                      binary
                      @update:model-value="setApplicableClass(APPLICABLE_INTERFACE, $event)"
                    />
                    <span>Interface</span>
                  </label>
                  <label class="option-row">
                    <Checkbox
                      :model-value="getApplicableClass(APPLICABLE_SENSOR)"
                      :disabled="!isMultiClass"
                      binary
                      @update:model-value="setApplicableClass(APPLICABLE_SENSOR, $event)"
                    />
                    <span>Sensor</span>
                  </label>
                  <label class="option-row">
                    <Checkbox
                      :model-value="getApplicableClass(APPLICABLE_ACCESS_POINT)"
                      :disabled="!isMultiClass"
                      binary
                      @update:model-value="setApplicableClass(APPLICABLE_ACCESS_POINT, $event)"
                    />
                    <span>Access Point</span>
                  </label>
                </div>
                <p v-if="!isMultiClass" class="help-text">
                  Only Node is selectable for this tool type. Interface, Sensor, and Access Point
                  are available for Server Script, URL, and SSH Command tools.
                </p>
              </DetailCard>

              <DetailCard title="Filter Conditions" :wide="true">
                <div class="filter-grid">
                  <label class="option-row">
                    <ToggleSwitch
                      :model-value="getFilterFlag(FILTER_REQUIRES_AGENT)"
                      @update:model-value="setFilterFlag(FILTER_REQUIRES_AGENT, $event)"
                    />
                    <span>NetXMS agent available</span>
                  </label>
                  <label class="option-row">
                    <ToggleSwitch
                      :model-value="getFilterFlag(FILTER_REQUIRES_SNMP)"
                      @update:model-value="setFilterFlag(FILTER_REQUIRES_SNMP, $event)"
                    />
                    <span>Node supports SNMP</span>
                  </label>
                  <label class="option-row">
                    <ToggleSwitch
                      :model-value="getFilterFlag(FILTER_REQUIRES_SSH)"
                      @update:model-value="setFilterFlag(FILTER_REQUIRES_SSH, $event)"
                    />
                    <span>Node supports SSH</span>
                  </label>
                  <label class="option-row">
                    <ToggleSwitch
                      :model-value="getFilterFlag(FILTER_REQUIRES_ETHERNET_IP)"
                      @update:model-value="setFilterFlag(FILTER_REQUIRES_ETHERNET_IP, $event)"
                    />
                    <span>Node supports EtherNet/IP</span>
                  </label>
                  <label class="option-row">
                    <ToggleSwitch
                      :model-value="getFilterFlag(FILTER_REQUIRES_MODBUS_TCP)"
                      @update:model-value="setFilterFlag(FILTER_REQUIRES_MODBUS_TCP, $event)"
                    />
                    <span>Node supports Modbus TCP</span>
                  </label>

                  <div class="filter-pattern-row">
                    <label class="option-row">
                      <ToggleSwitch
                        :model-value="getFilterFlag(FILTER_REQUIRES_OID_MATCH)"
                        @update:model-value="setFilterFlag(FILTER_REQUIRES_OID_MATCH, $event)"
                      />
                      <span>SNMP OID should match</span>
                    </label>
                    <InputText
                      v-if="getFilterFlag(FILTER_REQUIRES_OID_MATCH)"
                      v-model="form.filter.snmpOid"
                      placeholder="OID pattern"
                      class="pattern-input"
                    />
                  </div>

                  <div class="filter-pattern-row">
                    <label class="option-row">
                      <ToggleSwitch
                        :model-value="getFilterFlag(FILTER_REQUIRES_NODE_OS_MATCH)"
                        @update:model-value="setFilterFlag(FILTER_REQUIRES_NODE_OS_MATCH, $event)"
                      />
                      <span>Node platform name should match</span>
                    </label>
                    <InputText
                      v-if="getFilterFlag(FILTER_REQUIRES_NODE_OS_MATCH)"
                      v-model="form.filter.toolOS"
                      placeholder="Comma-separated regular expressions"
                      class="pattern-input"
                    />
                  </div>

                  <div class="filter-pattern-row">
                    <label class="option-row">
                      <ToggleSwitch
                        :model-value="getFilterFlag(FILTER_REQUIRES_TEMPLATE_MATCH)"
                        @update:model-value="setFilterFlag(FILTER_REQUIRES_TEMPLATE_MATCH, $event)"
                      />
                      <span>Template name should match</span>
                    </label>
                    <InputText
                      v-if="getFilterFlag(FILTER_REQUIRES_TEMPLATE_MATCH)"
                      v-model="form.filter.toolTemplate"
                      placeholder="Comma-separated patterns"
                      class="pattern-input"
                    />
                  </div>

                  <div class="filter-pattern-row">
                    <label class="option-row">
                      <ToggleSwitch
                        :model-value="getFilterFlag(FILTER_REQUIRES_CUSTOM_ATTRIBUTE_MATCH)"
                        @update:model-value="
                          setFilterFlag(FILTER_REQUIRES_CUSTOM_ATTRIBUTE_MATCH, $event)
                        "
                      />
                      <span>Custom attribute should match</span>
                    </label>
                    <InputText
                      v-if="getFilterFlag(FILTER_REQUIRES_CUSTOM_ATTRIBUTE_MATCH)"
                      v-model="form.filter.toolCustomAttributes"
                      placeholder="Comma-separated patterns"
                      class="pattern-input"
                    />
                  </div>
                </div>
              </DetailCard>
            </div>
          </TabPanel>

          <TabPanel value="acl">
            <div class="acl-tab-content">
              <AclPicker v-model="form.acl" />
            </div>
          </TabPanel>

          <TabPanel value="inputFields">
            <div class="tab-content tab-content--table">
              <div class="tab-toolbar">
                <span class="tab-toolbar-title">
                  Input Fields
                  <span class="count">({{ form.inputFields.length }})</span>
                </span>
                <div class="tab-toolbar-actions">
                  <Button
                    label="Add Field"
                    icon="pi pi-plus"
                    size="small"
                    severity="primary"
                    @click="openAddInputField"
                  />
                  <Button
                    label="Remove"
                    icon="pi pi-minus"
                    size="small"
                    severity="danger"
                    text
                    :disabled="!selectedInputField"
                    @click="deleteInputField(selectedInputField)"
                  />
                </div>
              </div>
              <DataTable
                v-model:selection="selectedInputField"
                :value="form.inputFields"
                selection-mode="single"
                data-key="name"
                class="list-table"
              >
                <template #empty>
                  <div class="table-empty">No input fields defined.</div>
                </template>
                <Column field="name" header="Name" :sortable="true" style="width: 160px" />
                <Column header="Type" style="width: 120px">
                  <template #body="{ data }">{{ inputTypeLabel(data.type) }}</template>
                </Column>
                <Column field="displayName" header="Display Name" :sortable="true" />
                <Column field="defaultValue" header="Default Value">
                  <template #body="{ data }">
                    <span :class="{ 'text-muted': !data.defaultValue }">
                      {{ data.defaultValue || '-' }}
                    </span>
                  </template>
                </Column>
                <Column style="width: 60px">
                  <template #body="{ data }">
                    <Button
                      :aria-label="`Edit input field ${data.name}`"
                      icon="pi pi-pencil"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      @click.stop="openEditInputField(data)"
                    />
                  </template>
                </Column>
              </DataTable>
            </div>
          </TabPanel>

          <TabPanel v-if="hasColumns" value="columns">
            <div class="tab-content tab-content--table">
              <div class="tab-toolbar">
                <span class="tab-toolbar-title">
                  Columns
                  <span class="count">({{ form.columns.length }})</span>
                </span>
                <div class="tab-toolbar-actions">
                  <Button
                    label="Add Column"
                    icon="pi pi-plus"
                    size="small"
                    severity="primary"
                    @click="openAddColumn"
                  />
                  <Button
                    label="Remove"
                    icon="pi pi-minus"
                    size="small"
                    severity="danger"
                    text
                    :disabled="!selectedColumn"
                    @click="deleteColumn(selectedColumn)"
                  />
                </div>
              </div>
              <DataTable
                v-model:selection="selectedColumn"
                :value="form.columns"
                selection-mode="single"
                data-key="name"
                class="list-table"
              >
                <template #empty>
                  <div class="table-empty">No columns defined.</div>
                </template>
                <Column field="name" header="Name" :sortable="true" style="width: 160px" />
                <Column v-if="toolType === 'snmp-table'" field="oid" header="OID" />
                <Column header="Format" style="width: 120px">
                  <template #body="{ data }">{{ columnFormatLabel(data.format) }}</template>
                </Column>
                <Column style="width: 60px">
                  <template #body="{ data }">
                    <Button
                      :aria-label="`Edit column ${data.name}`"
                      icon="pi pi-pencil"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      @click.stop="openEditColumn(data)"
                    />
                  </template>
                </Column>
              </DataTable>
            </div>
          </TabPanel>
        </TabPanels>
      </fieldset>
    </Tabs>

    <IconPickerDialog
      v-model:visible="showIconPicker"
      :model-value="form.icon"
      :size-filter="{ width: 128, height: 128 }"
      :icons-hint="ICON_LIBRARY_HINT"
      @select="form.icon = $event"
    />

    <ObjectToolInputFieldDialog
      v-model:visible="showInputFieldDialog"
      :field="editingInputField"
      :existing-names="inputFieldExistingNames"
      @confirm="onInputFieldConfirm"
    />

    <ObjectToolColumnDialog
      v-model:visible="showColumnDialog"
      :tool-type="toolType"
      :column="editingColumn"
      @confirm="onColumnConfirm"
    />
  </div>
</template>

<style scoped>
.object-tool-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.readonly-banner {
  margin: 0.75rem 1.5rem 0;
}

/* Carries the disabled state, not layout: it has to disappear from the flex chain between the tabs
   and their panels. `min-width: 0` because a fieldset's default is `min-content`. */
.detail-form {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-cards-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

.form-field {
  display: flex;
  /* The global .form-field in forms.css sets `column`. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

.form-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 10.5rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.required {
  color: var(--p-red-400);
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.35rem 0;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.option-row:last-child,
.option-row:last-of-type {
  border-bottom: none;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.option-group-label {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  cursor: pointer;
  font-size: 0.875rem;
}

.help-text {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
}

.applicable-types-row {
  display: flex;
  flex-wrap: wrap;
  padding-top: 0.25rem;
}

.applicable-types-row .option-row {
  border-bottom: none;
  padding-right: 1.5rem;
}

.card-opts {
  padding-top: 0.375rem;
}

.general-grid {
  display: grid;
  grid-template-columns: 1fr auto;
}

.fields-top {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}

.general-grid > .form-field {
  grid-column: 1 / -1;
}

.icon-cell {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: center;
  padding: 0.625rem 0.875rem 0.75rem;
  gap: 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  margin-left: 1rem;
  cursor: pointer;
  min-width: 88px;
  transition: border-color 0.15s;
}

.icon-cell:hover {
  border-color: var(--p-primary-color);
}

.icon-cell-picker {
  border: none;
  background: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-cell-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  align-self: flex-start;
}

.icon-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.icon-lucide {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-color);
}

.icon-empty-glyph {
  font-size: 1.5rem;
  color: var(--p-text-muted-color);
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-clear-btn {
  position: absolute;
  top: 6px;
  right: 7px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 0.5rem;
  color: var(--p-text-muted-color);
  transition:
    background 0.15s,
    border-color 0.15s;
}

.icon-clear-btn:hover {
  background: var(--p-surface-200);
  border-color: var(--p-text-color);
  color: var(--p-text-color);
}

/* Overrides the global form-field:last-child rule so Type gets a separator above it */
.fields-top .form-field:last-child {
  border-bottom: 1px solid var(--p-surface-border);
}

.filter-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.5rem;
  padding-bottom: 0.375rem;
}

.filter-pattern-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-bottom: 1px solid var(--p-surface-border);
  padding-bottom: 0.5rem;
}

.filter-pattern-row:first-of-type {
  border-top: 1px solid var(--p-surface-border);
}

.filter-pattern-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.filter-pattern-row .option-row {
  border-bottom: none;
  padding-bottom: 0;
}

.pattern-input {
  margin-left: 2.75rem;
  width: calc(100% - 2.75rem);
}

.tab-content--table {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.tab-toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.tab-toolbar-actions {
  display: flex;
  gap: 0.25rem;
}

.list-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.3rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.table-empty {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.acl-tab-content {
  flex: 1;
  display: flex;
  padding: 1rem;
  background: var(--p-surface-ground);
  min-height: 0;
  overflow: hidden;
}
</style>
