<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import { useImageLibrary } from '@/queries/useImageLibraryQueries'
import LibraryImage from '@/components/image-library/LibraryImage.vue'

defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    default: 'Choose Image',
  },
  selectedId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['update:visible', 'select'])

const filterText = ref('')

const collapsedCategories = ref(new Set())

function toggleCategory(categoryId) {
  const next = new Set(collapsedCategories.value)
  if (next.has(categoryId)) next.delete(categoryId)
  else next.add(categoryId)
  collapsedCategories.value = next
}

const { data: imagesData, isLoading } = useImageLibrary()
const images = computed(() => imagesData.value ?? [])

const filteredImages = computed(() => {
  if (!filterText.value.trim()) return images.value
  const search = filterText.value.toLowerCase()
  return images.value.filter((img) => img.name.toLowerCase().includes(search))
})

const groupedImages = computed(() => {
  const map = new Map()
  for (const img of images.value) {
    if (!map.has(img.category)) map.set(img.category, [])
    map.get(img.category).push(img)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, imgs]) => ({ id: cat, label: cat, images: imgs }))
})

function onSelect(image) {
  emit('select', image)
  emit('update:visible', false)
}

function onHide() {
  filterText.value = ''
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: '42rem' }"
    @update:visible="onHide"
  >
    <div class="picker-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          autofocus
          v-model="filterText"
          data-filter-input
          placeholder="Search images..."
          class="picker-search"
        />
      </IconField>
    </div>

    <div class="picker-body">
      <div v-if="isLoading" class="picker-loading">
        <i class="pi pi-spin pi-spinner" />
      </div>

      <template v-else>
        <template v-if="filterText.trim()">
          <div v-if="filteredImages.length === 0" class="picker-empty">
            <i class="pi pi-image" />
            <span>No images found</span>
          </div>
          <div v-else class="picker-grid">
            <button
              v-for="image in filteredImages"
              :key="image.id"
              type="button"
              class="picker-item"
              :class="{ 'picker-item--selected': image.id === selectedId }"
              @click="onSelect(image)"
            >
              <div class="picker-thumb-frame">
                <LibraryImage :guid="image.id" :alt="image.name" class="picker-thumb" />
              </div>
              <span class="picker-item-name">{{ image.name }}</span>
            </button>
          </div>
        </template>

        <div v-else class="picker-sections">
          <div v-for="group in groupedImages" :key="group.id" class="picker-section">
            <button type="button" class="picker-section-header" @click="toggleCategory(group.id)">
              <i class="pi pi-folder section-icon" />
              <span class="section-label">{{ group.label }}</span>
              <span class="section-count">{{ group.images.length }}</span>
              <i
                class="pi section-chevron"
                :class="collapsedCategories.has(group.id) ? 'pi-chevron-right' : 'pi-chevron-down'"
              />
            </button>
            <div v-show="!collapsedCategories.has(group.id)" class="picker-grid section-grid">
              <button
                v-for="image in group.images"
                :key="image.id"
                type="button"
                class="picker-item"
                :class="{ 'picker-item--selected': image.id === selectedId }"
                @click="onSelect(image)"
              >
                <div class="picker-thumb-frame">
                  <LibraryImage :guid="image.id" :alt="image.name" class="picker-thumb" />
                </div>
                <span class="picker-item-name">{{ image.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" @click="onHide" />
    </template>
  </Dialog>
</template>

<style scoped>
.picker-toolbar {
  padding: 0 0 0.75rem;
}

.picker-search {
  width: 100%;
}

.picker-loading,
.picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.picker-empty i {
  font-size: 2rem;
}

.picker-body {
  overflow-y: auto;
  max-height: 420px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
  padding: 0.25rem;
}

.picker-sections {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.125rem;
}

.picker-section {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  overflow: hidden;
}

.picker-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  background: var(--p-surface-ground);
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
  text-align: left;
  transition: background 0.15s;
}

.picker-section-header:hover {
  background: var(--p-surface-hover);
}

.section-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.section-label {
  flex: 1;
}

.section-count {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.section-chevron {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.section-grid {
  padding: 0.5rem;
  overflow: visible;
  max-height: none;
  border-top: 1px solid var(--p-surface-border);
}

.picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  background: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.picker-item:hover {
  background: var(--p-surface-hover);
}

.picker-item--selected {
  border-color: var(--p-primary-color);
  background: var(--p-primary-50);
}

.picker-thumb-frame {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  background: var(--p-surface-ground);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.picker-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.picker-item-name {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
