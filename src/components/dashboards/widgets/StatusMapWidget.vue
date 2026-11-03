<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ProgressSpinner from 'primevue/progressspinner'
import StatusMapFlat from '@/components/objects/StatusMapFlat.vue'
import StatusMapGrouped from '@/components/objects/StatusMapGrouped.vue'
import StatusMapHoneycomb from '@/components/objects/StatusMapHoneycomb.vue'
import StatusMapSunburst from '@/components/objects/StatusMapSunburst.vue'
import StatusMapTreemap from '@/components/objects/StatusMapTreemap.vue'
import StatusMapToolbar from '@/components/objects/StatusMapToolbar.vue'
import { useObjectSubTree } from '@/queries/useObjectQueries'
import { flattenUnique } from '@/utils/statusMapObjects'
import { objectTarget } from '@/utils/routeTargets'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'
import { useWidgetEditing } from '@/composables/useWidgetEditing'

const EXCLUDED_CLASSES = new Set(['Interface'])

const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()

const effectiveObjectId = useEffectiveObjectId(() => props.widget.config?.objectId)
const objectId = computed(() => effectiveObjectId.value || null)

const { data: subTreeData, isLoading, isFetching } = useObjectSubTree(objectId)

function filterExcluded(nodes) {
  return nodes
    .filter((n) => !EXCLUDED_CLASSES.has(n.class))
    .map((n) => {
      if (!n.children?.length) return n
      const filtered = filterExcluded(n.children)
      return filtered.length ? { ...n, children: filtered } : { ...n, children: undefined }
    })
}

const tree = computed(() => filterExcluded(subTreeData.value ?? []))

const objectCount = computed(() => flattenUnique(tree.value).length)

// Part of the dashboard, not the viewer: changed only in edit mode; the adapter maps legacy
// groupObjects/showRadial.
const { editMode, updateConfig } = useWidgetEditing()
const layoutMode = computed(() => props.widget.config?.displayMode ?? 'flat')
const sortBy = computed(() => props.widget.config?.sortBy ?? 'status')

/** Also the ctrl/middle-click "open in new tab" target. */
function objectTargetFor(id) {
  return objectTarget({ id }, 'alarms', { perspective: 'infrastructure' })
}

function navigateToObject(id) {
  router.push(objectTargetFor(id))
}
</script>

<template>
  <div class="status-map-widget">
    <template v-if="!objectId">
      <div class="widget-empty">
        <i class="pi pi-map" />
        <span>No object configured</span>
      </div>
    </template>
    <template v-else>
      <!-- Collapsed by default: a dashboard is mostly glanced at. -->
      <StatusMapToolbar
        :layout="layoutMode"
        :sort-by="sortBy"
        :editable="editMode"
        :count="isLoading ? null : objectCount"
        :refreshing="isFetching && !isLoading"
        :storage-key="`widget:${widget.id}`"
        default-collapsed
        @update:layout="(value) => updateConfig({ displayMode: value })"
        @update:sort-by="(value) => updateConfig({ sortBy: value })"
      />
      <div v-if="isLoading" class="widget-loading">
        <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="3" />
      </div>
      <div v-else class="widget-content">
        <StatusMapFlat
          v-if="layoutMode === 'flat'"
          :tree="tree"
          :sort-by="sortBy"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
        <StatusMapHoneycomb
          v-if="layoutMode === 'honeycomb'"
          :tree="tree"
          :sort-by="sortBy"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
        <StatusMapGrouped
          v-if="layoutMode === 'grouped'"
          :tree="tree"
          :root-name="widget.config?.title ?? ''"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
        <StatusMapSunburst
          v-if="layoutMode === 'sunburst'"
          :tree="tree"
          :root-name="widget.config?.title ?? ''"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
        <StatusMapTreemap
          v-if="layoutMode === 'treemap'"
          :tree="tree"
          :root-name="widget.config?.title ?? ''"
          :target-for="objectTargetFor"
          @navigate="navigateToObject"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-map-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.widget-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.widget-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.widget-empty i {
  font-size: 1.5rem;
  opacity: 0.3;
}
</style>
