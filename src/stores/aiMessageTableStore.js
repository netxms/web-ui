import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useAiMessageTableStore = defineTableColumnStore('aiMessage', [
  'status',
  'type',
  'title',
  'object',
  'created',
  'expires',
])
