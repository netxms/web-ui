<script setup>
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import ChatBotDetailView from '@/components/chat-bots/ChatBotDetailView.vue'
import { useChatBots, useChatBot, useDeleteChatBot } from '@/queries/useChatBotQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { chatBotStatus } from '@/utils/chatBotDisplay'
import { formatAgeCompact } from '@/utils/timeFormat'

const route = useRoute()
const router = useRouter()
const confirmDelete = useConfirmDelete()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

/** Bots are keyed by name; 'new' is the create sentinel. */
const isNewBot = computed(() => entityId.value === 'new')

function openNew() {
  router.push({
    name: route.name,
    params: { ...route.params, entityId: 'new' },
    query: route.query,
  })
}

const { data: botsData, isLoading, isFetching, isError, error, refetch } = useChatBots()
const bots = computed(() => botsData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('chat-bots', { view: { filterState } })
const filteredBots = computed(() => {
  if (!filterState.value.text) return bots.value
  const search = filterState.value.text.toLowerCase()
  return bots.value.filter(
    (b) =>
      (b.name ?? '').toLowerCase().includes(search) ||
      (b.description ?? '').toLowerCase().includes(search) ||
      (b.driverName ?? '').toLowerCase().includes(search),
  )
})

const columns = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 160 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 220 },
  { id: 'driverName', field: 'driverName', label: 'Driver', sortable: true, width: 110 },
  { id: 'status', field: 'driverInitialized', label: 'Status', sortable: true, width: 130 },
  { id: 'activeSessions', field: 'activeSessions', label: 'Sessions', sortable: true, width: 90 },
  {
    id: 'lastInboundMessageTime',
    field: 'lastInboundMessageTime',
    label: 'Last inbound',
    sortable: true,
    width: 130,
  },
  {
    id: 'errorMessage',
    field: 'errorMessage',
    label: 'Error message',
    sortable: false,
    width: 260,
  },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

/** The bot name is the route param, so a rename has to move the URL with it. */
function onSaved(name) {
  if (name !== entityId.value) openDetail(name)
}

const { mutateAsync: deleteBot } = useDeleteChatBot()

function menuItems(bot) {
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => openDetail(bot.name) },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => onDelete(bot),
    },
  ]
}

async function onDelete(bot) {
  const deleted = await confirmDelete({
    message: `Delete chat bot "${bot.name}"? Its notification channel is removed as well, and server actions using that channel will stop working.`,
    run: () => deleteBot(bot.name),
    successDetail: `Chat bot "${bot.name}" deleted.`,
    failureDetail: 'Failed to delete chat bot.',
  })
  if (deleted && isDetailView.value) closeDetail()
}

const botDetailName = computed(() =>
  isDetailView.value && !isNewBot.value ? entityId.value : null,
)
const {
  data: botDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useChatBot(botDetailName)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Chat Bots"
    icon="pi pi-comments"
    add-label="Add Bot"
    filter-placeholder="Filter chat bots..."
    count-noun="chat bot"
    :columns="columns"
    :rows="filteredBots"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No chat bots configured. A chat bot bridges a messaging platform to the AI assistant and registers a notification channel of the same name."
    :menu-items="menuItems"
    sort-field="name"
    :sort-order="1"
    storage-key="chat-bots"
    :target-for="(row) => detailTarget(row.name)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.name)"
  >
    <template #detail>
      <ChatBotDetailView
        v-if="isNewBot"
        :bot="null"
        @close="closeDetail"
        @created="(name) => openDetail(name)"
      />
      <ChatBotDetailView
        v-else-if="botDetail"
        :bot="botDetail"
        @close="closeDetail"
        @saved="onSaved"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Chat bot not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #cell="{ col, row }">
      <span v-if="col.id === 'name'" class="bot-name">{{ row.name }}</span>
      <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">{{
        row.description || '-'
      }}</span>
      <Tag v-else-if="col.id === 'driverName'" :value="row.driverName" severity="info" outlined />
      <span v-else-if="col.id === 'status'" class="status-badge" :class="chatBotStatus(row).class">
        <i :class="chatBotStatus(row).icon" />
        {{ chatBotStatus(row).label }}
      </span>
      <span v-else-if="col.id === 'activeSessions'">{{ row.activeSessions ?? 0 }}</span>
      <span
        v-else-if="col.id === 'lastInboundMessageTime'"
        :class="{ 'text-muted': !row.lastInboundMessageTime }"
        >{{ formatAgeCompact(row.lastInboundMessageTime) || 'Never' }}</span
      >
      <span v-else-if="col.id === 'errorMessage'" class="error-cell">{{
        row.errorMessage || ''
      }}</span>
    </template>
  </EntityListSection>
</template>

<style scoped>
.bot-name {
  font-weight: 500;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
}

.status-ok {
  color: var(--p-green-600);
}

.status-warn {
  color: var(--p-orange-600);
}

.status-error {
  color: var(--p-red-500);
}

.error-cell {
  color: var(--p-red-500);
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
