<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { createClassSelectionFilter } from '@/utils/objectSelection'

// draft is a shared mutable object from usePropertyEditor — mutations are intentional
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  draft: { type: Object, required: true },
  object: { type: Object, required: true },
  sectionId: { type: String, required: true },
  sectionLabel: { type: String, required: true },
})

const seedObjects = computed(() => props.draft.seedObjects ?? [])
const { objectsById } = useObjectsByIds(seedObjects)

const seedItems = computed(() =>
  seedObjects.value.map((id) => {
    const obj = objectsById.value.get(id)
    return { id, name: obj?.name ?? `Object #${id}`, class: obj?.class ?? null }
  }),
)

const pickerVisible = ref(false)

// Mirrors the legacy createNodeSelectionFilter; container classes stay navigable.
const SEED_PERSPECTIVE_CLASSES = ['ServiceRoot', 'Network']
const { selectable: seedSelectable, displayFilter: seedDisplayFilter } = createClassSelectionFilter(
  ['Node', 'Collector', 'Container', 'Cluster', 'WirelessDomain', 'Chassis', 'Rack'],
)

function addSeedObject(node) {
  pickerVisible.value = false
  if (node?.id && !seedObjects.value.includes(node.id)) {
    props.draft.seedObjects = [...seedObjects.value, node.id]
  }
}

function removeSeedObject(id) {
  props.draft.seedObjects = seedObjects.value.filter((x) => x !== id)
}
</script>

<template>
  <div class="network-map-seed-section">
    <fieldset class="form-fieldset">
      <legend>Seed objects</legend>
      <p class="section-hint">
        Objects used as the starting point for automatic topology discovery on this map.
      </p>
      <div class="seed-list">
        <div v-if="seedItems.length === 0" class="section-empty">No seed objects</div>
        <div v-for="item in seedItems" :key="item.id" class="seed-row">
          <span class="seed-name" :title="item.name">{{ item.name }}</span>
          <Button
            :aria-label="`Remove seed object ${item.name}`"
            icon="pi pi-times"
            size="small"
            text
            severity="danger"
            @click="removeSeedObject(item.id)"
          />
        </div>
      </div>
      <Button
        label="Add..."
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        @click="pickerVisible = true"
      />
    </fieldset>

    <AllObjectsPickerDialog
      v-model:visible="pickerVisible"
      title="Select Seed Object"
      :perspective-classes="SEED_PERSPECTIVE_CLASSES"
      :selectable="seedSelectable"
      :display-filter="seedDisplayFilter"
      @select="addSeedObject"
    />
  </div>
</template>

<style scoped>
.network-map-seed-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.seed-list {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  max-height: 14rem;
  overflow-y: auto;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.75rem;
}

.section-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.375rem 0;
}

.seed-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.seed-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
