<script setup>
import { ref, watch, computed } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { useToast } from 'primevue/usetoast'
import { useLogParser, useUpdateLogParser } from '@/queries/useLogParserQueries'
import LogParserEditor from './LogParserEditor.vue'
import LogParserXmlEditor from './LogParserXmlEditor.vue'

const props = defineProps({
  parserType: { type: String, required: true },
  active: { type: Boolean, default: true },
  /** Teleport target for the toolbar; without it the toolbar renders in place. */
  toolbarTarget: { type: Object, default: null },
})

const toast = useToast()

const { data: parserData, isLoading } = useLogParser(computed(() => props.parserType))
const { mutate: updateParser, isPending: isSaving } = useUpdateLogParser()

const modeOptions = [
  { label: 'Editor', value: 'editor' },
  { label: 'XML', value: 'xml' },
]

const activeTab = ref('editor')
const editorInitialContent = ref('')
const currentEditorContent = ref('')
const rawXml = ref('')
const savedContent = ref('')
const initialized = ref(false)
const editorResetKey = ref(0)

watch(
  () => props.parserType,
  () => {
    initialized.value = false
    editorInitialContent.value = ''
    currentEditorContent.value = ''
    rawXml.value = ''
    savedContent.value = ''
    activeTab.value = 'editor'
    editorResetKey.value++
  },
)

watch(
  () => parserData.value,
  (data) => {
    if (data && !initialized.value) {
      const content = data.content ?? ''
      savedContent.value = content
      editorInitialContent.value = content
      currentEditorContent.value = content
      rawXml.value = content
      editorResetKey.value++
      initialized.value = true
    }
  },
  { immediate: true },
)

const isDirty = computed(() =>
  activeTab.value === 'editor'
    ? currentEditorContent.value !== savedContent.value
    : rawXml.value !== savedContent.value,
)

defineExpose({ isDirty })

function handleTabChange(newTab) {
  if (newTab === activeTab.value) return
  if (newTab === 'xml') {
    rawXml.value = currentEditorContent.value
  } else if (newTab === 'editor') {
    editorInitialContent.value = rawXml.value
    currentEditorContent.value = rawXml.value
    editorResetKey.value++
  }
  activeTab.value = newTab
}

function discard() {
  editorInitialContent.value = savedContent.value
  currentEditorContent.value = savedContent.value
  rawXml.value = savedContent.value
  editorResetKey.value++
}

function save() {
  const content = activeTab.value === 'editor' ? currentEditorContent.value : rawXml.value
  updateParser(
    { type: props.parserType, content },
    {
      onSuccess: () => {
        toast.add({ severity: 'success', summary: 'Parser configuration saved', life: 2000 })
        savedContent.value = content
      },
      onError: (err) => {
        toast.add({ severity: 'error', summary: 'Save failed', detail: err.message, life: 4000 })
      },
    },
  )
}
</script>

<template>
  <div class="log-parser-view">
    <Teleport v-if="active" :to="toolbarTarget" :disabled="!toolbarTarget">
      <div class="parser-toolbar">
        <SelectButton
          :model-value="activeTab"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          aria-label="Editing mode"
          @change="(e) => handleTabChange(e.value)"
        />
        <template v-if="isDirty">
          <Button
            label="Discard"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            :disabled="isSaving"
            @click="discard"
          />
          <Button
            label="Save"
            icon="pi pi-check"
            size="small"
            :loading="isSaving"
            :disabled="isSaving"
            @click="save"
          />
        </template>
      </div>
    </Teleport>

    <div class="parser-content">
      <div v-show="activeTab === 'editor'" class="content-panel">
        <div v-if="isLoading" class="panel-loading">
          <i class="pi pi-spin pi-spinner" />
        </div>
        <LogParserEditor
          v-else-if="initialized"
          :key="editorResetKey"
          :initial-content="editorInitialContent"
          :parser-type="parserType"
          @update:content="currentEditorContent = $event"
        />
      </div>
      <div v-show="activeTab === 'xml'" class="content-panel">
        <LogParserXmlEditor v-model="rawXml" :is-loading="isLoading" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-parser-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.parser-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.parser-content {
  flex: 1;
  min-height: 0;
  position: relative;
}

.content-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 1.5rem;
}
</style>
