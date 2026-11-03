/** @type {Array<import('@/components/common/SmartFilterInput.vue').FilterDef>} */
export const incidentFilterDefs = [
  {
    key: 'State',
    label: 'State',
    description: 'Filter by incident state',
    type: 'enum',
    options: ['Open', 'In Progress', 'Blocked', 'Resolved', 'Closed'],
  },
  {
    key: 'Source',
    label: 'Source',
    description: 'Filter by source object name',
    type: 'text',
  },
  {
    key: 'Assignee',
    label: 'Assignee',
    description: 'Filter by assigned user name',
    type: 'text',
  },
  {
    key: 'Unassigned',
    label: 'Unassigned',
    description: 'Show only incidents with no assignee',
    type: 'boolean',
  },
  {
    key: 'HasAlarms',
    label: 'HasAlarms',
    description: 'Show only incidents with linked alarms',
    type: 'boolean',
  },
  {
    key: 'NOT',
    label: 'NOT',
    description: 'Negate the next filter token',
    type: 'unary',
  },
]
