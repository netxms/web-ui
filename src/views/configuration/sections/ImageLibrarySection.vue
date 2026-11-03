<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import ContextMenu from 'primevue/contextmenu'
import { menuAnchorEvent } from '@/utils/menuAnchor'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ImagePreviewPanel from '@/components/image-library/ImagePreviewPanel.vue'
import LibraryImage from '@/components/image-library/LibraryImage.vue'
import ImageEditDialog from '@/components/image-library/ImageEditDialog.vue'
import IconPackDialog from '@/components/image-library/IconPackDialog.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import {
  useImageLibrary,
  useUploadImage,
  useUpdateImage,
  useDeleteImage,
} from '@/queries/useImageLibraryQueries'
import { useWorkingState } from '@/composables/useWorkingState'

const confirm = useConfirm()
const toast = useToast()

const { data: imagesData, isLoading, isFetching, isError, error, refetch } = useImageLibrary()
const images = computed(() => imagesData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('image-library', { view: { filterState } })

const filteredImages = computed(() => {
  if (!filterState.value.text) return images.value
  const q = filterState.value.text.toLowerCase()
  return images.value.filter((img) => img.name.toLowerCase().includes(q))
})

const collapsedCategories = ref(new Set())

function toggleCategory(catId) {
  const next = new Set(collapsedCategories.value)
  if (next.has(catId)) next.delete(catId)
  else next.add(catId)
  collapsedCategories.value = next
}

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

const availableCategories = computed(() =>
  [...new Set(images.value.map((img) => img.category))].sort(),
)

const selectedImageId = ref(null)
const selectedImage = computed(
  () => images.value.find((img) => img.id === selectedImageId.value) ?? null,
)

function selectImage(id) {
  selectedImageId.value = id
}

/** Enter and Space select, matching the click; the row is a tab stop for that reason. */
function onRowKeydown(event, id) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  selectImage(id)
}

const contextMenu = ref()
const contextImage = ref(null)

/** Serves the row's right click and its overflow button, keyboard activation included. */
function onRowContextMenu(event, image) {
  contextImage.value = image
  contextMenu.value.show(menuAnchorEvent(event))
}

const contextMenuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    disabled: contextImage.value?.protected,
    command: () => openEditDialog(contextImage.value),
  },
  { separator: true },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    disabled: contextImage.value?.protected,
    command: () => confirmDelete(contextImage.value),
  },
])

const { mutate: deleteImage } = useDeleteImage()

