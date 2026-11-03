import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useAiObservationTableStore = defineTableColumnStore('aiObservation', [
  'severity',
  'timestamp',
  'state',
  'instance',
  'object',
  'title',
  'body',
])
