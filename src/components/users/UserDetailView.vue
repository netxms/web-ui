<script setup>
import { formatDateTime } from '@/utils/timeFormat'
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Dialog from 'primevue/dialog'
import MultiSelect from 'primevue/multiselect'
import Tag from 'primevue/tag'
import DatePicker from 'primevue/datepicker'
import Message from 'primevue/message'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { SYSTEM_RIGHTS_CATEGORIES } from '@/auth/systemRights'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import ChangePasswordDialog from '@/components/users/ChangePasswordDialog.vue'
import CustomAttributesEditor from '@/components/users/CustomAttributesEditor.vue'
import {
  useUpdateUser,
  useUserGroups,
  useUpdateUserGroup,
  useUserTwoFactorBindings,
  useBindUserTwoFactorMethod,
  useDeleteUserTwoFactorBinding,
  useUserTokens,
  useCreateUserToken,
  useDeleteUserToken,
} from '@/queries/useUserQueries'
import { useTwoFactorMethods } from '@/queries/useTwoFactorQueries'

const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
  /** Tab to open on: lets a context-menu action land straight on Tokens or 2FA. */
  initialTab: {
    type: String,
    default: 'general',
  },
})

const emit = defineEmits(['close'])

const confirm = useConfirm()
const toast = useToast()

const AUTH_METHODS = [
  { value: 0, label: 'Local password' },
  { value: 1, label: 'RADIUS password' },
  { value: 2, label: 'Certificate' },
  { value: 3, label: 'Certificate or local password' },
  { value: 4, label: 'Certificate or RADIUS password' },
  { value: 5, label: 'LDAP password' },
]

const CERT_MAPPING_METHODS = [
  { value: 0, label: 'Subject' },
  { value: 1, label: 'Public key' },
  { value: 2, label: 'Common name' },
  { value: 3, label: 'Template ID' },
]

function buildForm(user) {
  const uf = user.flags ?? {}
  return {
    name: user.name ?? '',
    fullName: user.fullName ?? '',
    email: user.email ?? '',
    phoneNumber: user.phoneNumber ?? '',
    description: user.description ?? '',
    authMethod: user.authMethod ?? 0,
    certMappingMethod: user.certMappingMethod ?? 0,
    certMappingData: user.certMappingData ?? '',
    flags: {
      disabled: uf.disabled ?? false,
      changePassword: uf.changePassword ?? false,
      cannotChangePassword: uf.cannotChangePassword ?? false,
      intruderLockout: uf.intruderLockout ?? false,
      passwordNeverExpires: uf.passwordNeverExpires ?? false,
      ldapUser: uf.ldapUser ?? false,
      syncException: uf.syncException ?? false,
      closeOtherSessions: uf.closeOtherSessions ?? false,
      tokenAuthOnly: uf.tokenAuthOnly ?? false,
      twoFAExempt: uf.twoFAExempt ?? false,
      twoFAEnforce: uf.twoFAEnforce ?? false,
      serviceAccount: uf.serviceAccount ?? false,
    },
    // 64-bit mask (bits 0-58), hence BigInt
    systemRights: BigInt(user.systemRights ?? 0),
    attributes: { ...user.attributes },
  }
}

function attributesEqual(a, b) {
  const aKeys = Object.keys(a ?? {})
  const bKeys = Object.keys(b ?? {})
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b?.[key])
}

const form = ref(buildForm(props.user))

watch(
  () => props.user,
  (user) => {
    form.value = buildForm(user)
  },
  { deep: true },
)

function hasRight(bitPos) {
  return (form.value.systemRights & (1n << BigInt(bitPos))) !== 0n
}

function setRight(bitPos, val) {
  const mask = 1n << BigInt(bitPos)
  if (val) {
    form.value.systemRights |= mask
  } else {
    form.value.systemRights &= ~mask
  }
}