function confirmDelete(image) {
  if (image.protected) return
  confirm.require({
    header: 'Delete Image',
    message: `Delete "${image.name}"? This cannot be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    accept: () => {
      deleteImage(image.id, {
        onSuccess: () => {
          toast.add({ severity: 'success', summary: 'Image deleted', life: 2000 })
          if (selectedImageId.value === image.id) {
            selectedImageId.value = null
          }
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete failed',
            detail: err.message,
            life: 4000,
          })
        },
      })
    },
  })
}

const iconPackVisible = ref(false)

const dialogVisible = ref(false)
const dialogImage = ref(null)
const dialogError = ref(null)

const { mutate: uploadImage, isPending: isUploading } = useUploadImage()
const { mutate: updateImage, isPending: isUpdating } = useUpdateImage()
const isSaving = computed(() => isUploading.value || isUpdating.value)

function openUploadDialog() {
  dialogImage.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEditDialog(image) {
  if (image.protected) return
  dialogImage.value = image
  dialogError.value = null
  dialogVisible.value = true
}

function onDialogSave({ name, category, file }) {
  dialogError.value = null
  if (dialogImage.value) {
    updateImage(
      { id: dialogImage.value.id, name, category, file },
      {
        onSuccess: () => {
          dialogVisible.value = false
          toast.add({ severity: 'success', summary: 'Image updated', life: 2000 })
        },
        onError: (err) => {
          dialogError.value = err.message ?? 'Failed to update image'
        },
      },
    )
  } else {
    uploadImage(
      { name, category, file },
      {
        onSuccess: (result) => {
          dialogVisible.value = false
          selectedImageId.value = result.id
          toast.add({ severity: 'success', summary: 'Image uploaded', life: 2000 })
        },
        onError: (err) => {
          dialogError.value = err.message ?? 'Failed to upload image'
        },
      },
    )
  }
}
</script>

<template>
  <div class="image-library-section">
    <div class="image-list-panel">
      <SectionHeader title="Image Library" icon="pi pi-images">
        <template #actions>
          <RefetchIndicator :is-fetching="isFetching && !isLoading" />
          <Button
            v-tooltip.bottom="'Refresh'"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            rounded
            aria-label="Refresh"
            @click="refetch"
          />
          <Button
            v-tooltip.bottom="'Upload image'"
            aria-label="Upload image"
            icon="pi pi-upload"
            size="small"
            severity="secondary"
            text
            rounded
            @click="openUploadDialog"
          />
          <Button
            v-tooltip.bottom="'Add the standard icon pack'"
            aria-label="Add icon pack"
            icon="pi pi-th-large"
            size="small"
            severity="secondary"
            text
            rounded
            @click="iconPackVisible = true"
          />
        </template>
      </SectionHeader>

      <div class="list-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter images..."
          size="small"
          class="filter-input"
        />
        <span class="item-count">{{ $plural(filteredImages.length, 'image') }}</span>
      </div>

      <div class="image-scroll-area">
        <template v-if="isLoading">
          <div v-for="i in 8" :key="i" class="img-row">
            <Skeleton width="32px" height="32px" border-radius="4px" class="img-row-thumb" />
            <Skeleton width="60%" height="0.875rem" />
          </div>
        </template>

        <div v-else-if="isError" class="list-error">
          <QueryErrorState :error="error" @retry="refetch" />
        </div>

        <!-- Search results: flat list -->
        <template v-else-if="filterState.text">
          <div v-if="filteredImages.length === 0" class="list-empty">
            <i class="pi pi-image" />
            <span>No images found</span>
          </div>
          <!-- The row holds its own actions button, so it cannot be a `<button>` or carry an
               interactive role; it is a tab stop with an Enter/Space handler instead. -->
          <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
          <div
            v-for="img in filteredImages"
            :key="img.id"
            class="img-row"
            :class="{ 'img-row--selected': img.id === selectedImageId }"
            tabindex="0"
            @click="selectImage(img.id)"
            @keydown="onRowKeydown($event, img.id)"
            @contextmenu.prevent="(e) => onRowContextMenu(e, img)"
          >
            <LibraryImage :guid="img.id" :alt="img.name" class="img-row-thumb" />
            <span class="img-row-name">{{ img.name }}</span>
            <Tag :value="img.category" severity="secondary" class="img-row-cat" />
            <i
              v-if="img.protected"
              v-tooltip.top="'System image — cannot be modified'"
              class="pi pi-lock img-row-lock"
            />
            <Button
              v-tooltip.left="'Actions'"
              aria-label="Actions"
              icon="pi pi-ellipsis-v"
              size="small"
              text
              rounded
              severity="secondary"
              class="img-row-actions"
              @click.stop="(e) => onRowContextMenu(e, img)"
            />
          </div>
        </template>

        <!-- Browse: collapsible category sections -->
        <template v-else>
          <div v-for="group in groupedImages" :key="group.id" class="category-section">
            <button class="category-header" @click="toggleCategory(group.id)">
              <i class="pi pi-folder cat-header-icon" />
              <span class="cat-header-label">{{ group.label }}</span>
              <span class="cat-header-count">{{ group.images.length }}</span>
              <i
                class="pi cat-header-chevron"
                :class="collapsedCategories.has(group.id) ? 'pi-chevron-right' : 'pi-chevron-down'"
              />
            </button>
            <div v-show="!collapsedCategories.has(group.id)">
              <!-- Holds its own actions button, so not a `<button>`: a tab stop with an
                   Enter/Space handler. -->
              <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
              <div
                v-for="img in group.images"
                :key="img.id"
                class="img-row"
                :class="{ 'img-row--selected': img.id === selectedImageId }"
                tabindex="0"
                @click="selectImage(img.id)"
                @keydown="onRowKeydown($event, img.id)"
                @contextmenu.prevent="(e) => onRowContextMenu(e, img)"
              >
                <LibraryImage :guid="img.id" :alt="img.name" class="img-row-thumb" />
                <span class="img-row-name">{{ img.name }}</span>
                <i
                  v-if="img.protected"
                  v-tooltip.top="'System image — cannot be modified'"
                  class="pi pi-lock img-row-lock"
                />
                <Button
                  v-tooltip.left="'Actions'"
                  aria-label="Actions"
                  icon="pi pi-ellipsis-v"
                  size="small"
                  text
                  rounded
                  severity="secondary"
                  class="img-row-actions"
                  @click.stop="(e) => onRowContextMenu(e, img)"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="image-preview-wrapper">
      <ImagePreviewPanel :image="selectedImage" @edit="openEditDialog" @delete="confirmDelete" />
    </div>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <ImageEditDialog
      v-model:visible="dialogVisible"
      :image="dialogImage"
      :categories="availableCategories"
      :saving="isSaving"
      :error="dialogError"
      @save="onDialogSave"
    />

    <IconPackDialog v-model:visible="iconPackVisible" />
  </div>
</template>

<style scoped>
.image-library-section {
  display: flex;
  height: 100%;
  min-height: 0;
}

.image-list-panel {
  width: 440px;
  flex-shrink: 0;
  border-right: 1px solid var(--p-surface-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--p-surface-card);
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.filter-field {
  flex: 1;
}

.filter-input {
  width: 100%;
}

.item-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.image-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.category-section {
  border-bottom: 1px solid var(--p-surface-border);
}

.category-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: var(--p-surface-ground);
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
  text-align: left;
  transition: background 0.15s;
}

.category-header:hover {
  background: var(--p-surface-hover);
}

.cat-header-icon {
  font-size: 0.9375rem;
  color: var(--p-text-muted-color);
}

.cat-header-label {
  flex: 1;
}

.cat-header-count {
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.cat-header-chevron {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.img-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.625rem 0.3rem 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
  min-height: 40px;
}

.img-row:hover {
  background: var(--p-surface-hover);
}

.img-row:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.img-row--selected {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.img-row-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 4px;
  background: var(--p-surface-ground);
  flex-shrink: 0;
  display: block;
}

.img-row-name {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.img-row-cat {
  font-size: 0.6875rem;
  flex-shrink: 0;
}

.img-row-lock {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.img-row-actions {
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.img-row:hover .img-row-actions,
.img-row--selected .img-row-actions {
  opacity: 1;
}

.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.list-empty i {
  font-size: 2rem;
}

.list-error {
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.image-preview-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
