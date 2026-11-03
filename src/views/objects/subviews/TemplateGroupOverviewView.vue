<script setup>
import { computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import { renderCommentsMarkdown } from '@/utils/commentsUtils'
import Button from 'primevue/button'
import StatusTag from '@/components/common/StatusTag.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Skeleton from 'primevue/skeleton'
import InfoCard from '@/components/objects/InfoCard.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObject, useObjectChildren } from '@/queries/useObjectQueries'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { objectTarget } from '@/utils/routeTargets'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const router = useRouter()

const objectId = computed(() => props.object?.id)
const { data: currentObject, isLoading, isFetching, isError, error, refetch } = useObject(objectId)
const {
  data: children,
  isFetching: isFetchingChildren,
  isError: isErrorChildren,
  error: errorChildren,
  refetch: refetchChildren,
} = useObjectChildren(objectId, ['Template', 'TemplateGroup'])

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => {
    refetch()
    refetchChildren()
  })
}

const isAnyError = computed(() => isError.value || isErrorChildren.value)
const overviewError = computed(() => error.value || errorChildren.value)

function retryAll() {
  refetch()
  refetchChildren()
}

const details = computed(() => currentObject.value ?? props.object)

const childList = computed(() => children.value ?? [])
const subgroupCount = computed(
  () => childList.value.filter((c) => c.class === 'TemplateGroup').length,
)
const templateCount = computed(() => childList.value.filter((c) => c.class === 'Template').length)

const hasComments = computed(() => !!details.value?.comments?.trim())

const renderedComments = computed(() =>
  hasComments.value ? renderCommentsMarkdown(details.value.comments) : '',
)

function goToView(viewId) {
  router.push({
    name: 'templates',
    params: { objectId: objectId.value, viewId },
  })
}

/** Drives both the click and its open-in-new-tab href. */
function childTarget(child) {
  return objectTarget(child, 'status', { perspective: 'templates' })
}

function openChild(child, event) {
  if (shouldOpenInNewTab(event)) {
    openInNewTab(childTarget(child))
    return
  }
  router.push(childTarget(child))
}
</script>

<template>
  <div class="overview-view" style="position: relative">
    <RefetchIndicator :is-fetching="(isFetching || isFetchingChildren) && !isLoading" />

    <template v-if="isLoading && !currentObject">
      <div class="card-grid compact">
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
      </div>
    </template>

    <QueryErrorState
      v-else-if="isAnyError && !currentObject"
      :error="overviewError"
      class="overview-error"
      @retry="retryAll"
    />

    <template v-else>
      <div class="quick-actions">
        <Button
          label="Properties"
          icon="pi pi-cog"
          severity="secondary"
          outlined
          size="small"
          @click="goToView('properties')"
        />
        <Button
          label="Comments"
          icon="pi pi-comments"
          severity="secondary"
          outlined
          size="small"
          @click="goToView('comments')"
        />
      </div>

      <div class="card-grid compact">
        <InfoCard title="Sub-groups">
          <div class="stat-value">{{ subgroupCount }}</div>
        </InfoCard>
        <InfoCard title="Templates">
          <div class="stat-value">{{ templateCount }}</div>
        </InfoCard>
      </div>

      <InfoCard v-if="hasComments" title="Comments">
        <div class="comments-content" v-html="renderedComments" />
      </InfoCard>

      <InfoCard title="Contents">
        <DataTable
          v-if="childList.length > 0"
          :value="childList"
          data-key="id"
          class="children-table"
          @row-click="(e) => openChild(e.data, e.originalEvent)"
        >
          <Column field="name" header="Name">
            <template #body="{ data }">
              <span class="child-name">
                <ObjectIcon :object="data" />
                {{ data.name }}
              </span>
            </template>
          </Column>
          <Column field="class" header="Type" />
          <Column field="status" header="Status">
            <template #body="{ data }">
              <StatusTag :status="data.status" />
            </template>
          </Column>
        </DataTable>
        <div v-else class="empty-contents">
          <i class="pi pi-folder-open" />
          <span>This group is empty</span>
        </div>
      </InfoCard>
    </template>
  </div>
</template>

<style scoped>
.overview-view {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
}

.card-grid {
  display: grid;
  gap: 0.75rem;
}

.card-grid.compact {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.overview-error {
  justify-content: center;
  padding: 3rem 1rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
}

.children-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}

.child-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.comments-content {
  font-size: 0.875rem;
  line-height: 1.6;
}

.empty-contents {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.empty-contents i {
  font-size: 1.5rem;
  opacity: 0.4;
}
</style>
