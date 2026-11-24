<script setup>
import AutoComplete from 'primevue/autocomplete'
import { computed, nextTick, ref, watch } from 'vue'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { filterMapObjects } from '@/utils/networkMapObjectList'

const props = defineProps({
  searchTerm: { type: String, default: '' },
  /** Entries from `mapObjectEntries`: what the canvas draws. */
  objects: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:searchTerm', 'focus-object'])

const suggestions = ref([])

const VIRTUAL_LIST_MIN = 50
const virtualScroller = computed(() =>
  props.objects.length > VIRTUAL_LIST_MIN ? { itemSize: 30 } : null,
)

// A new array every time: AutoComplete opens only when `suggestions` changes, and a blank query
// would otherwise hand back the same `objects` array as the last open.
function onComplete(event) {
  suggestions.value = [...filterMapObjects(props.objects, event.query)]
}

// A pick leaves the picked entry as AutoComplete's internal value, and a prop that does not
// change cannot undo that; the field gets its own value, put back once the pick has rendered.
const fieldValue = ref(props.searchTerm)
watch(
  () => props.searchTerm,
  (term) => (fieldValue.value = term),
)

function onFieldUpdate(value) {
  fieldValue.value = value
  if (typeof value === 'string') emit('update:searchTerm', value)
}

function onObjectPick(event) {
  emit('focus-object', event.value.id)
  nextTick(() => (fieldValue.value = props.searchTerm))
}
</script>

<template>
  <div class="search-wrap">
    <i class="pi pi-search search-icon" />
    <AutoComplete
      :model-value="fieldValue"
      :suggestions="suggestions"
      option-label="name"
      dropdown
      dropdown-mode="current"
      size="small"
      placeholder="Search objects..."
      aria-label="Search objects"
      class="search-field"
      input-class="search-input"
      scroll-height="18rem"
      :virtual-scroller-options="virtualScroller"
      :pt="{ dropdown: { 'aria-label': 'Show objects on this map' } }"
      data-filter-input
      @update:model-value="onFieldUpdate"
      @complete="onComplete"
      @option-select="onObjectPick"
    >
      <template #option="{ option }">
        <span class="object-option">
          <ObjectIcon :object="option" :inactive="option.objectStatus === 6" />
          <span class="object-option__name">{{ option.name }}</span>
          <span class="object-option__class">{{ option.objectClass }}</span>
        </span>
      </template>
      <template #empty>No objects match</template>
    </AutoComplete>
    <button
      v-if="searchTerm"
      class="search-clear"
      aria-label="Clear search"
      @click="emit('update:searchTerm', '')"
    >
      <i class="pi pi-times" />
    </button>
  </div>
</template>

<style scoped>
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 0.25rem;
}

.search-icon {
  position: absolute;
  left: 0.5rem;
  z-index: 1;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  pointer-events: none;
}

/* The input belongs to AutoComplete, out of reach of scoped styles. */
.search-field :deep(.search-input) {
  font-size: 0.75rem;
  padding: 0.25rem 1.75rem 0.25rem 1.75rem;
  background: var(--p-surface-ground);
  width: 180px;
}

/* As SmartFilterInput's clear button, a small gap left of the 2rem dropdown button. */
.search-clear {
  position: absolute;
  right: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.search-clear:hover {
  color: var(--p-text-color);
  background: var(--p-surface-hover);
}

/* The theme sizes every .pi at --p-icon-size. */
.search-clear .pi {
  font-size: 0.625rem;
}

.object-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 0.8125rem;
}

.object-option__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-option__class {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