const isDirty = computed(() => {
  const u = props.user
  const f = form.value
  const uf = u.flags ?? {}
  return (
    f.name !== (u.name ?? '') ||
    f.fullName !== (u.fullName ?? '') ||
    f.email !== (u.email ?? '') ||
    f.phoneNumber !== (u.phoneNumber ?? '') ||
    f.description !== (u.description ?? '') ||
    f.authMethod !== (u.authMethod ?? 0) ||
    f.certMappingMethod !== (u.certMappingMethod ?? 0) ||
    f.certMappingData !== (u.certMappingData ?? '') ||
    f.systemRights !== BigInt(u.systemRights ?? 0) ||
    Object.keys(f.flags).some((key) => f.flags[key] !== (uf[key] ?? false)) ||
    !attributesEqual(f.attributes, u.attributes)
  )
})

const rightsFilter = ref('')
const filteredCategories = computed(() => {
  if (!rightsFilter.value) return SYSTEM_RIGHTS_CATEGORIES
  const search = rightsFilter.value.toLowerCase()
  return SYSTEM_RIGHTS_CATEGORIES.map((cat) => ({
    ...cat,
    rights: cat.rights.filter((r) => r.label.toLowerCase().includes(search)),
  })).filter((cat) => cat.rights.length > 0)
})

const activeTab = ref(props.initialTab)

// Switching to a different user through the same detail pane re-applies the requested tab.
watch(
  () => [props.user.id, props.initialTab],
  ([, tab]) => {
    activeTab.value = tab
  },
)

const { mutate: updateUser, isPending: isSaving } = useUpdateUser()

function save() {
  const data = { ...form.value }
  updateUser({ userId: props.user.id, data }, { onSuccess: () => emit('close') })
}

function discard() {
  form.value = buildForm(props.user)
}

const showPasswordDialog = ref(false)

function openPasswordDialog() {
  showPasswordDialog.value = true
}

const { data: groupsData } = useUserGroups()
const { mutate: updateUserGroup, isPending: isGroupUpdating } = useUpdateUserGroup()

const userGroups = computed(() =>
  (groupsData.value ?? []).filter((g) => (g.members ?? []).includes(props.user.id)),
)

const availableGroupsToJoin = computed(() => {
  const memberOf = new Set(userGroups.value.map((g) => g.id))
  return (groupsData.value ?? []).filter((g) => !memberOf.has(g.id))
})

const selectedGroup = ref(null)
const showAddGroupsDialog = ref(false)
const addGroupsSelection = ref([])

function openAddGroupsDialog() {
  addGroupsSelection.value = []
  showAddGroupsDialog.value = true
}

function confirmAddGroups() {
  const pending = addGroupsSelection.value.map((groupId) => {
    const group = (groupsData.value ?? []).find((g) => g.id === groupId)
    if (!group) return Promise.resolve()
    const members = [...(group.members ?? []), props.user.id]
    return new Promise((resolve) => {
      updateUserGroup({ groupId, data: { members } }, { onSuccess: resolve, onError: resolve })
    })
  })
  Promise.all(pending).then(() => {
    showAddGroupsDialog.value = false
  })
}

function removeFromGroup() {
  if (!selectedGroup.value) return
  const group = selectedGroup.value
  const members = (group.members ?? []).filter((id) => id !== props.user.id)
  updateUserGroup(
    { groupId: group.id, data: { members } },
    {
      onSuccess: () => {
        selectedGroup.value = null
      },
    },
  )
}

const { data: bindingsData, isLoading: isBindingsLoading } = useUserTwoFactorBindings(
  computed(() => props.user.id),
)
const bindings = computed(() => bindingsData.value ?? [])

const { data: twoFAMethodsData } = useTwoFactorMethods()

const availableMethodsToAdd = computed(() => {
  const bound = new Set((bindings.value ?? []).map((b) => b.methodName))
  return (twoFAMethodsData.value ?? []).filter((m) => !bound.has(m.name))
})

