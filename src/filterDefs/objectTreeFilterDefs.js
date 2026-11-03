/**
 * The prefixChar shortcuts mirror the legacy client's filter syntax. ip and exactip tokens match
 * nothing when the tree data carries no addresses.
 *
 * @type {Array<import('@/components/common/SmartFilterInput.vue').FilterDef>}
 */
export const objectTreeFilterDefs = [
  {
    key: 'id',
    prefixChar: '#',
    label: 'ID',
    description: 'Search by object ID (#123 or id:123)',
    type: 'text',
  },
  {
    key: 'ip',
    prefixChar: '>',
    label: 'IP',
    description: 'Search by IP address substring (>192.168.1 or ip:192.168.1)',
    type: 'text',
  },
  {
    key: 'exactip',
    prefixChar: '^',
    label: 'Exact IP',
    description: 'Search by exact IP address (^10.0.0.1 or exactip:10.0.0.1)',
    type: 'text',
  },
  // No comment filter: /sub-tree does not return object comments.
  {
    key: 'zone',
    prefixChar: '@',
    label: 'Zone',
    description: 'Search by zone ID (@5 or zone:5)',
    type: 'text',
  },
]
