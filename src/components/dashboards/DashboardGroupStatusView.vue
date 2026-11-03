<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import InfoCard from '@/components/objects/InfoCard.vue'
import DashboardContentsTable from './DashboardContentsTable.vue'
import { useDashboardsByIds } from '@/queries/useDashboardQueries'
import { dashboardTarget } from '@/utils/routeTargets'

const props = defineProps({
  /** Tree node; .children are populated from the loaded dashboard tree */
  node: { type: Object, required: true },
  /** For comments; null while loading */
  object: { type: Object, default: null },
})

const router = useRouter()

const directChildren = computed(() => props.node.children ?? [])

// Direct children only: a recursive fetch across the subtree would be unbounded.
const directDashboardIds = computed(() =>
  directChildren.value.filter((c) => c.class === 'Dashboard').map((c) => c.id),
)
const { dashboardsById } = useDashboardsByIds(directDashboardIds)
const thumbnailsLoading = computed(() =>
  directDashboardIds.value.some((id) => !dashboardsById.value.has(id)),
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
  router.push(dashboardTarget(child.id))
}
</script>

<template>
  <div class="group-status-view">
    <DashboardContentsTable
      title="Contents"
      :items="directChildren"
      :dashboards-by-id="dashboardsById"
      :thumbnails-loading="thumbnailsLoading"
      empty-icon="pi pi-folder-open"
      empty-text="This group is empty"
      :target-for="(row) => dashboardTarget(row.id)"
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