const selectedBinding = ref(null)
const showAdd2FADialog = ref(false)
const add2FASelection = ref(null)

function openAdd2FADialog() {
  add2FASelection.value = null
  showAdd2FADialog.value = true
}

const { mutate: bindMethod, isPending: isBinding } = useBindUserTwoFactorMethod()
const { mutate: deleteBinding, isPending: isDeletingBinding } = useDeleteUserTwoFactorBinding()

function confirmAdd2FA() {
  if (!add2FASelection.value) return
  bindMethod(
    { userId: props.user.id, methodName: add2FASelection.value },
    {
      onSuccess: () => {
        showAdd2FADialog.value = false
      },
    },
  )
}

function deleteSelectedBinding() {
  if (!selectedBinding.value) return
  deleteBinding(
    { userId: props.user.id, methodName: selectedBinding.value.methodName },
    {
      onSuccess: () => {
        selectedBinding.value = null
      },
    },
  )
}

function driverChipClass(driver) {
  const map = { TOTP: 'driver-totp', Message: 'driver-message' }
  return map[driver] ?? 'driver-other'
}

const { data: tokensData, isLoading: isTokensLoading } = useUserTokens(
  computed(() => props.user.id),
)
const tokens = computed(() => tokensData.value ?? [])

const selectedToken = ref(null)
const showIssueTokenDialog = ref(false)
const issuedToken = ref(null)
const newTokenDescription = ref('')
const newTokenExpiresAt = ref(null)

function defaultTokenExpiry() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d
}

function openIssueTokenDialog() {
  newTokenDescription.value = ''
  newTokenExpiresAt.value = defaultTokenExpiry()
  issuedToken.value = null
  showIssueTokenDialog.value = true
}

function closeIssueTokenDialog() {
  showIssueTokenDialog.value = false
}

const { mutate: createToken, isPending: isCreatingToken } = useCreateUserToken()
const { mutate: deleteToken, isPending: isDeletingToken } = useDeleteUserToken()

function confirmIssueToken() {
  const validFor = Math.max(1, Math.round((newTokenExpiresAt.value.getTime() - Date.now()) / 1000))
  createToken(
    {
      userId: props.user.id,
      data: {
        validFor,
        persistent: true,
        description: newTokenDescription.value,
      },
    },
    {
      onSuccess: (result) => {
        issuedToken.value = result
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Issue Failed',
          detail: err.message ?? 'Failed to issue token.',
          life: 5000,
        })
      },
    },
  )
}

function copyTokenValue() {
  if (!issuedToken.value?.value) return
  navigator.clipboard.writeText(issuedToken.value.value).then(() => {
    toast.add({
      severity: 'success',
      summary: 'Copied',
      detail: 'Token value copied to clipboard.',
      life: 2500,
    })
  })
}

function revokeSelectedToken() {
  if (!selectedToken.value) return
  const token = selectedToken.value
  confirm.require({
    message: `Revoke token "${token.description || token.id}"? This cannot be undone.`,
    header: 'Confirm Revoke',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Revoke',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteToken(
        { userId: props.user.id, tokenId: token.id },
        {
          onSuccess: () => {
            selectedToken.value = null
            toast.add({
              severity: 'success',
              summary: 'Revoked',
              detail: 'Token revoked.',
              life: 3000,
            })
          },
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Revoke Failed',
              detail: err.message ?? 'Failed to revoke token.',
              life: 5000,
            })
          },
        },
      )
    },
  })
}
</script>

