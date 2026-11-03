import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

// Expected state is on by default so the table's Expected State action shows its effect.
export const useInterfaceTableStore = defineTableColumnStore('interface', [
  'name',
  'ipAddresses',
  'mac',
  'adminState',
  'operState',
  'speed',
  'status',
  'expectedState',
])
