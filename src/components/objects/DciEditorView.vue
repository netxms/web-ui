<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DciSourceBanner from './DciSourceBanner.vue'
import DciGeneralTab from './tabs/DciGeneralTab.vue'
import DciProcessingTab from './tabs/DciProcessingTab.vue'
import DciInstanceDiscoveryTab from './tabs/DciInstanceDiscoveryTab.vue'
import DciPerformanceViewTab from './tabs/DciPerformanceViewTab.vue'
import DciOtherOptionsTab from './tabs/DciOtherOptionsTab.vue'
import DciTagsTab from './tabs/DciTagsTab.vue'
import DciAccessControlTab from './tabs/DciAccessControlTab.vue'
import { useDciConfig, useCreateDci, useUpdateDci } from '@/queries/useDciConfigQueries'

const props = defineProps({
  objectId: { type: Number, required: true },
  dciId: { type: [Number, null], default: null },
  ownerObject: { type: Object, default: null },
  initialTab: { type: String, default: 'general' },
})

const VALID_TABS = new Set([
  'general',
  'processing',
  'instanceDiscovery',
  'performance',
  'otherOptions',
  'tags',
  'access',
])

const emit = defineEmits(['back', 'created'])

const isCreate = computed(() => props.dciId === null)

const {
  data: configData,
  isLoading,
  error: loadError,
  isFetching: isRefetchingConfig,
  refetch: refetchConfig,
} = useDciConfig(
  computed(() => props.objectId),
  computed(() => props.dciId),
)

function emptyForm() {
  return {
    type: 'item',
    name: '',
    description: '',
    origin: 'agent',
    status: 'active',
    dataType: 'int32',
    transformedDataType: 'int32',
    deltaCalculation: 'none',
    pollingScheduleType: 'default',
    pollingInterval: '',
    retentionType: 'default',
    retentionTime: '',
    unitName: '',
    multiplier: 0,
    sampleCount: 0,
    sampleSaveInterval: 1,
    flags: 0,
    resourceId: 0,
    systemTag: '',
    userTag: '',
    comments: '',
    transformationScript: '',
    sourceNode: 0,
    snmpPort: 0,
    snmpVersion: 0,
    snmpContext: '',
    snmpAgentName: '',
    snmpRawValueType: 'none',
    mappingTableId: 0,
    predictionEngine: '',
    allThresholdsRearmEvent: 0,
    aiHint: '',
    aggregationDisabled: false,
    instanceDiscoveryMethod: 'none',
    instanceDiscoveryData: '',
    instanceFilter: '',
    instanceName: '',
    // -1: the server-wide default (0 would drop vanished instances immediately)
    instanceRetentionTime: -1,
    perfTabSettings: '',
    accessList: [],
    thresholds: [],
    columns: [],
    hourlyRetention: 0,
    dailyRetention: 0,
  }
}

function buildForm(config) {
  if (!config) return emptyForm()
  return JSON.parse(JSON.stringify(config))
}

const original = ref(null)
const form = ref(emptyForm())

watch(
  configData,
  (cfg) => {
    if (cfg) {
      original.value = cfg
      form.value = buildForm(cfg)
    }
  },
  { immediate: true },
)

const isDirty = computed(() => {
  if (isCreate.value) return true
  return JSON.stringify(form.value) !== JSON.stringify(original.value)
})

const activeTab = ref(VALID_TABS.has(props.initialTab) ? props.initialTab : 'general')
const saveError = ref(null)
const isSaving = ref(false)

const createDci = useCreateDci()
const updateDci = useUpdateDci()

async function save() {
  saveError.value = null
  isSaving.value = true
  try {
    if (isCreate.value) {
      const created = await createDci.mutateAsync({ objectId: props.objectId, data: form.value })
      emit('created', created)
    } else {
      const updated = await updateDci.mutateAsync({
        objectId: props.objectId,
        dciId: props.dciId,
        data: form.value,
      })
      original.value = updated
      form.value = buildForm(updated)
    }
  } catch (err) {
    saveError.value = err?.message ?? 'Save failed'
  } finally {
    isSaving.value = false
  }
}

function discard() {
  if (isCreate.value) {
    emit('back')
  } else {
    form.value = buildForm(original.value)
  }
}

const dciType = computed(() => form.value.type ?? 'item')

// A deep link to the Performance tab may land on a table DCI, which has none.
watch(dciType, (type) => {
  if (activeTab.value === 'performance' && type !== 'item') activeTab.value = 'general'
})
</script>

<template>
  <div class="dci-editor">
    <EntityDetailHeader
      :title="isCreate ? 'New Data Collection Item' : form.description || form.name || 'Edit DCI'"
      subtitle="DCI Configuration"
      @back="emit('back')"
    >
      <template #actions>
        <Button
          label="Discard"
          size="small"
          severity="secondary"
          text
          :disabled="isSaving || (!isCreate && !isDirty)"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          size="small"
          severity="primary"
          :disabled="isSaving || (!isCreate && !isDirty)"
          :loading="isSaving"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <MutationErrorState :error="saveError" class="save-error" />

    <DciSourceBanner
      v-if="!isCreate && original && ownerObject"
      :dci="original"
      :owner-object="ownerObject"
      class="source-banner"
    />

    <div v-if="isLoading && !isCreate" class="editor-loading">
      <Skeleton height="2rem" width="40%" class="mb-3" />
      <Skeleton height="1rem" width="70%" class="mb-2" />
      <Skeleton height="1rem" width="60%" class="mb-2" />
      <Skeleton height="1rem" width="55%" class="mb-2" />
    </div>

    <QueryErrorState
      v-else-if="loadError"
      :error="loadError"
      :retrying="isRefetchingConfig"
      message="Failed to load DCI configuration."
      class="load-error"
      @retry="refetchConfig"
    />

    <Tabs v-else v-model:value="activeTab" class="editor-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="processing">Processing</Tab>
        <Tab value="instanceDiscovery">Instance Discovery</Tab>
        <Tab v-if="dciType === 'item'" value="performance">Performance View</Tab>
        <Tab value="otherOptions">Other Options</Tab>
        <Tab value="tags">Tags</Tab>
        <Tab value="access">Access Control</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <DciGeneralTab
            :form="form"
            :dci-type="dciType"
            :object-id="objectId"
            :owner-object="ownerObject"
          />
        </TabPanel>
        <TabPanel value="processing">
          <DciProcessingTab
            :form="form"
            :dci-type="dciType"
            :object-id="objectId"
            :owner-object="ownerObject"
          />
        </TabPanel>
        <TabPanel value="instanceDiscovery">
          <DciInstanceDiscoveryTab :form="form" :owner-object="ownerObject" />
        </TabPanel>
        <TabPanel v-if="dciType === 'item'" value="performance">
          <DciPerformanceViewTab :form="form" />
        </TabPanel>
        <TabPanel value="otherOptions">
          <DciOtherOptionsTab :form="form" :dci-type="dciType" />
        </TabPanel>
        <TabPanel value="tags">
          <DciTagsTab :form="form" />
        </TabPanel>
        <TabPanel value="access">
          <DciAccessControlTab :form="form" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.dci-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--p-surface-card);
}

.save-error,
.load-error {
  margin: 0.75rem;
}

.source-banner {
  margin: 0.75rem 1.5rem 0.5rem;
}

.editor-loading {
  padding: 1.5rem;
}

.editor-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.editor-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}
</style>
