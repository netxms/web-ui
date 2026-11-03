<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Tag from 'primevue/tag'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import MutationErrorState from '@/components/common/MutationErrorState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import UserDetailView from '@/components/users/UserDetailView.vue'
import GroupDetailView from '@/components/users/GroupDetailView.vue'
import ChangePasswordDialog from '@/components/users/ChangePasswordDialog.vue'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { useUsersTableStore, useGroupsTableStore } from '@/stores/usersGroupsTableStore'
import {
  useUsers,
  useUser,
  useUserGroups,
  useUserGroup,
  useCreateUser,
  useCreateUserGroup,
  useUpdateUser,
  useDeleteUser,
  useDeleteUserGroup,
} from '@/queries/useUserQueries'
import { formatDateTime } from '@/utils/timeFormat'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const { entityId, isDetailView } = useEntityDetail()
const usersTableStore = useUsersTableStore()
const groupsTableStore = useGroupsTableStore()

// Keeps both /users/:id and /user-groups/:id from firing for the same id.
const entityType = computed(() => route.query.entityType ?? null)
const isUserDetail = computed(() => entityType.value === 'user')
const isGroupDetail = computed(() => entityType.value === 'group')

/** Tab the detail pane should open on, set by actions that target one ('tokens'). */
const detailTab = computed(() => route.query.detailTab ?? 'general')

/**
 * Also drives the rows' open-in-new-tab hrefs. `detailTab` is dropped unless asked for, or one
 * "Issue Authentication Token" would pin every later row to the Tokens tab.
 */
function detailTarget(id, entityType, tab) {
  const query = { ...route.query, entityType }
  delete query.detailTab
  if (tab) query.detailTab = tab
  return {
    name: route.name,
    params: { ...route.params, entityId: String(id) },
    query,
  }
}

function openUserDetail(id, tab) {
  router.push(detailTarget(id, 'user', tab))
}

function openGroupDetail(id) {
  router.push(detailTarget(id, 'group'))
}

function closeDetail() {
  const params = { ...route.params }
  delete params.entityId
  const query = { ...route.query }
  delete query.entityType
  delete query.detailTab
  router.push({ name: route.name, params, query })
}

const activeTab = ref(route.query.tab ?? 'users')

watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})
watch(
  () => route.query.tab,
  (tab) => {
    if (tab && tab !== activeTab.value) activeTab.value = tab
  },
)

const userFilter = ref({ text: '', tokens: [] })
const groupFilter = ref({ text: '', tokens: [] })

useWorkingState('users-groups', { view: { activeTab, userFilter, groupFilter } })
if (route.query.tab) activeTab.value = route.query.tab

const {
  data: usersData,
  isLoading: isUsersLoading,
  isFetching: isUsersFetching,
  isError: isUsersError,
  error: usersError,
  refetch: refetchUsers,
} = useUsers()
const users = computed(() => usersData.value ?? [])

const {
  data: groupsData,
  isLoading: isGroupsLoading,
  isFetching: isGroupsFetching,
  isError: isGroupsError,
  error: groupsError,
  refetch: refetchGroups,
} = useUserGroups()
const groups = computed(() => groupsData.value ?? [])

const AUTH_METHOD_LABELS = {
  0: 'Local',
  1: 'RADIUS',
  2: 'Certificate',
  3: 'Cert/Local',
  4: 'Cert/RADIUS',
  5: 'LDAP',
}

function formatAuthMethod(method) {
  return AUTH_METHOD_LABELS[method] ?? `Unknown (${method})`
}

function isUserDisabled(user) {
  return user.flags?.disabled ?? false
}

function canChangePassword(user) {
  return user.authMethod === 0 || user.authMethod === 3
}

function formatLastLogin(ts) {
  return formatDateTime(ts, { unixSeconds: true }) ?? 'Never'
}

function formatCreated(ts) {
  return formatDateTime(ts, { unixSeconds: true }) ?? '-'
}

// Precomputed labels for display and sorting
const usersView = computed(() =>
  users.value.map((u) => ({
    ...u,
    sourceLabel: u.flags?.ldapUser ? 'LDAP' : 'Local',
    authMethodLabel: formatAuthMethod(u.authMethod),
    statusLabel: isUserDisabled(u) ? 'Disabled' : 'Active',
    lastLoginLabel: formatLastLogin(u.lastLogin),
    createdLabel: formatCreated(u.created),
  })),
)

