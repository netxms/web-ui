<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
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
import Message from 'primevue/message'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import DetailCard from '@/components/layout/DetailCard.vue'
import CustomAttributesEditor from '@/components/users/CustomAttributesEditor.vue'
import { useUpdateUserGroup, useUsers } from '@/queries/useUserQueries'
import { SYSTEM_RIGHTS_CATEGORIES } from '@/auth/systemRights'
import FormField from '@/components/common/FormField.vue'

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['close'])

const { data: usersData } = useUsers()

function buildForm(group) {
  return {
    name: group.name ?? '',
    description: group.description ?? '',
    members: [...(group.members ?? [])],
    systemRights: BigInt(group.systemRights ?? 0),
    attributes: { ...group.attributes },
  }
}

function attributesEqual(a, b) {
  const aKeys = Object.keys(a ?? {})
  const bKeys = Object.keys(b ?? {})
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b?.[key])
}

const form = ref(buildForm(props.group))

watch(
  () => props.group,
  (group) => {
    form.value = buildForm(group)
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
  const g = props.group
  const f = form.value
  const origMembers = [...(g.members ?? [])].sort().join(',')
  const formMembers = [...f.members].sort().join(',')
  return (
    f.name !== (g.name ?? '') ||
    f.description !== (g.description ?? '') ||
    f.systemRights !== BigInt(g.systemRights ?? 0) ||
    origMembers !== formMembers ||
    !attributesEqual(f.attributes, g.attributes)
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

const usersById = computed(() => {
  const map = new Map()
  for (const u of usersData.value ?? []) map.set(u.id, u)
  return map
})

const memberDetails = computed(() =>
  form.value.members.map(
    (id) => usersById.value.get(id) ?? { id, name: `User #${id}`, fullName: '' },
  ),
)

const availableUsersToAdd = computed(() => {
  const current = new Set(form.value.members)
  return (usersData.value ?? []).filter((u) => !current.has(u.id))
})

const selectedMember = ref(null)

const showAddMembersDialog = ref(false)
const addMembersSelection = ref([])

function openAddMembersDialog() {
  addMembersSelection.value = []
  showAddMembersDialog.value = true
}

function confirmAddMembers() {
  form.value.members = [...form.value.members, ...addMembersSelection.value]
  showAddMembersDialog.value = false
}

function removeSelectedMember() {
  if (!selectedMember.value) return
  form.value.members = form.value.members.filter((id) => id !== selectedMember.value.id)
  selectedMember.value = null
}

const activeTab = ref('general')

const { mutate: updateUserGroup, isPending: isSaving } = useUpdateUserGroup()

function save() {
  const data = {
    name: form.value.name,
    description: form.value.description,
    members: form.value.members,
    systemRights: form.value.systemRights,
    attributes: form.value.attributes,
  }
  updateUserGroup({ groupId: props.group.id, data }, { onSuccess: () => emit('close') })
}

function discard() {
  form.value = buildForm(props.group)
}
</script>

<template>
  <div class="group-detail">
    <EntityDetailHeader :title="group.name" subtitle="Group" @back="emit('close')">
      <template #actions>
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
        <Tab value="members">Members</Tab>
        <Tab value="rights">System Rights</Tab>
        <Tab value="attributes">Custom Attributes</Tab>
      </TabList>

      <TabPanels>
        <TabPanel value="general">
          <div class="detail-cards-grid">
            <Message
              v-if="group.flags?.ldapUser"
              severity="warn"
              :closable="false"
              class="ldap-message"
            >
              This group is synchronized from LDAP. Changes to name and description will be
              overwritten on next synchronization.
            </Message>
            <DetailCard title="Identity" :wide="!group.ldapDn">
              <FormField label="Group Name" v-slot="{ id }">
                <InputText :id="id" v-model="form.name" class="form-input" />
              </FormField>
              <FormField label="Description" v-slot="{ id }">
                <InputText :id="id" v-model="form.description" class="form-input" />
              </FormField>
            </DetailCard>

            <DetailCard v-if="group.ldapDn" title="LDAP">
              <FormField label="Distinguished Name" group>
                <span class="form-readonly">{{ group.ldapDn }}</span>
              </FormField>
            </DetailCard>
          </div>
        </TabPanel>

        <TabPanel value="members">
          <div class="tab-content tab-content--table">
            <div class="tab-toolbar">
              <span class="tab-toolbar-title">
                Members
                <span class="member-count">({{ form.members.length }})</span>
              </span>
              <div class="tab-toolbar-actions">
                <Button
                  label="Add"
                  icon="pi pi-plus"
                  size="small"
                  severity="primary"
                  @click="openAddMembersDialog"
                />
                <Button
                  label="Remove"
                  icon="pi pi-minus"
                  size="small"
                  severity="danger"
                  text
                  :disabled="!selectedMember"
                  @click="removeSelectedMember"
                />
              </div>
            </div>

            <DataTable
              v-model:selection="selectedMember"
              :value="memberDetails"
              selection-mode="single"
              data-key="id"
              class="members-table"
            >
              <template #empty>
                <div class="table-empty">No members in this group.</div>
              </template>
              <Column field="name" header="Login Name" :sortable="true" style="width: 180px">
                <template #body="{ data }">
                  <span class="member-name">{{ data.name }}</span>
                </template>
              </Column>
              <Column field="fullName" header="Full Name" :sortable="true" />
              <Column field="email" header="Email" :sortable="true">
                <template #body="{ data }">
                  <span :class="{ 'text-muted': !data.email }">{{ data.email || '-' }}</span>
                </template>
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
                  :for="`grp-right-${right.bit}`"
                  class="option-row"
                >
                  <span @click.stop>
                    <Checkbox
                      :input-id="`grp-right-${right.bit}`"
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

    <Dialog
      v-model:visible="showAddMembersDialog"
      header="Add Members"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="add-members-body">
        <MultiSelect
          v-model="addMembersSelection"
          :options="availableUsersToAdd"
          option-label="name"
          option-value="id"
          filter
          filter-placeholder="Search users..."
          placeholder="Select users to add"
          class="add-members-select"
          :max-selected-labels="5"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showAddMembersDialog = false" />
        <Button
          label="Add"
          severity="primary"
          :disabled="addMembersSelection.length === 0"
          @click="confirmAddMembers"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.group-detail {
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
  /* The global .form-field in forms.css is column. */
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

.form-readonly {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-family: var(--font-mono);
  word-break: break-all;
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

.member-count {
  font-weight: 400;
  color: var(--p-text-muted-color);
  margin-left: 0.25rem;
}

.tab-toolbar-actions {
  display: flex;
  gap: 0.25rem;
}

.members-table {
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 0.375rem);
  overflow: hidden;
  --p-datatable-body-cell-padding: 0.3rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.member-name {
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

.add-members-body {
  padding: 0.25rem 0 0.5rem;
}

.add-members-select {
  width: 100%;
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

.rights-no-match {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
