<script setup>
import { ref, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import InputText from 'primevue/inputtext'
import ImagePickerContent from '@/components/image-library/ImagePickerContent.vue'
import { ICON_CATALOG } from './iconCatalog.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** `lucide:<name>`, an image library GUID, or null. */
  modelValue: { type: String, default: null },
  /** Forwarded to the Custom Images tab. */
  sizeFilter: { type: Object, default: null },
  /** Note under the Icons tab's search: what picking one of them implies. */
  iconsHint: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'select'])

const activeTab = ref(props.modelValue?.startsWith('lucide:') ? 'icons' : 'images')

const currentLucideIcon = computed(() =>
  props.modelValue?.startsWith('lucide:') ? props.modelValue.slice(7) : null,
)

const filter = ref('')

const filteredCatalog = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return ICON_CATALOG
  return ICON_CATALOG.map((cat) => ({
    ...cat,
    icons: cat.icons.filter((i) => i.label.toLowerCase().includes(q) || i.name.includes(q)),
  })).filter((cat) => cat.icons.length > 0)
})

function selectIcon(name) {
  emit('select', 'lucide:' + name)
  emit('update:visible', false)
}

function selectImage(id) {
  emit('select', id)
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Select Icon"
    :modal="true"
    :closable="true"
    :style="{ width: '600px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <Tabs v-model:value="activeTab" class="icon-picker-tabs">
      <TabList>
        <Tab value="icons">Icons</Tab>
        <Tab value="images">Custom Images</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="icons">
          <div class="icon-picker">
            <InputText
              v-model="filter"
              data-filter-input
              placeholder="Search icons..."
              size="small"
              class="icon-picker__search"
              autofocus
            />
            <p v-if="iconsHint" class="icon-picker__hint">{{ iconsHint }}</p>

            <div v-if="filteredCatalog.length === 0" class="icon-picker__empty">No icons found</div>

            <div v-else class="icon-picker__scroll">
              <div v-for="cat in filteredCatalog" :key="cat.category" class="icon-picker__group">
                <div class="icon-picker__group-label">{{ cat.category }}</div>
                <div class="icon-picker__grid">
                  <button
                    v-for="ico in cat.icons"
                    :key="ico.name"
                    class="icon-picker__item"
                    :class="{ 'icon-picker__item--selected': ico.name === currentLucideIcon }"
                    :title="ico.label"
                    @click="selectIcon(ico.name)"
                  >
                    <component :is="ico.component" :size="22" stroke-width="1.5" />
                    <span class="icon-picker__item-label">{{ ico.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="images">
          <ImagePickerContent :size-filter="sizeFilter" @select="selectImage" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Dialog>
</template>

<style scoped>
.icon-picker-tabs {
  margin: -0.5rem -1.25rem -1.25rem;
}

.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.75rem;
}

.icon-picker__search {
  width: 100%;
}

.icon-picker__hint {
  margin: -0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.icon-picker__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.icon-picker__scroll {
  overflow-y: auto;
  max-height: 440px;
}

.icon-picker__group {
  margin-bottom: 0.25rem;
}

.icon-picker__group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0 0.25rem;
}

.icon-picker__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.icon-picker__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.5rem 0.25rem 0.375rem;
  width: 68px;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
  color: var(--p-text-color);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.icon-picker__item:hover {
  background: var(--p-content-hover-background);
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.icon-picker__item--selected {
  background: var(--p-primary-50, color-mix(in srgb, var(--p-primary-color) 12%, transparent));
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.icon-picker__item-label {
  font-size: 0.575rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  line-height: 1.2;
}
</style>