const groupsView = computed(() =>
  groups.value.map((g) => ({
    ...g,
    sourceLabel: g.flags?.ldapUser ? 'LDAP' : 'Local',
    createdLabel: formatCreated(g.created),
  })),
)

const filteredUsers = computed(() => {
  if (!userFilter.value.text) return usersView.value
  const search = userFilter.value.text.toLowerCase()
  return usersView.value.filter(
    (u) =>
      (u.name ?? '').toLowerCase().includes(search) ||
      (u.fullName ?? '').toLowerCase().includes(search) ||
      (u.email ?? '').toLowerCase().includes(search),
  )
})

const filteredGroups = computed(() => {
  if (!groupFilter.value.text) return groupsView.value
  const search = groupFilter.value.text.toLowerCase()
  return groupsView.value.filter(
    (g) =>
      (g.name ?? '').toLowerCase().includes(search) ||
      (g.description ?? '').toLowerCase().includes(search),
  )
})

const actionLabel = computed(() => (activeTab.value === 'users' ? 'Add User' : 'Add Group'))

const showCreateUser = ref(false)
const showCreateGroup = ref(false)
const newEntityName = ref('')
const createUserError = ref(null)
const createGroupError = ref(null)

const { mutate: createUser, isPending: isCreatingUser } = useCreateUser()
const { mutate: createUserGroup, isPending: isCreatingGroup } = useCreateUserGroup()

function openCreateDialog() {
  newEntityName.value = ''
  if (activeTab.value === 'users') {
    createUserError.value = null
    showCreateUser.value = true
  } else {
    createGroupError.value = null
    showCreateGroup.value = true
  }
}

function createErrorMessage(err, name, kind) {
  switch (err.status) {
    case 400:
      return 'Invalid or missing name.'
    case 409:
      return `A ${kind} named "${name}" already exists.`
    case 500:
      return `Server error while creating the ${kind}. Please try again.`
    default:
      return err.message ?? `Failed to create ${kind}.`
  }
}

function confirmCreateUser() {
  const name = newEntityName.value.trim()
  if (!name) return
  createUserError.value = null
  createUser(name, {
    onSuccess: (user) => {
      showCreateUser.value = false
      openUserDetail(user.id)
    },
    onError: (err) => {
      createUserError.value = createErrorMessage(err, name, 'user')
    },
  })
}

function confirmCreateGroup() {
  const name = newEntityName.value.trim()
  if (!name) return
  createGroupError.value = null
  createUserGroup(name, {
    onSuccess: (group) => {
      showCreateGroup.value = false
      openGroupDetail(group.id)
    },
    onError: (err) => {
      createGroupError.value = createErrorMessage(err, name, 'group')
    },
  })
}

const contextMenu = ref()

const { mutate: deleteUser } = useDeleteUser()
const { mutate: deleteUserGroup } = useDeleteUserGroup()
const { mutate: updateUser } = useUpdateUser()

function toggleUserEnabled(user) {
  const disabled = !(user.flags?.disabled ?? false)
  updateUser(
    { userId: user.id, data: { flags: { ...user.flags, disabled } } },
    {
      onSuccess: () => {
        toast.add({
          severity: 'success',
          summary: 'Updated',
          detail: `User "${user.name}" ${disabled ? 'disabled' : 'enabled'}.`,
          life: 3000,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Failed',
          detail: err.message ?? `Failed to ${disabled ? 'disable' : 'enable'} user.`,
          life: 5000,
        })
      },
    },
  )
}

const showPasswordDialog = ref(false)
const passwordDialogUserId = ref(null)

function openChangePassword(user) {
  passwordDialogUserId.value = user.id
  showPasswordDialog.value = true
}

function confirmDeleteUser(user) {
  confirm.require({
    message: `Delete user "${user.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteUser(user.id)
    },
  })
}

function confirmDeleteGroup(group) {
  confirm.require({
    message: `Delete group "${group.name}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteUserGroup(group.id)
    },
  })
}

