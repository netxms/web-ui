import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useAlarmTableStore = defineTableColumnStore('alarm', [
  'severity',
  'state',
  'source',
  'message',
  'repeatCount',
  'helpdeskReference',
  'lastChangeTime',
])
