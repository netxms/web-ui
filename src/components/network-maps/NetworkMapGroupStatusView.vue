<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import InfoCard from '@/components/objects/InfoCard.vue'
import MapContentsTable from './MapContentsTable.vue'
import { collectDescendantMaps } from '@/utils/networkMapUtils'
import { mapTarget } from '@/utils/routeTargets'

const props = defineProps({
  /** Tree node with .children populated from the loaded map tree */
  node: { type: Object, required: true },
  /** Null while loading */
  object: { type: Object, default: null },
})

const router = useRouter()

const directChildren = computed(() => props.node.children ?? [])
const descendantMaps = computed(() => collectDescendantMaps(props.node))

const worstOffenders = computed(() =>
  descendantMaps.value
    .filter((m) => (m.status ?? 0) > 0 && (m.status ?? 0) <= 4)
    .sort((a, b) => (b.status ?? 0) - (a.status ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 5),
)

const hasComments = computed(() => {
  const src = props.object?.commentsSource
  return src && src !== '{}' && src.trim() !== ''
})

const renderedComments = computed(() => {
  if (!hasComments.value) return ''
  return renderCommentsMarkdown(props.object.commentsSource)
})

function openChild(child) {
  router.push(mapTarget(child.id))
}
</script>

<template>
  <div class="group-status-view">
    <MapContentsTable
      title="Status Issues"
      :items="worstOffenders"
      empty-icon="pi pi-check-circle"
      empty-text="All maps in this group are healthy"
      :target-for="(row) => mapTarget(row.id)"
      @row-click="openChild"
    />

    <MapContentsTable
      title="Contents"
      :items="directChildren"
      empty-icon="pi pi-folder-open"
      empty-text="This group is empty"
      :target-for="(row) => mapTarget(row.id)"
      @row-click="openChild"
    />

    <InfoCard v-if="hasComments" title="Comments">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="comments-content" v-html="renderedComments" />
    </InfoCard>
  </div>
</template>

<style scoped>
.group-status-view {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  height: 100%;
}

.comments-content {
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
