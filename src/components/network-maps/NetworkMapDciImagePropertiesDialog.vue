<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import ImagePickerButton from '@/components/image-library/ImagePickerButton.vue'
import DciImageRuleRow from './DciImageRuleRow.vue'
import { useObject, useDciCurrentValues } from '@/queries/useObjectQueries'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Null when the dialog is closed. */
  element: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'apply'])

const activeTab = ref('general')
const form = ref({ dci: null, defaultImage: null })
const ruleList = ref([])

const metricNodePickerVisible = ref(false)
const metricNodeId = computed(() => form.value.dci?.nodeId ?? null)
const { data: metricNode } = useObject(metricNodeId)
const { data: currentValues, isLoading: dciLoading } = useDciCurrentValues(metricNodeId)

const metricNodeLabel = computed(() =>
  form.value.dci?.nodeId ? (metricNode.value?.name ?? `Node #${form.value.dci.nodeId}`) : null,
)

const dciOptions = computed(() => {
  const options = (currentValues.value?.values ?? []).map((v) => ({
    label: `${v.description} (#${v.id})`,
    value: Number(v.id),
  }))
  if (form.value.dci?.dciId && !options.some((o) => o.value === form.value.dci.dciId)) {
    options.unshift({ label: `DCI #${form.value.dci.dciId}`, value: form.value.dci.dciId })
  }
  return options
})

function selectMetricNode(node) {
  metricNodePickerVisible.value = false
  if (!node?.id) return
  form.value.dci = {
    nodeId: node.id,
    dciId: null,
    type: 0,
    instance: '',
    column: '',
    formatString: '',
    name: '',
  }
}

function selectMetricDci(dciId) {
  if (!form.value.dci) return
  const match = (currentValues.value?.values ?? []).find((v) => Number(v.id) === dciId)
  form.value.dci = { ...form.value.dci, dciId, name: match?.description ?? form.value.dci.name }
}

function addRule() {
  ruleList.value = [
    ...ruleList.value,
    { comparisonType: 0, image: null, compareValue: '', comment: '' },
  ]
}

function updateRule(index, patch) {
  ruleList.value = ruleList.value.map((r, i) => (i === index ? { ...r, ...patch } : r))
}

function removeRule(index) {
  ruleList.value = ruleList.value.filter((_, i) => i !== index)
}

function moveRule(index, delta) {
  const target = index + delta
  if (target < 0 || target >= ruleList.value.length) return
  const next = [...ruleList.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  ruleList.value = next
}

watch(
  () => [props.visible, props.element],
  () => {
    const el = props.element
    if (!props.visible || !el) return
    activeTab.value = 'general'
    form.value = {
      dci: el.dci ? { ...el.dci } : null,
      defaultImage: el.defaultImage ?? null,
    }
    ruleList.value = (el.dciRuleList ?? []).map((r) => ({ ...r }))
  },
  { immediate: true },
)

// As in the legacy client, a metric and a default image are both required.
const canApply = computed(() => !!form.value.dci?.dciId && !!form.value.defaultImage)

function apply() {
  if (!props.element || !canApply.value) return
  emit('apply', {
    dci: form.value.dci ? { ...form.value.dci } : null,
    defaultImage: form.value.defaultImage ?? null,
    // The legacy rule dialog requires an image
    dciRuleList: ruleList.value.filter((r) => r.image).map((r) => ({ ...r })),
  })
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="DCI Image Properties"
    :modal="true"
    :closable="true"
    :style="{ width: '620px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <Tabs v-model:value="activeTab" class="dci-props-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="rules">Rules</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="dci-props-form">
            <FormField label="Node" group>
              <div class="metric-node">
                <span class="metric-node-name">{{ metricNodeLabel || 'No node selected' }}</span>
                <Button
                  label="Select..."
                  icon="pi pi-search"
                  size="small"
                  severity="secondary"
                  @click="metricNodePickerVisible = true"
                />
              </div>
            </FormField>
            <FormField label="Metric" v-slot="{ id }">
              <Select
                autofocus
                :input-id="id"
                :model-value="form.dci?.dciId ?? null"
                :options="dciOptions"
                option-label="label"
                option-value="value"
                :loading="dciLoading"
                :disabled="!form.dci"
                :placeholder="dciLoading ? 'Loading DCIs…' : 'Select DCI'"
                filter
                size="small"
                class="full-width"
                @update:model-value="selectMetricDci($event)"
              />
            </FormField>
            <FormField label="Instance" v-slot="{ id }">
              <InputText
                :id="id"
                :model-value="form.dci?.instance ?? ''"
                :disabled="!form.dci"
                size="small"
                class="full-width"
                placeholder="For table DCIs"
                @update:model-value="form.dci && (form.dci = { ...form.dci, instance: $event })"
              />
            </FormField>
            <FormField label="Column" v-slot="{ id }">
              <InputText
                :id="id"
                :model-value="form.dci?.column ?? ''"
                :disabled="!form.dci"
                size="small"
                class="full-width"
                placeholder="For table DCIs"
                @update:model-value="form.dci && (form.dci = { ...form.dci, column: $event })"
              />
            </FormField>
            <FormField label="Default image" group>
              <ImagePickerButton v-model="form.defaultImage" label="Select default image" />
            </FormField>
            <Message v-if="!canApply" severity="info" :closable="false" class="apply-hint">
              Select a metric and a default image to apply.
            </Message>
          </div>
        </TabPanel>

        <TabPanel value="rules">
          <div class="dci-props-form">
            <div class="dci-list-header">
              <span class="dci-list-label">Image rules</span>
              <Button
                label="Add rule"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                @click="addRule"
              />
            </div>
            <p class="rule-hint">
              Rules are evaluated in order; the first match's image is used, otherwise the default
              image.
            </p>
            <div v-if="ruleList.length === 0" class="dci-list-empty">
              No rules configured — the default image is always shown.
            </div>
            <div v-else class="rule-list">
              <DciImageRuleRow
                v-for="(rule, i) in ruleList"
                :key="i"
                :rule="rule"
                :index="i"
                :count="ruleList.length"
                @update="updateRule(i, $event)"
                @remove="removeRule(i)"
                @move="moveRule(i, $event)"
              />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="emit('update:visible', false)" />
      <Button label="Apply" :disabled="!canApply" @click="apply" />
    </template>
  </Dialog>

  <ObjectPickerDialog
    v-model:visible="metricNodePickerVisible"
    title="Select Node"
    @select="selectMetricNode"
  />
</template>

<style scoped>
.dci-props-tabs {
  margin: 0 -1.25rem;
}

.dci-props-tabs :deep(.p-tabpanels) {
  padding: 1rem 1.25rem 0.25rem;
}

.dci-props-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 300px;
}

.full-width {
  width: 100%;
}

.metric-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.metric-node-name {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apply-hint {
  margin: 0;
  font-size: 0.75rem;
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

.rule-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.dci-list-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.375rem 0;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
</style>
