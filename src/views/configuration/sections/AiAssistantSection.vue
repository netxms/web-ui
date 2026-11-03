<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import AiOperatorsTab from '@/components/ai/AiOperatorsTab.vue'
import AiOperatorDetailView from '@/components/ai/AiOperatorDetailView.vue'
import AiMemoryTab from '@/components/ai/AiMemoryTab.vue'
import AiTasksTab from '@/components/ai/AiTasksTab.vue'
import AiSkillsTab from '@/components/ai/AiSkillsTab.vue'
import AiPromptsTab from '@/components/ai/AiPromptsTab.vue'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useServerComponents } from '@/composables/useServerComponents'
import { useWorkingState } from '@/composables/useWorkingState'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { useAiOperator } from '@/queries/useAiOperatorQueries'
import { aiTarget } from '@/utils/routeTargets'

const route = useRoute()
const router = useRouter()

/**
 * The section works without an initialized assistant, but then no skill or function is
 * registered and no operator runs, so it says so rather than leaving empty lists to explain
 * it. The provider lives in the server configuration file's `[AI/Provider/*]` sections.
 */
const { has, isLoading: isServerInfoLoading } = useServerComponents()
const aiInitialized = computed(() => has(SERVER_COMPONENTS.AI_ASSISTANT))
const showNotInitializedNotice = computed(() => !isServerInfoLoading.value && !aiInitialized.value)

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const TABS = ['operators', 'tasks', 'skills', 'memory', 'prompts']

// Observations moved to the AI perspective; old links follow them there.
if (route.query.tab === 'observations') router.replace(aiTarget('observations'))

const activeTab = ref(TABS.includes(route.query.tab) ? route.query.tab : 'operators')

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'observations') router.replace(aiTarget('observations'))
    else if (TABS.includes(tab) && tab !== activeTab.value) activeTab.value = tab
  },
)

useWorkingState('ai-assistant', { view: { activeTab } })
// A remembered tab that no longer exists (Observations) falls back to the first.
if (TABS.includes(route.query.tab)) activeTab.value = route.query.tab
else if (!TABS.includes(activeTab.value)) activeTab.value = 'operators'

// Operators are the only entity with a detail view, so `entityId` is an operator id or 'new'.
const isNewOperator = computed(() => entityId.value === 'new')

/** Keep the tab query on the detail route so Back returns to the Operators tab. */
function operatorTarget(id) {
  const target = detailTarget(String(id))
  return { ...target, query: { ...target.query, tab: 'operators' } }
}

function openOperator(id) {
  router.push(operatorTarget(id))
}

const operatorDetailId = computed(() =>
  isDetailView.value && !isNewOperator.value ? Number(entityId.value) : null,
)
const {
  data: operatorDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useAiOperator(operatorDetailId)

function onOperatorCreated(id) {
  if (id == null) closeDetail()
  else openOperator(id)
}
</script>

<template>
  <div v-if="isDetailView" class="ai-assistant-detail">
    <AiOperatorDetailView
      v-if="isNewOperator"
      :operator="null"
      @close="closeDetail"
      @created="onOperatorCreated"
    />

    <template v-else>
      <AiOperatorDetailView
        v-if="operatorDetail"
        :operator="operatorDetail"
        @close="closeDetail"
        @saved="closeDetail"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading…" @back="closeDetail" />
        <div class="detail-loading">
          <Skeleton height="1.5rem" width="40%" class="mb-3" />
          <Skeleton height="1rem" width="60%" class="mb-2" />
          <Skeleton height="1rem" width="55%" class="mb-2" />
          <Skeleton height="1rem" width="45%" class="mb-2" />
        </div>
      </template>

      <template v-else-if="isDetailError">
        <EntityDetailHeader title="Error" @back="closeDetail" />
        <div class="detail-content">
          <QueryErrorState :error="detailError" @retry="refetchDetail" />
        </div>
      </template>

      <template v-else>
        <EntityDetailHeader title="Not Found" @back="closeDetail" />
        <div class="detail-content">
          <p class="empty-message">AI operator not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve per-tab state -->
  <div v-show="!isDetailView" class="ai-assistant-section">
    <SectionHeader title="AI Assistant" icon="pi pi-microchip" />

    <Message
      v-if="showNotInitializedNotice"
      severity="warn"
      :closable="false"
      class="not-initialized-notice"
    >
      The AI assistant is not initialized on this server, so no skill or function is registered and
      no operator runs. Settings below can still be prepared. To start it, configure an AI provider
      in the server configuration file and restart the server.
    </Message>

    <Tabs v-model:value="activeTab" class="section-tabs">
      <TabList>
        <Tab value="operators">
          <i class="pi pi-compass tab-icon" />
          Operators
        </Tab>
        <Tab value="tasks">
          <i class="pi pi-list-check tab-icon" />
          AI Tasks
        </Tab>
        <Tab value="skills">
          <i class="pi pi-cog tab-icon" />
          Skills &amp; Functions
        </Tab>
        <Tab value="memory">
          <i class="pi pi-database tab-icon" />
          AI Memory
        </Tab>
        <Tab value="prompts">
          <i class="pi pi-bookmark tab-icon" />
          AI Prompts
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="operators">
          <AiOperatorsTab
            :detail-target="operatorTarget"
            @open="openOperator"
            @new="openDetail('new')"
          />
        </TabPanel>

        <TabPanel value="tasks">
          <AiTasksTab />
        </TabPanel>

        <TabPanel value="skills">
          <AiSkillsTab />
        </TabPanel>
        <TabPanel value="memory">
          <AiMemoryTab />
        </TabPanel>

        <TabPanel value="prompts">
          <AiPromptsTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.not-initialized-notice {
  margin: 0 1rem 0.75rem;
}

.ai-assistant-section,
.ai-assistant-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.section-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.tab-icon {
  margin-right: 0.375rem;
  font-size: 0.8125rem;
}

.detail-loading,
.detail-content {
  padding: 1rem;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
