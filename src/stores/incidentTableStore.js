import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useIncidentTableStore = defineTableColumnStore('incident', [
  'id',
  'state',
  'title',
  'source',
  'assignee',
  'lastChangeTime',
  'alarms',
])
