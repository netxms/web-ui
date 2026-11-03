<script setup>
import { ref, reactive, computed, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Dialog from 'primevue/dialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { getTypeDef } from '@/utils/dashboardElements'
import { CONFIG_EDITORS } from './widgetRegistry'
import { provideWidgetEditor } from './widgets/config/editorContext'
import GenericDataEditor from './widgets/config/GenericDataEditor.vue'
import ColorField from '@/components/common/ColorField.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  widget: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'save'])

const typeDef = computed(() => (props.widget ? getTypeDef(props.widget.type) : null))
const dialogHeader = computed(() => (typeDef.value?.label ?? 'Widget') + ' Properties')

const editorComponent = computed(() =>
  props.widget ? (CONFIG_EDITORS[props.widget.type] ?? null) : null,
)

// Inline widgets (label, separator) style themselves in the General tab
const showAppearanceTab = computed(() => typeDef.value?.inline !== true)

// A stable reactive object shared with editors via provide()

const activeTab = ref('general')

const editorCtx = reactive({ form: {}, widgetType: '' })
provideWidgetEditor(editorCtx)

const layoutForm = reactive({
  grabVerticalSpace: true,
  heightHint: -1,
  showInNarrowScreenMode: true,
  narrowScreenOrder: 255,
  narrowScreenHeightHint: -1,
})

// For types without a dedicated editor
const rawJson = ref('')
const jsonError = ref(null)

watch(
  () => props.widget,
  (w) => {
    // Reset in place so editor components keep their reference
    for (const key of Object.keys(editorCtx.form)) delete editorCtx.form[key]
    if (w?.config) Object.assign(editorCtx.form, JSON.parse(JSON.stringify(w.config)))
    editorCtx.widgetType = w?.type ?? ''

    const layout = w?.raw?.layout ?? {}
    layoutForm.grabVerticalSpace = layout.grabVerticalSpace !== false
    layoutForm.heightHint = layout.heightHint ?? -1
    layoutForm.showInNarrowScreenMode = layout.showInNarrowScreenMode !== false
    layoutForm.narrowScreenOrder = layout.narrowScreenOrder ?? 255
    layoutForm.narrowScreenHeightHint = layout.narrowScreenHeightHint ?? -1

    rawJson.value = JSON.stringify(w?.raw?.data ?? w?.config ?? {}, null, 2)
    jsonError.value = null
    activeTab.value = 'general'
  },
  { immediate: true },
)

function handleSave() {
  const payload = { layout: { ...layoutForm } }

  if (editorComponent.value) {
    payload.config = JSON.parse(JSON.stringify(editorCtx.form))
    // Title lives on the Appearance tab but is part of config
    payload.config.title = editorCtx.form.title
  } else {
    // Raw data JSON replaces the element data wholesale
    try {
      payload.rawData = JSON.parse(rawJson.value)
    } catch (e) {
      jsonError.value = `Invalid JSON: ${e.message}`
      return
    }
  }

  emit('save', payload)
  emit('update:visible', false)
}

function handleCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogHeader"
    modal
    position="top"
    :style="{ width: '42rem', marginTop: '8rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <Tabs v-model:value="activeTab" class="widget-props-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab v-if="showAppearanceTab" value="appearance">Appearance</Tab>
        <Tab value="layout">Layout</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="wpd-form">
            <component :is="editorComponent" v-if="editorComponent" :key="widget?.id" />
            <GenericDataEditor v-else v-model="rawJson" :error="jsonError" />
          </div>
        </TabPanel>

        <TabPanel v-if="showAppearanceTab" value="appearance">
          <div class="wpd-form">
            <div class="wpd-field">
              <label class="wpd-label" for="wpd-title">Title</label>
              <InputText
                autofocus
                id="wpd-title"
                v-model="editorCtx.form.title"
                class="wpd-input"
              />
            </div>
            <small class="wpd-hint"> Widgets without a title render without a header bar. </small>
            <ColorField label="Title text color" v-model="editorCtx.form.titleForeground" />
            <ColorField label="Title background" v-model="editorCtx.form.titleBackground" />
          </div>
        </TabPanel>

        <TabPanel value="layout">
          <div class="wpd-form">
            <label class="wpd-check-row" for="wpd-grab-vertical">
              <span @click.stop>
                <Checkbox
                  input-id="wpd-grab-vertical"
                  v-model="layoutForm.grabVerticalSpace"
                  :binary="true"
                />
              </span>
              Grab excessive vertical space
            </label>

            <div class="wpd-field">
              <label class="wpd-label" for="wpd-height-hint">Height hint (px, -1 = auto)</label>
              <InputNumber
                input-id="wpd-height-hint"
                v-model="layoutForm.heightHint"
                :min="-1"
                :max="4000"
                size="small"
                class="wpd-input"
              />
            </div>

            <label class="wpd-check-row" for="wpd-narrow-visible">
              <span @click.stop>
                <Checkbox
                  input-id="wpd-narrow-visible"
                  v-model="layoutForm.showInNarrowScreenMode"
                  :binary="true"
                />
              </span>
              Visible in narrow screen mode
            </label>

            <div class="wpd-field">
              <label class="wpd-label" for="wpd-narrow-order">Narrow screen order</label>
              <InputNumber
                input-id="wpd-narrow-order"
                v-model="layoutForm.narrowScreenOrder"
                :min="0"
                :max="255"
                size="small"
                class="wpd-input"
              />
            </div>

            <div class="wpd-field">
              <label class="wpd-label" for="wpd-narrow-height">
                Narrow screen height hint (px, -1 = auto)
              </label>
              <InputNumber
                input-id="wpd-narrow-height"
                v-model="layoutForm.narrowScreenHeightHint"
                :min="-1"
                :max="4000"
                size="small"
                class="wpd-input"
              />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="handleCancel" />
      <Button label="Save" severity="primary" @click="handleSave" />
    </template>
  </Dialog>
</template>

<style scoped>
.widget-props-tabs {
  display: flex;
  flex-direction: column;
  margin: -1rem -1.25rem 0;
}

.widget-props-tabs :deep(.p-tabpanels) {
  padding: 0;
}

.widget-props-tabs :deep(.p-tabpanel) {
  padding: 0;
}
</style>

<!-- Global: the per-type editors are separate SFCs. -->
<style>
.wpd-form {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 1rem 1.5rem;
  max-height: 60vh;
  overflow-y: auto;
}

.wpd-field {
  display: flex;
  /* Explicit, or a field that is also `.form-field` inherits column direction (forms.css). */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

/* A FormField field is also `.form-field`, whose column direction and dialog gap (0,2,0) a bare
   `.wpd-field` cannot outrank whatever the stylesheet order. `--column` fields opt into the
   stack. */
.wpd-form .wpd-field.form-field:not(.wpd-field--column) {
  flex-direction: row;
  align-items: center;
  gap: 1rem;
}

/* Same width as `.wpd-label`, so pickers line up with the rows around them. */
.wpd-form .wpd-field:not(.wpd-field--column) > .form-field__label {
  width: 11rem;
  flex-shrink: 0;
}

.wpd-field:last-child {
  border-bottom: none;
}

.wpd-field.wpd-field--column {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
}

.wpd-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 11rem;
  flex-shrink: 0;
}

.wpd-field--column .wpd-label {
  width: auto;
}

.wpd-input {
  flex: 1;
  min-width: 0;
  width: 100%;
}

.wpd-inline-pair {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.wpd-mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.wpd-check-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.5rem;
  margin: 0 -0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm, 4px);
  cursor: pointer;
  font-size: 0.875rem;
  user-select: none;
  transition: background 0.12s;
}

.wpd-check-row:last-child {
  border-bottom: none;
}

.wpd-check-row:hover {
  background: var(--p-surface-hover);
}

.wpd-picker-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}

.wpd-picker-value {
  flex: 1;
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wpd-picker-value--empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.wpd-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  padding: 0.25rem 0;
}
</style>
