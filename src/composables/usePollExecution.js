import { usePollExecutionStore } from '@/stores/pollExecutionStore'

// Mock log lines per poll type — approximate real NetXMS server output
const MOCK_LINES = {
  status: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting status poll of node ${name}`,
    'Checking SNMP agent connectivity',
    '   Starting status poll on interface VL1',
    '      Current interface status is NORMAL',
    '      Retrieving interface status from SNMP agent',
    '      Interface status retrieved from SNMP agent',
    '      Interface is NORMAL for 93 polls (1 poll required for status change)',
    '      Interface status after poll is NORMAL',
    '   Finished status poll on interface VL1',
    '   Starting status poll on interface Fa0/1',
    '      Current interface status is NORMAL',
    '      Retrieving interface status from SNMP agent',
    '      Interface status retrieved from SNMP agent',
    '      Checking port STP state...',
    '      Interface is NORMAL for 93 polls (1 poll required for status change)',
    '      Interface status after poll is NORMAL',
    '   Finished status poll on interface Fa0/1',
    '   Starting status poll on interface Fa0/2',
    '      Current interface status is DISABLED',
    '      Interface is DISABLED for 12 polls',
    '   Finished status poll on interface Fa0/2',
    'Node is connected',
    'System was restarted since last status poll',
    'Checking interface configuration...',
    'Interface configuration check finished',
    `Finished status poll of node ${name}`,
    'Node status after poll is NORMAL',
    '**** Poll completed successfully ****',
  ],

  configuration: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting configuration poll of node ${name}`,
    'Checking node capabilities...',
    'Collecting SNMP system information',
    '   sysDescr: Cisco IOS Software, Version 15.2(4)M3, RELEASE SOFTWARE (fc2)',
    '   sysObjectID: 1.3.6.1.4.1.9.1.46',
    '   sysContact: NOC Team <noc@example.com>',
    'Collecting interface list from SNMP agent',
    '   Found 28 interfaces',
    'Checking for topology support...',
    '   LLDP support detected',
    '   STP support detected',
    '   CDP support detected',
    'Collecting VLAN information...',
    '   Found 14 VLANs configured',
    'Updating node capabilities in database...',
    'Applying configuration templates...',
    '   Template "Cisco Switches" applied (4 DCIs updated)',
    `Finished configuration poll of node ${name}`,
    '**** Poll completed successfully ****',
  ],

  topology: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting topology poll of node ${name}`,
    'Collecting LLDP neighbors...',
    '   Neighbor: sw-core-1 via port GigabitEthernet0/1',
    '   Neighbor: sw-access-1 via port GigabitEthernet0/2',
    '   Neighbor: ap-floor2-1 via port GigabitEthernet0/8',
    'Collecting CDP neighbors...',
    '   Neighbor: router-gw via port FastEthernet0/0',
    'Collecting STP topology...',
    '   Root bridge: sw-core-1 (priority 4096)',
    '   Local port states collected for 28 interfaces',
    'Resolving neighbor objects in database...',
    '   sw-core-1 resolved to object #1042',
    '   sw-access-1 resolved to object #1043',
    'Updating topology links in database...',
    '   Added 1 new link',
    '   Updated 3 existing links',
    `Finished topology poll of node ${name}`,
    '**** Poll completed successfully ****',
  ],

  instanceDiscovery: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting instance discovery poll of node ${name}`,
    'Processing instance discovery filters for DCIs...',
    '   DCI "CPU Usage per Core" (ID: 142): running instance discovery',
    '      Discovery method: SNMP walk (OID: .1.3.6.1.2.1.25.3.3.1)',
    '      Found 4 instances: cpu0, cpu1, cpu2, cpu3',
    '      New instances: none (all already tracked)',
    '   DCI "Interface Traffic" (ID: 87): running instance discovery',
    '      Discovery method: SNMP walk (OID: .1.3.6.1.2.1.2.2.1.2)',
    '      Found 28 instances',
    '      New instances: Fa0/23, Fa0/24',
    '      Adding new DCI instances...',
    '      Applying templates to new instances...',
    '   DCI "Disk Utilization" (ID: 203): running instance discovery',
    '      Discovery method: NetXMS agent',
    '      Found 3 instances: /, /boot, /var',
    '      New instances: none',
    `Finished instance discovery poll of node ${name}`,
    '**** Poll completed successfully ****',
  ],

  automaticBinding: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting automatic binding poll of container ${name}`,
    'Evaluating binding rules...',
    '   Rule 1: nodes with custom attribute "role" = "web"',
    '      Scanning 312 candidate objects...',
    '      Matched: web-01, web-02, web-03 (3 objects, all already bound)',
    '   Rule 2: nodes in subnet 192.168.10.0/24',
    '      Scanning 312 candidate objects...',
    '      Matched: 8 objects, 6 already bound',
    '      Binding new objects: db-replica-01, db-replica-02',
    'Checking objects to unbind (no longer matching any rule)...',
    '   No objects to unbind',
    'Updating container membership in database...',
    `Finished automatic binding poll of container ${name}`,
    '**** Poll completed successfully ****',
  ],

  mapUpdate: (name) => [
    '**** Poll request sent to server ****',
    'Poll request accepted, waiting for outstanding polling requests to complete...',
    `Starting map update poll of network map ${name}`,
    'Collecting topology data from all connected nodes...',
    '   Querying LLDP neighbors from 24 nodes',
    '   Querying CDP neighbors from 8 nodes',
    '   Collecting OSPF topology from routing table',
    'Resolving node objects in database...',
    '   Matched 31 of 32 discovered devices to existing objects',
    '   1 device has no matching object (192.168.50.5)',
    'Updating map elements...',
    '   12 nodes updated (status, position)',
    '   3 new links discovered and added',
    '   1 stale link removed',
    'Applying automatic layout hints...',
    `Finished map update poll of network map ${name}`,
    '**** Poll completed successfully ****',
  ],
}

function formatTimestamp(date) {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear()
  const h = date.getHours().toString().padStart(2, '0')
  const min = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  return `[${d}.${m}.${y} ${h}:${min}:${s}]`
}

function streamLines(executionId, pollType, objectName, store) {
  const lines = (MOCK_LINES[pollType] || MOCK_LINES.status)(objectName)
  return new Promise((resolve) => {
    let i = 0
    function next() {
      if (i >= lines.length) {
        resolve()
        return
      }
      const ts = formatTimestamp(new Date())
      store.appendStreamOutput(executionId, `${ts} ${lines[i]}\n`)
      i++
      setTimeout(next, 60 + Math.random() * 100)
    }
    next()
  })
}

export function usePollExecution() {
  const pollStore = usePollExecutionStore()

  async function runPoll(object, pollType, pollLabel) {
    const executionId = `${object.id}-${pollType}`
    const existing = pollStore.getExecution(executionId)

    if (existing) {
      pollStore.resetExecution(executionId)
    } else {
      pollStore.createExecution({
        pollType,
        pollLabel,
        objectId: object.id,
        objectName: object.name,
      })
    }

    pollStore.markRunning(executionId)

    try {
      await streamLines(executionId, pollType, object.name, pollStore)
      pollStore.markCompleted(executionId)
    } catch (err) {
      pollStore.markError(executionId, err)
    }
  }

  return { runPoll }
}
