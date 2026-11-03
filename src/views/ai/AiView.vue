<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import AiChatView from '@/components/ai/AiChatView.vue'
import AiObservationsTab from '@/components/ai/AiObservationsTab.vue'
import AiMessagesTab from '@/components/ai/AiMessagesTab.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { useViewStore } from '@/stores/viewStore'
import { aiTarget } from '@/utils/routeTargets'

/**
 *   /ai, /ai/chat            the general chat
 *   /ai/chat?incident=<id>   the chat bound to an incident ("Discuss with AI")
 *   /ai/observations         AI operator observations
 *   /ai/messages             AI messages (no WebAPI yet: placeholder)
 *
 * Chat needs "use AI assistant", observations "view event log"; unusable tabs are not offered.
 */
const PERSPECTIVE_ID = 'ai'
const VIEWS = [
  { id: 'chat', label: 'Chat', icon: 'pi pi-sparkles', right: 'useAiAssistant' },
  { id: 'observations', label: 'Observations', icon: 'pi pi-eye', right: 'viewEventLog' },
  { id: 'messages', label: 'AI Messages', icon: 'pi pi-inbox' },
]

const NOT_AVAILABLE_MESSAGE =
  'This server has no AI assistant. Your administrator can enable one by configuring an AI ' +
  'provider for the server.'

const route = useRoute()
const router = useRouter()
const { can } = usePermissions()
const viewStore = useViewStore()

// The rail already hides the perspective without the component; this covers a bookmark.
const { has, isLoading: isServerInfoLoading } = useServerComponents()
const aiAvailable = computed(() => has(SERVER_COMPONENTS.AI_ASSISTANT))

const permittedViews = computed(() => VIEWS.filter((view) => !view.right || can.value[view.right]))
const visibleViewIds = computed(() =>
  viewStore.getVisibleViewIds(
    PERSPECTIVE_ID,
    permittedViews.value.map((view) => view.id),
  ),
)

const activeView = computed(() => {
  const requested = route.params.tab || 'chat'
  return visibleViewIds.value.includes(requested) ? requested : (visibleViewIds.value[0] ?? null)
})

// A tab named in the URL that this account cannot use lands on one it can.
watch(
  [() => route.params.tab, activeView],
  ([requested, active]) => {
    if (requested && active && requested !== active) router.replace(aiTarget(active))
  },
  { immediate: true },
)

const incidentId = computed(() => {
  const id = Number(route.query.incident)
  return Number.isInteger(id) && id > 0 ? id : null
})

function targetFor(viewId) {
  return aiTarget(viewId)
}

function handleViewSelect(viewId) {
  router.push(aiTarget(viewId))
}

function handleViewReorder(reordered) {
  viewStore.setViewOrder(PERSPECTIVE_ID, reordered)
}

const activeTabRef = ref(null)

function handleRefresh() {
  activeTabRef.value?.refetch?.()
}
</script>

<template>
  <div class="ai-view">
    <template v-if="aiAvailable">
      <ViewTabBar
        :views="VIEWS"
        :visible-view-ids="visibleViewIds"
        :active-view="activeView"
        :allow-add-remove="false"
        :target-for="targetFor"
        @select="handleViewSelect"
        @reorder="handleViewReorder"
        @refresh="handleRefresh"
      />

      <div class="ai-view-body">
        <AiChatView
          v-if="activeView === 'chat'"
          :key="incidentId ?? 'general'"
          :incident-id="incidentId"
        />
        <AiObservationsTab v-else-if="activeView === 'observations'" ref="activeTabRef" />
        <AiMessagesTab v-else-if="activeView === 'messages'" />
      </div>
    </template>

    <EmptyState
      v-else-if="!isServerInfoLoading"
      icon="pi pi-sparkles"
      title="AI assistant not available"
      :message="NOT_AVAILABLE_MESSAGE"
    />
  </div>
</template>

<style scoped>
.ai-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -1rem;
}

.ai-view-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
