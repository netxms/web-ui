<script setup>
import { ref, computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import WidgetPropertiesDialog from '@/components/dashboards/WidgetPropertiesDialog.vue'
import { getTypeDef } from '@/utils/dashboardElements'
import { updateWidgetConfig } from '@/utils/dashboardAdapters'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const widgets = computed(() => props.draft.widgets ?? [])

const selectedWidget = ref(null)
const showWidgetProps = ref(false)

function openWidgetProps() {
  if (selectedWidget.value) showWidgetProps.value = true
}

function handleWidgetConfigSave(payload) {
  const idx = props.draft.widgets.findIndex((w) => String(w.id) === String(selectedWidget.value.id))
  if (idx !== -1) {
    props.draft.widgets[idx] = updateWidgetConfig(props.draft.widgets[idx], payload)
  }
  showWidgetProps.value = false
}

function widgetSizeLabel(widget) {
  return `${widget.w} × ${widget.h}`
}

function widgetTitleDisplay(widget) {
  return widget.config?.title || getTypeDef(widget.type).label
}
</script>

<template>
  <div class="dashboard-elements-section">
    <fieldset class="form-fieldset">
      <legend>Display</legend>
      <div class="form-grid">
        <div class="form-field">
          <label class="form-label" for="de-cols">Grid Columns</label>
          <InputNumber
            id="de-cols"
            v-model="draft.cols"
            :min="1"
            :max="24"
            :show-buttons="true"
            class="form-input"
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="de-rowheight">Row Height (px)</label>
          <InputNumber
            id="de-rowheight"
            v-model="draft.rowHeight"
            :min="40"
            :max="400"
            :show-buttons="true"
            suffix=" px"
            class="form-input"
          />
        </div>
        <div class="form-field">
          <label class="form-label" for="de-scrollable">Scrollable Content</label>
          <ToggleSwitch id="de-scrollable" v-model="draft.scrollable" />
        </div>
        <div class="form-field full-width">
          <label class="form-label" for="de-aihint">AI Hint</label>
          <InputText
            id="de-aihint"
            v-model="draft.aiHint"
            class="form-input"
            placeholder="Optional context hint for AI"
          />
        </div>
      </div>
    </fieldset>

    <fieldset class="form-fieldset">
      <legend>Widgets</legend>
      <div class="elements-toolbar">
        <span class="elements-toolbar-title">Dashboard Elements</span>
        <Button
          label="Configure"
          icon="pi pi-cog"
          size="small"
          severity="secondary"
          :disabled="!selectedWidget"
          @click="openWidgetProps"
        />
      </div>

      <DataTable
        v-model:selection="selectedWidget"
        :value="widgets"
        selection-mode="single"
        data-key="id"
        class="elements-table"
      >
        <template #empty>
          <div class="table-empty">No widgets on this dashboard.</div>
        </template>
        <Column header="Type" style="width: 14rem">
          <template #body="{ data }">
            <div class="widget-type-cell">
              <i :class="getTypeDef(data.type).icon" class="widget-type-icon" />
              <span>{{ getTypeDef(data.type).label }}</span>
            </div>
          </template>
        </Column>
        <Column header="Title">
          <template #body="{ data }">
            <span class="widget-title-cell">{{ widgetTitleDisplay(data) }}</span>
          </template>
        </Column>
        <Column header="Size" style="width: 6rem">
          <template #body="{ data }">
            <span class="widget-size-cell">{{ widgetSizeLabel(data) }}</span>
          </template>
        </Column>
      </DataTable>
    </fieldset>

    <WidgetPropertiesDialog
      :visible="showWidgetProps"
      :widget="selectedWidget"
      @update:visible="
        (v) => {
          if (!v) showWidgetProps = false
        }
      "
      @save="handleWidgetConfigSave"
    />
  </div>
</template>

<style scoped>
.dashboard-elements-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.elements-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.elements-toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.elements-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.35rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.75rem;
}

.widget-type-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.widget-type-icon {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.widget-title-cell {
  font-weight: 500;
}

.widget-size-cell {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-family: var(--font-mono);
}

.table-empty {
  text-align: center;
  padding: 2.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