<template>
  <div class="user-detail">
    <EntityDetailHeader :title="user.fullName || user.name" subtitle="User" @back="emit('close')">
      <template #actions>
        <Button
          label="Change Password"
          icon="pi pi-lock"
          size="small"
          severity="secondary"
          text
          @click="openPasswordDialog"
        />
        <Button
          label="Discard"
          icon="pi pi-times"
          size="small"
          severity="secondary"
          text
          :disabled="!isDirty || isSaving"
          @click="discard"
        />
        <Button
          label="Save"
          icon="pi pi-check"
          size="small"
          severity="primary"
          :disabled="!isDirty || isSaving"
          :loading="isSaving"
          @click="save"
        />
      </template>
    </EntityDetailHeader>

    <Tabs v-model:value="activeTab" class="detail-tabs">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="2fa">2FA Methods</Tab>
        <Tab value="groups">Group Membership</Tab>
        <Tab value="tokens">Tokens</Tab>
        <Tab value="rights">System Rights</Tab>
        <Tab value="attributes">Custom Attributes</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="detail-cards-grid">
            <Message
              v-if="user.flags?.ldapUser"
              severity="warn"
              :closable="false"
              class="ldap-message"
            >
              This user is synchronized from LDAP. Changes to login name, full name, email, phone
              number, and description will be overwritten on next synchronization.
            </Message>
            <DetailCard title="Identity">
              <div class="form-field">
                <label for="f-name">Login Name</label>
                <InputText id="f-name" v-model="form.name" class="form-input" />
              </div>
              <div class="form-field">
                <label for="f-fullname">Full Name</label>
                <InputText id="f-fullname" v-model="form.fullName" class="form-input" />
              </div>
              <div class="form-field">
                <label for="f-email">Email</label>
                <InputText id="f-email" v-model="form.email" class="form-input" />
              </div>
              <div class="form-field">
                <label for="f-phone">Phone Number</label>
                <InputText id="f-phone" v-model="form.phoneNumber" class="form-input" />
              </div>
              <div class="form-field">
                <label for="f-desc">Description</label>
                <InputText id="f-desc" v-model="form.description" class="form-input" />
              </div>
            </DetailCard>

            <DetailCard title="Authentication">
              <div class="form-field">
                <label for="f-authmethod">Authentication Method</label>
                <Select
                  id="f-authmethod"
                  v-model="form.authMethod"
                  :options="AUTH_METHODS"
                  option-label="label"
                  option-value="value"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label for="f-certmap">Certificate Mapping</label>
                <Select
                  id="f-certmap"
                  v-model="form.certMappingMethod"
                  :options="CERT_MAPPING_METHODS"
                  option-label="label"
                  option-value="value"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label for="f-certdata">Mapping Data</label>
                <InputText id="f-certdata" v-model="form.certMappingData" class="form-input" />
              </div>
            </DetailCard>

            <DetailCard title="Account Options" :wide="true">
              <div class="options-grid">
                <label class="option-row" for="flag-disabled">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-disabled"
                      v-model="form.flags.disabled"
                      :binary="true"
                    />
                  </span>
                  Account disabled
                </label>
                <label class="option-row" for="flag-tokenauth">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-tokenauth"
                      v-model="form.flags.tokenAuthOnly"
                      :binary="true"
                    />
                  </span>
                  Allow only token-based authentication
                </label>
                <label class="option-row" for="flag-changepw">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-changepw"
                      v-model="form.flags.changePassword"
                      :binary="true"
                    />
                  </span>
                  User must change password at next login
                </label>
                <label class="option-row" for="flag-serviceaccount">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-serviceaccount"
                      v-model="form.flags.serviceAccount"
                      :binary="true"
                    />
                  </span>
                  Service account (API token login only)
                </label>
                <label class="option-row" for="flag-cannotchangepw">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-cannotchangepw"
                      v-model="form.flags.cannotChangePassword"
                      :binary="true"
                    />
                  </span>
                  User cannot change password
                </label>
                <label class="option-row" for="flag-closesessions">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-closesessions"
                      v-model="form.flags.closeOtherSessions"
                      :binary="true"
                    />
                  </span>
                  Close other sessions after login
                </label>
                <label class="option-row" for="flag-pwexpires">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-pwexpires"
                      v-model="form.flags.passwordNeverExpires"
                      :binary="true"
                    />
                  </span>
                  Password never expires
                </label>
                <label class="option-row" for="flag-2faexempt">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-2faexempt"
                      v-model="form.flags.twoFAExempt"
                      :binary="true"
                    />
                  </span>
                  Exempt from two-factor authentication
                </label>
                <label class="option-row" for="flag-intruderlockout">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-intruderlockout"
                      v-model="form.flags.intruderLockout"
                      :binary="true"
                    />
                  </span>
                  Account locked out (authentication failures)
                </label>
                <label class="option-row" for="flag-2faenforce">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-2faenforce"
                      v-model="form.flags.twoFAEnforce"
                      :binary="true"
                    />
                  </span>
                  Enforce two-factor authentication
                </label>
                <label class="option-row" for="flag-syncexception">
                  <span @click.stop>
                    <Checkbox
                      input-id="flag-syncexception"
                      v-model="form.flags.syncException"
                      :binary="true"
                    />
                  </span>
                  Excluded from LDAP synchronization
                </label>
              </div>
            </DetailCard>
          </div>
        </TabPanel>

        <TabPanel value="2fa">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <span class="tab-toolbar-title">Two-Factor Authentication Bindings</span>
              <div class="tab-toolbar-actions">
                <Button
                  label="Add"
                  icon="pi pi-plus"
                  size="small"
                  severity="primary"
                  :disabled="availableMethodsToAdd.length === 0"
                  @click="openAdd2FADialog"
                />
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  text
                  :disabled="!selectedBinding || isDeletingBinding"
                  :loading="isDeletingBinding"
                  @click="deleteSelectedBinding"
                />
              </div>
            </div>

            <DataTable
              v-model:selection="selectedBinding"
              :value="bindings"
              :loading="isBindingsLoading"
              selection-mode="single"
              data-key="methodName"
              class="bindings-table"
            >
              <template #empty>
                <div class="table-empty">No two-factor authentication methods configured.</div>
              </template>
              <Column field="methodName" header="Method" :sortable="true" style="width: 200px">
                <template #body="{ data }">
                  <span class="binding-name">{{ data.methodName }}</span>
                </template>
              </Column>
              <Column field="driver" header="Driver" :sortable="true" style="width: 120px">
                <template #body="{ data }">
                  <span class="driver-chip" :class="driverChipClass(data.driver)">
                    {{ data.driver }}
                  </span>
                </template>
              </Column>
              <Column field="status" header="Status" :sortable="true" style="width: 120px">
                <template #body="{ data }">
                  <Tag
                    :value="data.status === 'enabled' || data.enabled ? 'Enabled' : 'Disabled'"
                    :severity="data.status === 'enabled' || data.enabled ? 'success' : 'secondary'"
                    outlined
                  />
                </template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>

        <TabPanel value="groups">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <span class="tab-toolbar-title">Group Membership</span>
              <div class="tab-toolbar-actions">
                <Button
                  label="Add"
                  icon="pi pi-plus"
                  size="small"
                  severity="primary"
                  :disabled="availableGroupsToJoin.length === 0"
                  @click="openAddGroupsDialog"
                />
                <Button
                  label="Remove"
                  icon="pi pi-minus"
                  size="small"
                  severity="danger"
                  text
                  :disabled="!selectedGroup || isGroupUpdating"
                  :loading="isGroupUpdating"
                  @click="removeFromGroup"
                />
              </div>
            </div>

            <DataTable
              v-model:selection="selectedGroup"
              :value="userGroups"
              selection-mode="single"
              data-key="id"
              class="groups-table"
            >
              <template #empty>
                <div class="table-empty">User is not a member of any groups.</div>
              </template>
              <Column field="name" header="Group Name" :sortable="true" style="width: 200px">
                <template #body="{ data }">
                  <span class="group-name">{{ data.name }}</span>
                </template>
              </Column>
              <Column field="description" header="Description" :sortable="true">
                <template #body="{ data }">
                  <span :class="{ 'text-muted': !data.description }">
                    {{ data.description || '-' }}
                  </span>
                </template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>

        <TabPanel value="tokens">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <span class="tab-toolbar-title">Authentication Tokens</span>
              <div class="tab-toolbar-actions">
                <Button
                  label="Issue New"
                  icon="pi pi-plus"
                  size="small"
                  severity="primary"
                  @click="openIssueTokenDialog"
                />
                <Button
                  label="Revoke"
                  icon="pi pi-ban"
                  size="small"
                  severity="danger"
                  text
                  :disabled="!selectedToken || isDeletingToken"
                  :loading="isDeletingToken"
                  @click="revokeSelectedToken"
                />
              </div>
            </div>

            <DataTable
              v-model:selection="selectedToken"
              :value="tokens"
              :loading="isTokensLoading"
              selection-mode="single"
              data-key="id"
              class="tokens-table"
            >
              <template #empty>
                <div class="table-empty">No authentication tokens issued.</div>
              </template>
              <Column field="id" header="ID" style="width: 80px" />
              <Column field="description" header="Description">
                <template #body="{ data }">
                  <span :class="{ 'text-muted': !data.description }">
                    {{ data.description || '-' }}
                  </span>
                </template>
              </Column>
              <Column header="Created" style="width: 180px">
                <template #body="{ data }">{{
                  formatDateTime(data.issuingTime, { unixSeconds: true }) ?? '-'
                }}</template>
              </Column>
              <Column header="Expires" style="width: 180px">
                <template #body="{ data }">{{
                  formatDateTime(data.expirationTime, { unixSeconds: true }) ?? '-'
                }}</template>
              </Column>
            </DataTable>
          </div>
        </TabPanel>

        <TabPanel value="rights">
          <div class="rights-tab">
            <div class="rights-filter-bar">
              <IconField>
                <InputIcon class="pi pi-search" />
                <InputText
                  v-model="rightsFilter"
                  data-filter-input
                  placeholder="Filter rights..."
                  class="rights-filter"
                />
              </IconField>
            </div>
            <div class="detail-cards-grid">
              <DetailCard
                v-for="cat in filteredCategories"
                :key="cat.name"
                :title="cat.name"
                :wide="cat.wide"
              >
                <label
                  v-for="right in cat.rights"
                  :key="right.bit"
                  :for="`right-${right.bit}`"
                  class="option-row"
                >
                  <span @click.stop>
                    <Checkbox
                      :input-id="`right-${right.bit}`"
                      :binary="true"
                      :model-value="hasRight(right.bit)"
                      @update:model-value="(val) => setRight(right.bit, val)"
                    />
                  </span>
                  {{ right.label }}
                </label>
              </DetailCard>
              <div v-if="filteredCategories.length === 0" class="rights-no-match">
                No rights match the filter.
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="attributes">
          <CustomAttributesEditor v-model="form.attributes" />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ChangePasswordDialog v-model:visible="showPasswordDialog" :user-id="user.id" />

    <Dialog
      v-model:visible="showAddGroupsDialog"
      header="Add to Groups"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="add-dialog-body">
        <MultiSelect
          v-model="addGroupsSelection"
          :options="availableGroupsToJoin"
          option-label="name"
          option-value="id"
          filter
          filter-placeholder="Search groups..."
          placeholder="Select groups to join"
          class="add-dialog-select"
          :max-selected-labels="5"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showAddGroupsDialog = false" />
        <Button
          label="Add"
          severity="primary"
          :disabled="addGroupsSelection.length === 0"
          @click="confirmAddGroups"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showAdd2FADialog"
      header="Add Two-Factor Method"
      modal
      :style="{ width: '26rem' }"
    >
      <div class="add-dialog-body">
        <Select
          v-model="add2FASelection"
          :options="availableMethodsToAdd"
          option-label="name"
          option-value="name"
          placeholder="Select a 2FA method"
          class="add-dialog-select"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showAdd2FADialog = false" />
        <Button
          label="Add"
          severity="primary"
          :disabled="!add2FASelection || isBinding"
          :loading="isBinding"
          @click="confirmAdd2FA"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showIssueTokenDialog"
      header="Issue Authentication Token"
      modal
      :closable="!issuedToken"
      :close-on-escape="!issuedToken"
      :style="{ width: '28rem' }"
    >
      <div v-if="!issuedToken" class="add-dialog-body">
        <div class="form-field">
          <label for="tok-desc">Description</label>
          <InputText id="tok-desc" v-model="newTokenDescription" class="form-input" />
        </div>
        <div class="form-field">
          <label for="tok-expires">Expires At</label>
          <DatePicker
            id="tok-expires"
            v-model="newTokenExpiresAt"
            show-time
            hour-format="24"
            date-format="yy-mm-dd"
            class="form-input"
          />
        </div>
      </div>
      <div v-else class="add-dialog-body">
        <p class="token-reveal-hint">Copy this token now. It will not be shown again.</p>
        <div class="token-value-row">
          <InputText :model-value="issuedToken.value" readonly class="form-input" />
          <Button
            v-tooltip.bottom="'Copy to clipboard'"
            aria-label="Copy to clipboard"
            icon="pi pi-copy"
            severity="secondary"
            text
            @click="copyTokenValue"
          />
        </div>
      </div>
      <template #footer>
        <template v-if="!issuedToken">
          <Button label="Cancel" severity="secondary" text @click="showIssueTokenDialog = false" />
          <Button
            label="Issue"
            severity="primary"
            :disabled="isCreatingToken"
            :loading="isCreatingToken"
            @click="confirmIssueToken"
          />
        </template>
        <template v-else>
          <Button label="Close" severity="primary" @click="closeIssueTokenDialog" />
        </template>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.user-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-tabs :deep(.p-tabpanels) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.detail-tabs :deep(.p-tabpanel) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.ldap-message {
  grid-column: 1 / -1;
  margin: 0;
}

