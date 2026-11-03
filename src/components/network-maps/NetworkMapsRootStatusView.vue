<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import InfoCard from '@/components/objects/InfoCard.vue'
import MapContentsTable from './MapContentsTable.vue'
import { mapTarget } from '@/utils/routeTargets'

const props = defineProps({
  /** Top-level nodes of the loaded map tree */
  tree: { type: Array, required: true },
  /** Null while loading */
  object: { type: Object, default: null },
})

const router = useRouter()

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
  <div class="root-status-view">
    <MapContentsTable
      title="Top-Level Items"
      :items="tree"
      empty-icon="pi pi-map"
      empty-text="No maps yet — create one to get started."
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
.root-status-view {
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
