import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useDciLiveTableStore = defineTableColumnStore('dciLive', [
  'id',
  'description',
  'value',
  'timestamp',
  'threshold',
  'comments',
])

export const useDciConfigTableStore = defineTableColumnStore('dciConfig', [
  'id',
  'description',
  'origin',
  'metric',
  'dataType',
  'schedule',
  'retention',
  'status',
  'thresholds',
  'template',
])
