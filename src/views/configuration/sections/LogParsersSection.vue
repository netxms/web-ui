<script setup>
import { ref, computed } from 'vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import LogParserView from '@/components/log-parsers/LogParserView.vue'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import Tabs from 'primevue/tabs'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'

const PARSER_TYPES = [
  { value: 'syslog', label: 'Syslog' },
  { value: 'windows-event', label: 'Windows Event Log' },
  { value: 'opentelemetry', label: 'OpenTelemetry Log' },
]

const activeType = ref('syslog')

/** Right end of the tab row; the active parser's toolbar is teleported here. */
const toolbarTarget = ref(null)

// One guard for every parser: leaving the section loses any of their unsaved edits.
const parserViews = ref([])
const hasAnyDirty = computed(() => parserViews.value.some((view) => view?.isDirty))
useUnsavedChangesGuard(hasAnyDirty, { includeRouteUpdates: true })
</script>

<template>
  <div class="log-parsers-section">
    <SectionHeader title="Log Parsers" icon="pi pi-file-edit" />
    <Tabs v-model:value="activeType" class="parser-type-tabs">
      <div class="parser-tab-row">
        <TabList class="parser-tab-list">
          <Tab v-for="type in PARSER_TYPES" :key="type.value" :value="type.value">
            {{ type.label }}
          </Tab>
        </TabList>
        <div ref="toolbarTarget" class="parser-tab-actions" />
      </div>
      <!-- TabPanels are not lazy, so unsaved edits survive a switch of parser type. -->
      <TabPanels class="parser-type-panels">
        <TabPanel v-for="type in PARSER_TYPES" :key="type.value" :value="type.value">
          <LogParserView
            ref="parserViews"
            :parser-type="type.value"
            :active="activeType === type.value"
            :toolbar-target="toolbarTarget"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.log-parsers-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.parser-type-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* The tab list and the toolbar share one row and one bottom border. */
.parser-tab-row {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-bottom: 1px solid var(--p-tabs-tablist-border-color);
  background: var(--p-tabs-tablist-background);
}

.parser-tab-list {
  flex: 1;
  min-width: 0;
}

.parser-tab-list :deep(.p-tablist-tab-list) {
  border-width: 0;
}

.parser-tab-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0.75rem;
}

.parser-type-panels {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.parser-type-panels :deep([data-pc-name='tabpanel']) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
</style>
