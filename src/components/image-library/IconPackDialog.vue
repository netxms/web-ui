<script setup>
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import { useToast } from 'primevue/usetoast'
import FormField from '@/components/common/FormField.vue'
import { useImageLibrary, useImportImages } from '@/queries/useImageLibraryQueries'
import { ICON_PACK, ICON_PACK_ICONS } from '@/utils/iconPack'
import { ICON_LIBRARY_CATEGORY, lucideIconSvg } from '@/utils/iconSvg'

// Skips icons already present (same name in the same category), so a rerun adds nothing.
const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible'])

const toast = useToast()
const { data: images } = useImageLibrary()
const { mutate: importImages, isPending } = useImportImages()

const category = ref(ICON_LIBRARY_CATEGORY)
const progress = ref(0)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    category.value = ICON_LIBRARY_CATEGORY
    progress.value = 0
  },
)

const targetCategory = computed(() => category.value.trim() || ICON_LIBRARY_CATEGORY)

const present = computed(() => {
  const names = new Set()
  for (const image of images.value ?? []) {
    if (image.category === targetCategory.value) names.add(image.name)
  }
  return names
})

const toAdd = computed(() => ICON_PACK_ICONS.filter((icon) => !present.value.has(icon.name)))

function close() {
  if (!isPending.value) emit('update:visible', false)
}

function addIcons() {
  const batch = toAdd.value.map((icon) => ({
    name: icon.name,
    category: targetCategory.value,
    file: new Blob([lucideIconSvg(icon.component)], { type: 'image/svg+xml' }),
  }))
  progress.value = 0
  importImages(
    {
      images: batch,
      onProgress: (done, total) => {
        progress.value = Math.round((done / total) * 100)
      },
    },
    {
      onSuccess: ({ added, failed }) => {
        if (failed.length) {
          toast.add({
            severity: added.length ? 'warn' : 'error',
            summary: added.length ? 'Some icons were not added' : 'Icons were not added',
            detail: `${failed.length} of ${batch.length} failed: ${failed[0].error?.message ?? 'unknown error'}`,
            life: 6000,
          })
        } else {
          toast.add({
            severity: 'success',
            summary: 'Icons added',
            detail: `${added.length} icons are now in the "${targetCategory.value}" category.`,
            life: 3000,
          })
        }
        if (added.length) emit('update:visible', false)
      },
    },
  )
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Add Icon Pack"
    modal
    :closable="!isPending"
    :style="{ width: '44rem', maxWidth: '95vw' }"
    @update:visible="close"
  >
    <div class="icon-pack">
      <p class="icon-pack__intro">
        Line icons drawn like the console's own. Give object categories these icons and they sit
        naturally next to the standard ones: the console draws them in its own icon colours, in both
        themes. They are added to the image library as SVG.
      </p>

      <FormField v-slot="{ id }" label="Library category">
        <InputText :id="id" v-model="category" :disabled="isPending" class="icon-pack__category" />
      </FormField>

      <div class="icon-pack__scroll">
        <div v-for="group in ICON_PACK" :key="group.group" class="icon-pack__group">
          <div class="icon-pack__group-label">{{ group.group }}</div>
          <div class="icon-pack__grid">
            <div
              v-for="icon in group.icons"
              :key="icon.name"
              class="icon-pack__item"
              :class="{ 'icon-pack__item--present': present.has(icon.name) }"
              :title="present.has(icon.name) ? `${icon.name} (already in the library)` : icon.name"
            >
              <component :is="icon.component" :size="22" :stroke-width="1.75" aria-hidden="true" />
              <span class="icon-pack__item-label">{{ icon.name }}</span>
              <i v-if="present.has(icon.name)" class="pi pi-check icon-pack__item-check" />
            </div>
          </div>
        </div>
      </div>

      <ProgressBar v-if="isPending" :value="progress" class="icon-pack__progress" />
      <p v-else class="icon-pack__summary">
        <template v-if="toAdd.length === 0">
          Every icon is already in the "{{ targetCategory }}" category.
        </template>
        <template v-else>
          {{ toAdd.length }} of {{ ICON_PACK_ICONS.length }} icons will be added to the "{{
            targetCategory
          }}" category.
        </template>
      </p>
    </div>

    <template #footer>
      <Button label="Cancel" text severity="secondary" :disabled="isPending" @click="close" />
      <Button
        :label="toAdd.length ? `Add ${toAdd.length} icons` : 'Add icons'"
        icon="pi pi-plus"
        :loading="isPending"
        :disabled="toAdd.length === 0"
        @click="addIcons"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.icon-pack {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.icon-pack__intro,
.icon-pack__summary {
  margin: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.icon-pack__category {
  width: 16rem;
}

.icon-pack__scroll {
  max-height: 22rem;
  overflow-y: auto;
}

.icon-pack__group-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
  padding: 0.5rem 0 0.25rem;
}

.icon-pack__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.icon-pack__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.5rem 0.25rem 0.375rem;
  width: 76px;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-content-background);
  color: var(--p-text-color);
}

.icon-pack__item--present {
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
}

.icon-pack__item-label {
  font-size: 0.625rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  line-height: 1.2;
}

.icon-pack__item-check {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  font-size: 0.625rem;
  color: var(--netxms-status-normal);
}

.icon-pack__progress {
  height: 0.5rem;
}
</style>
