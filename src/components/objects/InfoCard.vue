<script setup>
import { ref, watch } from 'vue'
import Panel from 'primevue/panel'
import { useViewStore } from '@/stores/viewStore'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: null,
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
  /** Shown at the right of the header, also while collapsed. */
  summary: {
    type: String,
    default: null,
  },
  /** When set, the collapsed state is persisted under this key. */
  persistKey: {
    type: String,
    default: null,
  },
})

const viewStore = useViewStore()

const isCollapsed = ref(
  props.persistKey ? viewStore.isCardCollapsed(props.persistKey, props.collapsed) : props.collapsed,
)

watch(
  () => props.collapsed,
  (val) => {
    // A stored preference outranks the default the card was mounted with.
    if (props.persistKey) {
      isCollapsed.value = viewStore.isCardCollapsed(props.persistKey, val)
      return
    }
    isCollapsed.value = val
  },
)

watch(isCollapsed, (val) => {
  if (props.persistKey) viewStore.setCardCollapsed(props.persistKey, val)
})

// Mouse convenience only; the Panel's toggle button is the keyboard entry point. Clicks on
// the button are skipped or the card would toggle twice. Its icon is click-through because the
// Panel swaps the SVG before the click bubbles here, and `closest` would miss a detached icon.
function onHeaderClick(event) {
  if (event.target.closest('.p-panel-toggle-button')) return
  isCollapsed.value = !isCollapsed.value
}

const panelPt = { header: { onClick: onHeaderClick } }
</script>

<template>
  <Panel
    v-model:collapsed="isCollapsed"
    toggleable
    :pt="panelPt"
    :class="['info-card', { 'info-card-collapsed': isCollapsed }]"
  >
    <template #header>
      <div class="info-card-header">
        <span class="p-panel-title">{{ title }}</span>
        <span v-if="summary" class="info-card-summary">{{ summary }}</span>
      </div>
    </template>
    <template v-if="icon" #icons>
      <i :class="icon" />
    </template>
    <slot />
  </Panel>
</template>

<style scoped>
.info-card {
  --p-panel-header-padding: 0.75rem 1rem;
  --p-panel-content-padding: 0.75rem 1rem;
  --p-panel-header-border-color: var(--p-surface-border);
  --p-panel-header-border-width: 0 0 1px 0;
  /* Otherwise one unbreakable string (a GUID, an OID) pushes the card past its track. */
  min-width: 0;
}

/* align-self: not stretched to the height of its expanded neighbours. */
.info-card-collapsed {
  --p-panel-header-border-width: 0;
  align-self: start;
}

.info-card-header {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: var(--p-text-muted-color);
}

.info-card-summary {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-card :deep(.p-panel-header) {
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: var(--p-text-muted-color);
}

/* Clicks on the Plus/Minus icon land on the button itself; see onHeaderClick. */
.info-card :deep(.p-panel-toggle-button .p-button-icon) {
  pointer-events: none;
}

/* PrimeVue's content container is a grid with an implicit `auto` column, which stretches to
   the min-content width of an unbreakable string; pin it so `text-overflow` can work. */
.info-card :deep(.p-panel-content-container) {
  grid-template-columns: minmax(0, 1fr);
}

.info-card :deep(.p-panel-content-wrapper),
.info-card :deep(.p-panel-content) {
  min-width: 0;
}
</style>
