<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import StatusMapFlat from '@/components/objects/StatusMapFlat.vue'
import StatusMapToolbar from '@/components/objects/StatusMapToolbar.vue'
import { useObjectSubTree } from '@/queries/useObjectQueries'
import { flattenUnique } from '@/utils/statusMapObjects'
import { objectTarget } from '@/utils/routeTargets'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'
import { useWidgetEditing } from '@/composables/useWidgetEditing'

const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()
const effectiveObjectId = useEffectiveObjectId(() => props.widget.config?.objectId)
const objectId = computed(() => effectiveObjectId.value || null)

const { data: subTreeData, isLoading, isFetching } = useObjectSubTree(objectId)
const tree = computed(() => subTreeData.value ?? [])
const objectCount = computed(() => flattenUnique(tree.value).length)

// Saved with the dashboard and changed only in edit mode, as on the status map widget.
const { editMode, updateConfig } = useWidgetEditing()
const sortBy = computed(() => props.widget.config?.sortBy ?? 'status')

/** Route a tile points at; also its ctrl/middle-click "open in new tab" target. */
function objectTargetFor(id) {
  return objectTarget({ id }, 'status', { perspective: 'infrastructure' })
}

function navigateToObject(id) {
  router.push(objectTargetFor(id))
}
</script>

<template>
  <div class="service-components-widget">
    <div v-if="!objectId" class="scw-state">
      <i class="pi pi-sitemap" />
      <span>No business service configured</span>
    </div>
    <div v-else-if="isLoading" class="scw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="!tree.length" class="scw-state">
      <i class="pi pi-sitemap" />
      <span>No components found</span>
    </div>
    <template v-else>
      <StatusMapToolbar
        :sort-by="sortBy"
        :show-layouts="false"
        :editable="editMode"
        :count="objectCount"
        :refreshing="isFetching"
        :storage-key="`widget:${widget.id}`"
        default-collapsed
        @update:sort-by="(value) => updateConfig({ sortBy: value })"
      />
      <div class="scw-content">
        <StatusMapFlat
          :tree="tree"
          :sort-by="sortBy"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.service-components-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.scw-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.scw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.scw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}
</style>
