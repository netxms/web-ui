<script setup>
import { computed } from 'vue'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'

const props = defineProps({
  title: { type: String, required: true },
  /** Shown beside the title while collapsed; empty parts are dropped. */
  summary: { type: [String, Array], default: '' },
})

const summaryParts = computed(() => [props.summary].flat().filter(Boolean))
</script>

<template>
  <Accordion :value="[]" multiple class="comm-accordion">
    <AccordionPanel value="panel">
      <AccordionHeader>
        <div class="panel-header">
          <span>{{ title }}</span>
          <span v-if="summaryParts.length" class="panel-summary">
            <template v-for="(part, index) in summaryParts" :key="index">
              <template v-if="index">&nbsp;&middot; </template>{{ part }}
            </template>
          </span>
        </div>
      </AccordionHeader>
      <AccordionContent>
        <div class="form-fields">
          <slot />
        </div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>
</template>

<style scoped>
.comm-accordion {
  display: flex;
  flex-direction: column;
}

:deep(.p-accordionpanel) {
  border-radius: var(--p-border-radius-lg, 0.5rem) !important;
  border: 1px solid var(--p-surface-border) !important;
  overflow: hidden;
}

:deep(.p-accordionheader) {
  padding: 0.75rem 1.25rem;
}

:deep(.p-accordioncontent-content) {
  padding: 1rem 1.25rem;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.panel-summary {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
  overflow-wrap: anywhere;
}
</style>