const userContextMenuItems = computed(() => {
  const user = contextMenu.value?.contextData
  const items = [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => openUserDetail(user?.id),
    },
    {
      label: user?.flags?.disabled ? 'Enable' : 'Disable',
      icon: user?.flags?.disabled ? 'pi pi-play' : 'pi pi-pause',
      command: () => toggleUserEnabled(user),
    },
  ]
  if (user && canChangePassword(user)) {
    items.push({
      label: 'Change Password',
      icon: 'pi pi-lock',
      command: () => openChangePassword(user),
    })
  }
  items.push(
    { separator: true },
    {
      // The Tokens tab owns the expiry/description form.
      label: 'Issue Authentication Token',
      icon: 'pi pi-key',
      command: () => openUserDetail(user?.id, 'tokens'),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDeleteUser(user),
    },
  )
  return items
})

const groupContextMenuItems = computed(() => [
  {
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => openGroupDetail(contextMenu.value.contextData.id),
  },
  { separator: true },
  {
    label: 'Delete',
    icon: 'pi pi-trash',
    class: 'p-menuitem-danger',
    command: () => {
      confirmDeleteGroup(contextMenu.value.contextData)
    },
  },
])

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

function onUserRowClick(row) {
  openUserDetail(row.id)
}

function onGroupRowClick(row) {
  openGroupDetail(row.id)
}

const USER_ALL_COLUMNS = [
  { id: 'name', field: 'name', label: 'Login Name', sortable: true, width: 170, mandatory: true },
  { id: 'fullName', field: 'fullName', label: 'Full Name', sortable: true, width: 180 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 200 },
  { id: 'email', field: 'email', label: 'Email', sortable: true, width: 200 },
  {
    id: 'source',
    field: 'sourceLabel',
    label: 'Source',
    sortable: true,
    width: 90,
    mandatory: true,
  },
  {
    id: 'authMethod',
    field: 'authMethodLabel',
    label: 'Authentication',
    sortable: true,
    width: 140,
  },
  { id: 'flags', field: 'statusLabel', label: 'Status', sortable: true, width: 110 },
  { id: 'guid', field: 'guid', label: 'GUID', sortable: false, width: 260 },
  { id: 'ldapDn', field: 'ldapDn', label: 'LDAP DN', sortable: false, width: 260 },
  { id: 'lastLogin', field: 'lastLoginLabel', label: 'Last Login', sortable: true, width: 160 },
  { id: 'created', field: 'createdLabel', label: 'Created', sortable: true, width: 160 },
]

const GROUP_ALL_COLUMNS = [
  { id: 'name', field: 'name', label: 'Group Name', sortable: true, width: 170, mandatory: true },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 260 },
  { id: 'members', field: 'members', label: 'Members', sortable: true, width: 100 },
  {
    id: 'source',
    field: 'sourceLabel',
    label: 'Source',
    sortable: true,
    width: 90,
    mandatory: true,
  },
  { id: 'guid', field: 'guid', label: 'GUID', sortable: false, width: 260 },
  { id: 'ldapDn', field: 'ldapDn', label: 'LDAP DN', sortable: false, width: 260 },
  { id: 'created', field: 'createdLabel', label: 'Created', sortable: true, width: 160 },
]

const ACTIONS_COLUMN = { id: 'actions', field: 'actions', label: '', width: 48, reorderable: false }

const visibleUserColumns = computed(() => [
  ...usersTableStore.shownColumns(USER_ALL_COLUMNS),
  ACTIONS_COLUMN,
])

const visibleGroupColumns = computed(() => [
  ...groupsTableStore.shownColumns(GROUP_ALL_COLUMNS),
  ACTIONS_COLUMN,
])

const {
  data: userDetail,
  isLoading: isUserDetailLoading,
  isError: isUserDetailError,
  error: userDetailError,
  refetch: refetchUserDetail,
} = useUser(computed(() => (isUserDetail.value ? entityId.value : null)))
const {
  data: groupDetail,
  isLoading: isGroupDetailLoading,
  isError: isGroupDetailError,
  error: groupDetailError,
  refetch: refetchGroupDetail,
} = useUserGroup(computed(() => (isGroupDetail.value ? entityId.value : null)))

const isDetailLoading = computed(() =>
  isUserDetail.value ? isUserDetailLoading.value : isGroupDetailLoading.value,
)
const isDetailError = computed(() =>
  isUserDetail.value ? isUserDetailError.value : isGroupDetailError.value,
)
const detailError = computed(() =>
  isUserDetail.value ? userDetailError.value : groupDetailError.value,
)
function retryDetail() {
  if (isUserDetail.value) refetchUserDetail()
  else refetchGroupDetail()
}
</script>

