<script setup>
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import ColorPickerField from '@/components/common/ColorPickerField.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import DciContainerEntryRow from './DciContainerEntryRow.vue'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Null when the dialog is closed. */
  element: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'apply'])

const activeTab = ref('general')
const form = ref({})
const dciList = ref([])

const dciNodePickerVisible = ref(false)

function addDciFromNode(node) {
  dciNodePickerVisible.value = false
  if (!node?.id) return
  dciList.value = [
    ...dciList.value,
    { nodeId: node.id, dciId: null, type: 0, instance: '', column: '', formatString: '' },
  ]
}

function updateDciEntry(index, patch) {
  dciList.value = dciList.value.map((d, i) => (i === index ? { ...d, ...patch } : d))
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
  () => [props.visible, props.element],
  () => {
    const el = props.element
    if (!props.visible || !el) return
    activeTab.value = 'general'
    form.value = {
      backgroundColor: el.backgroundColor ?? '#ffffff',
      textColor: el.textColor ?? '#202020',
      borderColor: el.borderColor ?? '#202020',
      borderRequired: el.borderRequired ?? false,
    }
    dciList.value = (el.dciList ?? []).map((d) => ({ ...d }))
  },
  { immediate: true },
)

function apply() {
  if (!props.element) return
  emit('apply', {
    backgroundColor: form.value.backgroundColor,
    textColor: form.value.textColor,
    borderColor: form.value.borderColor,
    borderRequired: form.value.borderRequired,
    dciList: dciList.value.filter((d) => d.dciId).map((d) => ({ ...d })),
  })
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="DCI Container Properties"
    :modal="true"
    :closable="true"
    :style="{ width: '600px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <Tabs v-model:value="activeTab" class="dci-props-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="dataSources">Data Sources</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="dci-props-form">
            <div class="prop-inline">
              <Checkbox
                autofocus
                v-model="form.borderRequired"
                input-id="dc-border"
                :binary="true"
              />
              <label for="dc-border">Show border</label>
            </div>
            <div class="color-grid">
              <FormField class="color-cell" label="Background color" group>
                <ColorPickerField v-model="form.backgroundColor" />
              </FormField>
              <FormField class="color-cell" label="Text color" group>
                <ColorPickerField v-model="form.textColor" />
              </FormField>
              <FormField class="color-cell" label="Border color" group>
                <ColorPickerField v-model="form.borderColor" :disabled="!form.borderRequired" />
              </FormField>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="dataSources">
          <div class="dci-props-form">
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
            <div v-if="dciList.length === 0" class="dci-list-empty">
              No data sources configured — add DCIs to display their values in the container.
            </div>
            <div v-else>
              <DciContainerEntryRow
                v-for="(entry, i) in dciList"
                :key="`${entry.nodeId}-${entry.dciId}-${i}`"
                :entry="entry"
                :index="i"
                :count="dciList.length"
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
    v-model:visible="dciNodePickerVisible"
    title="Select Node"
    @select="addDciFromNode"
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
  min-height: 260px;
}

.prop-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.color-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.color-cell-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
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

.dci-list-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.375rem 0;
}
</style>
