<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useObjectCategories } from '@/queries/useObjectCategoryQueries'
import { useImageLibrary } from '@/queries/useImageLibraryQueries'
import LibraryImage from '@/components/image-library/LibraryImage.vue'

defineProps({
  visible: { type: Boolean, required: true },
  modelValue: { type: Number, default: null },
})

const emit = defineEmits(['update:visible', 'update:modelValue'])

const search = ref('')

const { data: categories } = useObjectCategories()
const { data: images } = useImageLibrary()

const imageMap = computed(() => {
  const map = new Map()
  for (const img of images.value ?? []) {
    map.set(img.id, img)
  }
  return map
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (categories.value ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))
})

function select(id) {
  emit('update:modelValue', id)
  emit('update:visible', false)
}

function clearAndClose() {
  emit('update:modelValue', null)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Category"
    :style="{ width: '520px' }"
    :modal="true"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="picker-body">
      <InputText
        v-model="search"
        data-filter-input
        placeholder="Search categories..."
        class="picker-search"
        autofocus
      />

      <div class="picker-grid">
        <button
          type="button"
          class="category-card"
          :class="{ selected: modelValue == null }"
          @click="clearAndClose"
        >
          <div class="card-header">
            <span class="category-name none-label">None</span>
          </div>
          <div class="card-thumbnails">
            <div class="thumbnail-slot">
              <div class="thumbnail-frame">
                <i class="pi pi-ban thumbnail-placeholder-icon" />
              </div>
              <span class="thumbnail-label">Icon</span>
            </div>
            <div class="thumbnail-divider" />
            <div class="thumbnail-slot">
              <div class="thumbnail-frame">
                <i class="pi pi-ban thumbnail-placeholder-icon" />
              </div>
              <span class="thumbnail-label">Map Image</span>
            </div>
          </div>
        </button>

        <button
          type="button"
          v-for="cat in filtered"
          :key="cat.id"
          class="category-card"
          :class="{ selected: modelValue === cat.id }"
          @click="select(cat.id)"
        >
          <div class="card-header">
            <span class="category-name">{{ cat.name }}</span>
          </div>
          <div class="card-thumbnails">
            <div class="thumbnail-slot">
              <div class="thumbnail-frame">
                <LibraryImage
                  v-if="cat.iconImageId && imageMap.get(cat.iconImageId)"
                  :guid="cat.iconImageId"
                  :alt="imageMap.get(cat.iconImageId).name"
                  class="thumbnail-img"
                />
                <i v-else class="pi pi-image thumbnail-placeholder-icon" />
              </div>
              <span class="thumbnail-label">Icon</span>
            </div>
            <div class="thumbnail-divider" />
            <div class="thumbnail-slot">
              <div class="thumbnail-frame">
                <LibraryImage
                  v-if="cat.mapImageId && imageMap.get(cat.mapImageId)"
                  :guid="cat.mapImageId"
                  :alt="imageMap.get(cat.mapImageId).name"
                  class="thumbnail-img"
                />
                <i v-else class="pi pi-map thumbnail-placeholder-icon" />
              </div>
              <span class="thumbnail-label">Map Image</span>
            </div>
          </div>
        </button>

        <div v-if="filtered.length === 0" class="picker-empty">No categories found.</div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.picker-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.picker-search {
  width: 100%;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.picker-empty {
  grid-column: 1 / -1;
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.category-card {
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.5rem;
  background: var(--p-surface-card);
  cursor: pointer;
  transition:
    box-shadow 0.15s,
    border-color 0.15s;
}

.category-card:hover {
  box-shadow: 0 2px 8px color-mix(in srgb, var(--p-text-color) 8%, transparent);
  border-color: var(--p-surface-300);
}

.category-card.selected {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-surface-card));
}

.card-header {
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.category-name {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--p-text-color);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  display: block;
}

.none-label {
  color: var(--p-text-muted-color);
  font-style: italic;
}

.card-thumbnails {
  display: flex;
}

.thumbnail-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
}

.thumbnail-divider {
  width: 1px;
  background: var(--p-surface-border);
  align-self: stretch;
}

.thumbnail-frame {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  background: var(--p-surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumbnail-placeholder-icon {
  font-size: 1.25rem;
  color: var(--p-text-muted-color);
}

.thumbnail-label {
  font-size: 0.625rem;
  color: var(--p-text-muted-color);
  text-align: center;
}
</style>
