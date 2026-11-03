<script setup>
import { ref, computed, watch } from 'vue'
import InputText from 'primevue/inputtext'
import ProgressSpinner from 'primevue/progressspinner'
import { useImageLibrary, useImagesByGuid } from '@/queries/useImageLibraryQueries'
import LibraryImage from '@/components/image-library/LibraryImage.vue'

const props = defineProps({
  /** Only images with width <= W and height <= H are shown. */
  sizeFilter: { type: Object, default: null },
})

const emit = defineEmits(['select'])

const { data: images, isLoading } = useImageLibrary()

const filter = ref('')

const dimensionMap = ref({})
const measuringDimensions = ref(false)

// The metadata endpoint does not report pixel dimensions, so a size filter has to resolve
// every image's bytes (capped by useImagesByGuid). A `dimensions` metadata field would remove
// this.
const measurableGuids = computed(() =>
  props.sizeFilter ? (images.value ?? []).map((img) => img.id) : [],
)
const { data: measurableUrls } = useImagesByGuid(measurableGuids)

async function measureAll(imgs, urls) {
  const unmeasured = imgs.filter((img) => !dimensionMap.value[img.id] && urls[img.id])
  if (!unmeasured.length) return
  measuringDimensions.value = true
  const entries = await Promise.all(
    unmeasured.map(
      (img) =>
        new Promise((resolve) => {
          const el = new Image()
          el.onload = () =>
            resolve([
              img.id,
              {
                // SVGs without explicit width/height report 0; Infinity keeps them out of any
                // size constraint.
                width: el.naturalWidth || Infinity,
                height: el.naturalHeight || Infinity,
              },
            ])
          el.onerror = () => resolve([img.id, { width: Infinity, height: Infinity }])
          el.src = urls[img.id]
        }),
    ),
  )
  dimensionMap.value = { ...dimensionMap.value, ...Object.fromEntries(entries) }
  measuringDimensions.value = false
}

watch(
  [images, measurableUrls],
  ([imgs, urls]) => {
    if (props.sizeFilter && imgs?.length && urls) measureAll(imgs, urls)
  },
  { immediate: true },
)

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  let list = images.value ?? []
  if (q) list = list.filter((img) => img.name.toLowerCase().includes(q))
  if (props.sizeFilter) {
    list = list.filter((img) => {
      const d = dimensionMap.value[img.id]
      return d && d.width <= props.sizeFilter.width && d.height <= props.sizeFilter.height
    })
  }
  return list
})

const grouped = computed(() => {
  const map = new Map()
  for (const img of filtered.value) {
    const cat = img.category || 'Uncategorized'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push(img)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
})

function select(img) {
  emit('select', img.id)
}
</script>

<template>
  <div class="image-picker">
    <InputText
      v-model="filter"
      data-filter-input
      placeholder="Search images..."
      size="small"
      class="image-picker__search"
    />

    <div v-if="sizeFilter" class="image-picker__size-note">
      Showing images up to {{ sizeFilter.width }}&times;{{ sizeFilter.height }} px
    </div>

    <div v-if="isLoading || (sizeFilter && measuringDimensions)" class="image-picker__loading">
      <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
    </div>

    <div v-else-if="grouped.length === 0" class="image-picker__empty">No images found</div>

    <div v-else class="image-picker__groups">
      <div v-for="group in grouped" :key="group.category" class="image-picker__group">
        <div class="image-picker__group-label">{{ group.category }}</div>
        <div class="image-picker__grid">
          <button
            v-for="img in group.items"
            :key="img.id"
            class="image-picker__item"
            :title="img.name"
            @click="select(img)"
          >
            <LibraryImage :guid="img.id" :alt="img.name" class="image-picker__thumb" />
            <span class="image-picker__name">{{ img.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 300px;
  max-height: 480px;
}

.image-picker__search {
  width: 100%;
}

.image-picker__size-note {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  margin-top: -0.25rem;
}

.image-picker__loading,
.image-picker__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 2rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.image-picker__groups {
  overflow-y: auto;
  flex: 1;
}

.image-picker__group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0 0.25rem;
}

.image-picker__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.image-picker__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
  cursor: pointer;
  width: 80px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.image-picker__item:hover {
  background: var(--p-content-hover-background);
  border-color: var(--p-primary-color);
}

.image-picker__thumb {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 3px;
}

.image-picker__name {
  font-size: 0.625rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  color: var(--p-text-color);
}
</style>
