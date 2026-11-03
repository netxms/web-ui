/** @type {Array<import('@/components/common/SmartFilterInput.vue').FilterDef>} */
export const alarmFilterDefs = [
  {
    key: 'Severity',
    label: 'Severity',
    description: 'Filter by alarm severity',
    type: 'enum',
    options: ['Critical', 'Major', 'Minor', 'Warning', 'Normal'],
  },
  {
    key: 'State',
    label: 'State',
    description: 'Filter by alarm state',
    type: 'enum',
    options: ['Outstanding', 'Acknowledged', 'Resolved', 'Terminated'],
  },
  {
    key: 'Source',
    label: 'Source',
    description: 'Filter by source object name',
    type: 'text',
  },
  {
    key: 'AcknowledgedBy',
    label: 'AcknowledgedBy',
    description: 'Filter by who acknowledged the alarm',
    type: 'text',
  },
  {
    key: 'ResolvedBy',
    label: 'ResolvedBy',
    description: 'Filter by who resolved the alarm',
    type: 'text',
  },
  {
    key: 'HasComments',
    label: 'HasComments',
    description: 'Show only alarms with comments',
    type: 'boolean',
  },
  {
    key: 'RepeatCount',
    label: 'RepeatCount',
    description: 'Filter by repeat count (e.g. >5)',
    type: 'text',
  },
  {
    key: 'Zone',
    label: 'Zone',
    description: 'Filter by zone name or ID',
    type: 'text',
  },
  {
    key: 'Event',
    label: 'Event',
    description: 'Filter by originating event name',
    type: 'text',
  },
  {
    key: 'NOT',
    label: 'NOT',
    description: 'Negate the next filter token',
    type: 'unary',
  },
]
