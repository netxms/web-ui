import { SERVER_CONFIG_DATA_TYPES } from '@/utils/serverConfigDisplay'

/** @type {Array<import('@/components/common/SmartFilterInput.vue').FilterDef>} */
export const serverConfigFilterDefs = [
  {
    key: 'Type',
    label: 'Type',
    description: 'Filter by value data type',
    type: 'enum',
    options: SERVER_CONFIG_DATA_TYPES,
  },
  {
    key: 'Modified',
    label: 'Modified',
    description: 'Show only variables changed from their default value',
    type: 'boolean',
  },
  {
    key: 'Restart',
    label: 'Restart',
    description: 'Show only variables that need a server restart to take effect',
    type: 'boolean',
  },
  {
    key: 'NOT',
    label: 'NOT',
    description: 'Negate the next filter token',
    type: 'unary',
  },
]