<template>
  <div v-if="isDetailView" class="users-groups-detail">
    <UserDetailView
      v-if="userDetail"
      :user="userDetail"
      :initial-tab="detailTab"
      @close="closeDetail"
    />

    <GroupDetailView v-else-if="groupDetail" :group="groupDetail" @close="closeDetail" />

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
        <QueryErrorState :error="detailError" @retry="retryDetail" />
      </div>
    </template>

    <template v-else>
      <EntityDetailHeader title="Not Found" @back="closeDetail" />
      <div class="detail-content">
        <p class="empty-message">Entity not found.</p>
      </div>
    </template>
  </div>

  <div v-else class="users-groups-section">
    <SectionHeader title="Users & Groups" icon="pi pi-users">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="
            () => {
              refetchUsers()
              refetchGroups()
            }
          "
        />
        <Button
          :label="actionLabel"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreateDialog"
        />
      </template>
    </SectionHeader>

    <Tabs v-model:value="activeTab" class="section-tabs">
      <TabList>
        <Tab value="users">
          <i class="pi pi-user tab-icon" />
          Users
        </Tab>
        <Tab value="groups">
          <i class="pi pi-users tab-icon" />
          Groups
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="users">
          <div class="tab-content">
            <RefetchIndicator :is-fetching="isUsersFetching && !isUsersLoading" />

            <div class="section-toolbar">
              <SmartFilterInput
                v-model="userFilter"
                placeholder="Filter users..."
                class="filter-input"
              />
              <span v-if="!isUsersLoading" class="item-count">
                {{ $plural(filteredUsers.length, 'user') }}
              </span>
              <ColumnChooser
                v-model="usersTableStore.visibleColumnIds"
                v-model:order="usersTableStore.columnOrder"
                :columns="USER_ALL_COLUMNS"
              />
            </div>

            <div v-if="isUsersLoading" class="section-loading">
              <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
            </div>

            <AppTable
              v-else
              :columns="visibleUserColumns"
              :rows="filteredUsers"
              :error="isUsersError ? usersError : null"
              :page-size="50"
              :page-size-options="[25, 50, 100, 200, 500]"
              storage-key="users"
              reorderable
              striped
              column-borders
              resize-fit
              sort-field="name"
              :sort-order="1"
              class="section-table"
              :target-for="(row) => detailTarget(row.id, 'user')"
              @row-click="onUserRowClick"
              @row-contextmenu="onRowContextMenu"
              @column-move="usersTableStore.moveColumn(USER_ALL_COLUMNS, $event)"
              @retry="refetchUsers"
            >
              <template #cell="{ col, row }">
                <span v-if="col.id === 'name'" class="entity-name">{{ row.name }}</span>
                <span v-else-if="col.id === 'fullName'">{{ row.fullName || '-' }}</span>
                <span
                  v-else-if="col.id === 'description'"
                  :class="{ 'text-muted': !row.description }"
                >
                  {{ row.description || '-' }}
                </span>
                <span v-else-if="col.id === 'email'" :class="{ 'text-muted': !row.email }">
                  {{ row.email || '-' }}
                </span>
                <Tag
                  v-else-if="col.id === 'source'"
                  :value="row.sourceLabel"
                  severity="secondary"
                  outlined
                />
                <Tag
                  v-else-if="col.id === 'authMethod'"
                  :value="row.authMethodLabel"
                  severity="secondary"
                  outlined
                />
                <Tag
                  v-else-if="col.id === 'flags'"
                  :value="row.statusLabel"
                  :severity="isUserDisabled(row) ? 'danger' : 'success'"
                  outlined
                />
                <span v-else-if="col.id === 'guid'" class="mono-text">{{ row.guid || '-' }}</span>
                <span v-else-if="col.id === 'ldapDn'" class="mono-text">{{
                  row.ldapDn || '-'
                }}</span>
                <span v-else-if="col.id === 'lastLogin'">{{ row.lastLoginLabel }}</span>
                <span v-else-if="col.id === 'created'">{{ row.createdLabel }}</span>
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
                <div class="empty-message">No users found.</div>
              </template>
            </AppTable>
          </div>
        </TabPanel>

        <TabPanel value="groups">
          <div class="tab-content">
            <RefetchIndicator :is-fetching="isGroupsFetching && !isGroupsLoading" />

            <div class="section-toolbar">
              <SmartFilterInput
                v-model="groupFilter"
                placeholder="Filter groups..."
                class="filter-input"
              />
              <span v-if="!isGroupsLoading" class="item-count">
                {{ $plural(filteredGroups.length, 'group') }}
              </span>
              <ColumnChooser
                v-model="groupsTableStore.visibleColumnIds"
                v-model:order="groupsTableStore.columnOrder"
                :columns="GROUP_ALL_COLUMNS"
              />
            </div>

            <div v-if="isGroupsLoading" class="section-loading">
              <Skeleton v-for="i in 6" :key="i" height="2rem" class="mb-2" />
            </div>

            <AppTable
              v-else
              :columns="visibleGroupColumns"
              :rows="filteredGroups"
              :error="isGroupsError ? groupsError : null"
              :page-size="50"
              :page-size-options="[25, 50, 100, 200, 500]"
              storage-key="groups"
              reorderable
              striped
              column-borders
              resize-fit
              sort-field="name"
              :sort-order="1"
              class="section-table"
              :target-for="(row) => detailTarget(row.id, 'group')"
              @row-click="onGroupRowClick"
              @row-contextmenu="onRowContextMenu"
              @column-move="groupsTableStore.moveColumn(GROUP_ALL_COLUMNS, $event)"
              @retry="refetchGroups"
            >
              <template #cell="{ col, row }">
                <span v-if="col.id === 'name'" class="entity-name">{{ row.name }}</span>
                <span
                  v-else-if="col.id === 'description'"
                  :class="{ 'text-muted': !row.description }"
                  >{{ row.description || '-' }}</span
                >
                <span v-else-if="col.id === 'members'" class="members-count">
                  {{ row.members?.length ?? 0 }}
                </span>
                <Tag
                  v-else-if="col.id === 'source'"
                  :value="row.sourceLabel"
                  severity="secondary"
                  outlined
                />
                <span v-else-if="col.id === 'guid'" class="mono-text">{{ row.guid || '-' }}</span>
                <span v-else-if="col.id === 'ldapDn'" class="mono-text">{{
                  row.ldapDn || '-'
                }}</span>
                <span v-else-if="col.id === 'created'">{{ row.createdLabel }}</span>
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
                <div class="empty-message">No groups found.</div>
              </template>
            </AppTable>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <EntityContextMenu
      ref="contextMenu"
      :items="activeTab === 'users' ? userContextMenuItems : groupContextMenuItems"
    />

    <ChangePasswordDialog
      v-if="passwordDialogUserId"
      v-model:visible="showPasswordDialog"
      :user-id="passwordDialogUserId"
    />

    <Dialog
      v-model:visible="showCreateUser"
      header="New User"
      modal
      :style="{ width: '24rem' }"
      @keydown.enter="confirmCreateUser"
    >
      <div class="create-dialog-body">
        <MutationErrorState :error="createUserError" class="form-error" />
        <label for="new-user-name" class="create-dialog-label">Login Name</label>
        <InputText
          id="new-user-name"
          v-model="newEntityName"
          placeholder="Enter login name"
          autofocus
          class="create-dialog-input"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showCreateUser = false" />
        <Button
          label="Create"
          severity="primary"
          :disabled="!newEntityName.trim()"
          :loading="isCreatingUser"
          @click="confirmCreateUser"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showCreateGroup"
      header="New Group"
      modal
      :style="{ width: '24rem' }"
      @keydown.enter="confirmCreateGroup"
    >
      <div class="create-dialog-body">
        <MutationErrorState :error="createGroupError" class="form-error" />
        <label for="new-group-name" class="create-dialog-label">Group Name</label>
        <InputText
          id="new-group-name"
          v-model="newEntityName"
          placeholder="Enter group name"
          autofocus
          class="create-dialog-input"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showCreateGroup = false" />
        <Button
          label="Create"
          severity="primary"
          :disabled="!newEntityName.trim()"
          :loading="isCreatingGroup"
          @click="confirmCreateGroup"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.users-groups-section,
.users-groups-detail {
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

.tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.tab-icon {
  margin-right: 0.375rem;
  font-size: 0.8125rem;
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

.section-table {
  flex: 1;
  min-height: 0;
}

.section-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.entity-name {
  font-weight: 500;
}

.members-count {
  font-variant-numeric: tabular-nums;
}

.mono-text {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.create-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.25rem 0 0.5rem;
}

.create-dialog-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.create-dialog-input {
  width: 100%;
}

.form-error {
  margin-bottom: 0;
}
</style>
