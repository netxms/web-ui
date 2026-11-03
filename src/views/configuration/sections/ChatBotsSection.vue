<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import ChatBotDetailView from '@/components/chat-bots/ChatBotDetailView.vue'
import { useChatBots, useChatBot, useDeleteChatBot } from '@/queries/useChatBotQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { chatBotStatus } from '@/utils/chatBotDisplay'
import { formatAgeCompact } from '@/utils/timeFormat'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

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

function onRowClick(row) {
  openDetail(row.name)
}

/** The bot name is the route param, so a rename has to move the URL with it. */
function onSaved(name) {
  if (name !== entityId.value) openDetail(name)
}

const contextMenu = ref()

const { mutate: deleteBot } = useDeleteChatBot()

const contextMenuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => openDetail(contextMenu.value.contextData.name),
  },
  { separator: true },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => confirmDelete(contextMenu.value.contextData),
  },
])

function confirmDelete(bot) {
  confirm.require({
    message: `Delete chat bot "${bot.name}"? Its notification channel is removed as well, and server actions using that channel will stop working.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteBot(bot.name, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Chat bot "${bot.name}" deleted.`,
            life: 3000,
          })
          if (isDetailView.value) closeDetail()
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete chat bot.',
            life: 5000,
          })
        },
      })
    },
  })
}

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const botDetailName = computed(() =>
  isDetailView.value && !isNewBot.value ? entityId.value : null,
)
const {
  data: botDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useChatBot(botDetailName)
</script>

<template>
  <div v-if="isDetailView" class="chat-bots-detail">
    <ChatBotDetailView
      v-if="isNewBot"
      :bot="null"
      @close="closeDetail"
      @created="(name) => openDetail(name)"
    />

    <template v-else>
      <ChatBotDetailView v-if="botDetail" :bot="botDetail" @close="closeDetail" @saved="onSaved" />

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
          <p class="empty-message">Chat bot not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve filter state -->
  <div v-show="!isDetailView" class="chat-bots-section">
    <SectionHeader title="Chat Bots" icon="pi pi-comments">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          label="Add Bot"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openNew"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter chat bots..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredBots.length, 'chat bot')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredBots"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="chat-bots"
      class="bots-table"
      :target-for="(row) => detailTarget(row.name)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'name'" class="bot-name">{{ row.name }}</span>
        <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">{{
          row.description || '-'
        }}</span>
        <Tag v-else-if="col.id === 'driverName'" :value="row.driverName" severity="info" outlined />
        <span
          v-else-if="col.id === 'status'"
          class="status-badge"
          :class="chatBotStatus(row).class"
        >
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
        <Button
          v-else-if="col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onActionsClick($event, row)"
        />
      </template>
      <template #empty>
        <div class="empty-message">
          No chat bots configured. A chat bot bridges a messaging platform to the AI assistant and
          registers a notification channel of the same name.
        </div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.chat-bots-section,
.chat-bots-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.section-loading,
.detail-loading {
  padding: 1rem;
}

.bots-table {
  flex: 1;
  min-height: 0;
}

.bots-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

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

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
  max-width: 32rem;
  margin: 0 auto;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}
</style>
