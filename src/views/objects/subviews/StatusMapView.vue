<script setup>
import { computed, ref, watch } from 'vue'
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
import { userPrefs } from '@/utils/appStorage'
import { objectTarget } from '@/utils/routeTargets'

const EXCLUDED_CLASSES = new Set(['Interface'])

const props = defineProps({
  object: { type: Object, required: true },
})

const router = useRouter()

// Which classes get a status map is settled by config/objectViews.
const {
  data: subTreeData,
  isLoading,
  isFetching,
} = useObjectSubTree(computed(() => props.object.id))

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

// Not shared configuration, unlike the dashboard widget: this viewer's own choice.
const PREFS_FIELD = 'statusMap.objectView'
const stored = userPrefs.get(PREFS_FIELD, {}) ?? {}

const layoutMode = ref(typeof stored.displayMode === 'string' ? stored.displayMode : 'flat')
const sortBy = ref(stored.sortBy === 'name' ? 'name' : 'status')

watch([layoutMode, sortBy], ([displayMode, sort]) => {
  userPrefs.set(PREFS_FIELD, { displayMode, sortBy: sort })
})

/** Also the tile's open-in-new-tab target. */
function objectTargetFor(id) {
  return objectTarget({ id }, 'alarms', { perspective: 'infrastructure' })
}

function navigateToObject(id) {
  router.push(objectTargetFor(id))
}
</script>

<template>
  <div class="status-map-view">
    <StatusMapToolbar
      v-model:layout="layoutMode"
      v-model:sort-by="sortBy"
      :count="isLoading ? null : objectCount"
      :refreshing="isFetching && !isLoading"
      storage-key="object-view"
    />

    <div v-if="isLoading" class="status-map-loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
    </div>
    <div v-else class="status-map-content">
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
        :root-name="object.name"
        :target-for="objectTargetFor"
        @navigate="navigateToObject"
      />
      <StatusMapSunburst
        v-if="layoutMode === 'sunburst'"
        :tree="tree"
        :root-name="object.name"
        :target-for="objectTargetFor"
        @navigate="navigateToObject"
      />
      <StatusMapTreemap
        v-if="layoutMode === 'treemap'"
        :tree="tree"
        :root-name="object.name"
        :target-for="objectTargetFor"
        @navigate="navigateToObject"
      />
    </div>
  </div>
</template>

<style scoped>
.status-map-view {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
}

.status-map-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

.status-map-content {
  flex: 1;
  overflow-y: auto;
}
</style>
