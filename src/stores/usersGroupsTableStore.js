import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useUsersTableStore = defineTableColumnStore('users', [
  'name',
  'fullName',
  'description',
  'email',
  'source',
  'authMethod',
  'flags',
])

export const useGroupsTableStore = defineTableColumnStore('groups', [
  'name',
  'description',
  'members',
  'source',
])
