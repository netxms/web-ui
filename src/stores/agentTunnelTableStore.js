import { defineTableColumnStore } from '@/stores/tableColumnPrefs'

export const useAgentTunnelTableStore = defineTableColumnStore('agentTunnel', [
  'id',
  'state',
  'node',
  'address',
  'systemName',
  'hostname',
  'platform',
  'agentVersion',
  'channels',
  'connectionTime',
])