.detail-cards-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  padding: 1.5rem;
  align-content: start;
  background: var(--p-surface-ground);
}

.tab-content--table {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  max-width: none;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-ground);
}

.form-field {
  display: flex;
  /* The global .form-field in forms.css sets `column`. */
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-surface-border);
}

.form-field:last-child {
  border-bottom: none;
}

.form-field label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  width: 10.5rem;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  min-width: 0;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 0.125rem 0;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.5rem;
  margin: 0 -0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-sm, 4px);
  cursor: pointer;
  font-size: 0.875rem;
  user-select: none;
  transition: background 0.12s;
}

.option-row:last-child {
  border-bottom: none;
}

.option-row:hover {
  background: var(--p-surface-hover);
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.tab-toolbar-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.tab-toolbar-actions {
  display: flex;
  gap: 0.25rem;
}

.bindings-table,
.groups-table,
.tokens-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.3rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.binding-name,
.group-name {
  font-weight: 500;
}

.table-empty {
  text-align: center;
  padding: 2.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.driver-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.driver-totp {
  background: var(--p-blue-100);
  color: var(--p-blue-700);
}

.driver-message {
  background: var(--p-purple-100);
  color: var(--p-purple-700);
}

.driver-other {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
}

.token-reveal-hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.token-value-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.rights-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rights-filter-bar {
  background: var(--p-surface-ground);
  padding: 1.25rem 1.5rem 0;
}

.rights-filter {
  width: 280px;
}

.rights-no-match {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.add-dialog-body {
  padding: 0.25rem 0 0.5rem;
}

.add-dialog-select {
  width: 100%;
}
</style>
