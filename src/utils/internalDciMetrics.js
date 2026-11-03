// The server has no endpoint listing internal metrics; this is the legacy client's hard-coded
// catalog (SelectInternalParamDlg.java).

/** @type {Array<{ appliesTo: (object: object) => boolean, metrics: Array<[string, string, string]> }>} */
const METRIC_GROUPS = [
  {
    appliesTo: () => true,
    metrics: [
      ['ChildStatus(*)', 'Status of child object {instance}', 'int32'],
      ['ConditionStatus(*)', 'Status of condition object {instance}', 'int32'],
      ['Dummy', 'Dummy value', 'int32'],
      ['Dummy(*)', 'Dummy value', 'int32'],
      ['PollTime.Configuration.Average', 'Poll time (configuration): average', 'uint64'],
      ['PollTime.Configuration.Last', 'Poll time (configuration): last', 'uint64'],
      ['PollTime.Configuration.Max', 'Poll time (configuration): max', 'uint64'],
      ['PollTime.Configuration.Min', 'Poll time (configuration): min', 'uint64'],
      ['PollTime.Instance.Average', 'Poll time (instance): average', 'uint64'],
      ['PollTime.Instance.Last', 'Poll time (instance): last', 'uint64'],
      ['PollTime.Instance.Max', 'Poll time (instance): max', 'uint64'],
      ['PollTime.Instance.Min', 'Poll time (instance): min', 'uint64'],
      ['PollTime.Status.Average', 'Poll time (status): average', 'uint64'],
      ['PollTime.Status.Last', 'Poll time (status): last', 'uint64'],
      ['PollTime.Status.Max', 'Poll time (status): max', 'uint64'],
      ['PollTime.Status.Min', 'Poll time (status): min', 'uint64'],
      ['Status', 'Status', 'int32'],
    ],
  },
  {
    appliesTo: (o) => o.class === 'Cluster',
    metrics: [
      ['PollTime.AutoBind.Average', 'Poll time (autobind): average', 'uint64'],
      ['PollTime.AutoBind.Last', 'Poll time (autobind): last', 'uint64'],
      ['PollTime.AutoBind.Max', 'Poll time (autobind): max', 'uint64'],
      ['PollTime.AutoBind.Min', 'Poll time (autobind): min', 'uint64'],
    ],
  },
  {
    appliesTo: (o) => o.class === 'Node',
    metrics: [
      ['ICMP.Jitter', 'ICMP ping: jitter', 'uint32'],
      ['ICMP.Jitter(*)', 'ICMP ping to {instance}: jitter', 'uint32'],
      ['ICMP.PacketLoss', 'ICMP ping: packet loss', 'uint32'],
      ['ICMP.PacketLoss(*)', 'ICMP ping to {instance}: packet loss', 'uint32'],
      ['ICMP.ResponseTime.Average', 'ICMP ping: average response time', 'uint32'],
      ['ICMP.ResponseTime.Average(*)', 'ICMP ping to {instance}: average response time', 'uint32'],
      ['ICMP.ResponseTime.Last', 'ICMP ping: last response time', 'uint32'],
      ['ICMP.ResponseTime.Last(*)', 'ICMP ping to {instance}: last response time', 'uint32'],
      ['ICMP.ResponseTime.Max', 'ICMP ping: maximum response time', 'uint32'],
      ['ICMP.ResponseTime.Max(*)', 'ICMP ping to {instance}: maximum response time', 'uint32'],
      ['ICMP.ResponseTime.Min', 'ICMP ping: minimum response time', 'uint32'],
      ['ICMP.ResponseTime.Min(*)', 'ICMP ping to {instance}: minimum response time', 'uint32'],
      ['Net.IP.NextHop(*)', 'Next routing hop for IP address {instance}', 'string'],
      ['NetSvc.ResponseTime(*)', 'Network service {instance} response time', 'uint32'],
      ['PollTime.RoutingTable.Average', 'Poll time (routing table): average', 'uint64'],
      ['PollTime.RoutingTable.Last', 'Poll time (routing table): last', 'uint64'],
      ['PollTime.RoutingTable.Max', 'Poll time (routing table): max', 'uint64'],
      ['PollTime.RoutingTable.Min', 'Poll time (routing table): min', 'uint64'],
      ['PollTime.Topology.Average', 'Poll time (topology): average', 'uint64'],
      ['PollTime.Topology.Last', 'Poll time (topology): last', 'uint64'],
      ['PollTime.Topology.Max', 'Poll time (topology): max', 'uint64'],
      ['PollTime.Topology.Min', 'Poll time (topology): min', 'uint64'],
      ['ReceivedSNMPTraps', 'Total SNMP traps received from this node', 'uint64'],
      ['ReceivedSyslogMessages', 'Total syslog messages received from this node', 'uint64'],
      ['ZoneProxy.Assignments', 'Zone proxy: number of assignments', 'uint32'],
      ['ZoneProxy.State', 'Zone proxy: state', 'int32'],
      ['ZoneProxy.ZoneUIN', 'Zone proxy: UIN of parent zone', 'uint32'],
    ],
  },
  {
    appliesTo: (o) => o.class === 'Node' && !!o.capabilities?.isNativeAgent,
    metrics: [
      ['AgentStatus', 'Status of NetXMS agent', 'int32'],
      ['AgentTraffic.BytesReceived', 'Bytes received from agent since server start', 'counter64'],
      ['AgentTraffic.BytesSent', 'Bytes sent to agent since server start', 'counter64'],
    ],
  },
  {
    appliesTo: isManagementServer,
    metrics: [
      ['Server.ActiveAlarms', 'Number of active alarms in the system', 'uint32'],
      [
        'Server.ActiveNetworkDiscovery.CurrentRange',
        'Address range currently being processed by active network discovery',
        'string',
      ],
      [
        'Server.ActiveNetworkDiscovery.IsRunning',
        'Active network discovery run indicator',
        'int32',
      ],
      ['Server.AI.FailedRequests', 'AI: total failed API calls', 'counter64'],
      ['Server.AI.FailedRequests(*)', 'AI: failed API calls for provider {instance}', 'counter64'],
      ['Server.AI.TokensIn', 'AI: total input tokens', 'counter64'],
      ['Server.AI.TokensIn(*)', 'AI: input tokens for provider {instance}', 'counter64'],
      ['Server.AI.TokensOut', 'AI: total output tokens', 'counter64'],
      ['Server.AI.TokensOut(*)', 'AI: output tokens for provider {instance}', 'counter64'],
      ['Server.AI.TotalRequests', 'AI: total API calls', 'counter64'],
      ['Server.AI.TotalRequests(*)', 'AI: API calls for provider {instance}', 'counter64'],
      [
        'Server.AgentTraffic.BytesReceived',
        'Bytes received from agents since server start',
        'counter64',
      ],
      ['Server.AgentTraffic.BytesSent', 'Bytes sent to agents since server start', 'counter64'],
      ['Server.AgentTunnels.Bound.Total', 'Number of bound agent tunnels', 'uint32'],
      [
        'Server.AgentTunnels.Bound.AgentProxy',
        'Number of bound agent tunnels with enabled agent proxy',
        'uint32',
      ],
      [
        'Server.AgentTunnels.Bound.SnmpProxy',
        'Number of bound agent tunnels with enabled SNMP proxy',
        'uint32',
      ],
      [
        'Server.AgentTunnels.Bound.SnmpTrapProxy',
        'Number of bound agent tunnels with enabled SNMP trap proxy',
        'uint32',
      ],
      [
        'Server.AgentTunnels.Bound.SyslogProxy',
        'Number of bound agent tunnels with enabled syslog proxy',
        'uint32',
      ],
      [
        'Server.AgentTunnels.Bound.UserAgent',
        'Number of bound agent tunnels with installed user agent',
        'uint32',
      ],
      ['Server.AgentTunnels.Unbound.Total', 'Number of unbound agent tunnels', 'uint32'],
      [
        'Server.AverageDCIQueuingTime',
        'Average time to queue DCI for polling for last minute',
        'uint32',
      ],
      [
        'Server.Certificate.ExpirationDate',
        'Server certificate expiration date (YYYY-MM-DD)',
        'string',
      ],
      ['Server.Certificate.ExpirationTime', 'Server certificate expiration time', 'uint64'],
      ['Server.Certificate.ExpiresIn', 'Days until server certificate expiration date', 'int32'],
      ['Server.ClientSessions.Authenticated', 'Client sessions: authenticated', 'uint32'],
      [
        'Server.ClientSessions.Authenticated(*)',
        'Client sessions for user {instance}: authenticated',
        'uint32',
      ],
      ['Server.ClientSessions.Desktop', 'Client sessions: desktop', 'uint32'],
      [
        'Server.ClientSessions.Desktop(*)',
        'Client sessions for user {instance}: desktop',
        'uint32',
      ],
      ['Server.ClientSessions.Mobile', 'Client sessions: mobile', 'uint32'],
      ['Server.ClientSessions.Mobile(*)', 'Client sessions for user {instance}: mobile', 'uint32'],
      ['Server.ClientSessions.Total', 'Client sessions: total', 'uint32'],
      ['Server.ClientSessions.Web', 'Client sessions: web clients', 'uint32'],
      [
        'Server.ClientSessions.Web(*)',
        'Client sessions for user {instance}: web clients',
        'uint32',
      ],
      ['Server.DataCollectionItems', 'Number of data collection items in the system', 'uint32'],
      ['Server.DB.Queries.Failed', 'Failed DB queries', 'counter64'],
      ['Server.DB.Queries.LongRunning', 'Long running DB queries', 'counter64'],
      ['Server.DB.Queries.NonSelect', 'Non-SELECT DB queries', 'counter64'],
      ['Server.DB.Queries.Select', 'SELECT DB queries', 'counter64'],
      ['Server.DB.Queries.Total', 'Total DB queries', 'counter64'],
      ['Server.DBWriter.Requests.IData', 'DB writer requests (DCI data)', 'counter64'],
      ['Server.DBWriter.Requests.Other', 'DB writer requests (other queries)', 'counter64'],
      ['Server.DBWriter.Requests.RawData', 'DB writer requests (raw DCI data)', 'counter64'],
      [
        'Server.EventProcessor.AverageWaitTime(*)',
        'Event processor {instance}: average event wait time',
        'uint32',
      ],
      [
        'Server.EventProcessor.Bindings(*)',
        'Event processor {instance}: active bindings',
        'uint32',
      ],
      [
        'Server.EventProcessor.ProcessedEvents(*)',
        'Event processor {instance}: total number of processed events',
        'counter64',
      ],
      ['Server.EventProcessor.QueueSize(*)', 'Event processor {instance}: queue size', 'uint32'],
      ['Server.FileHandleLimit', 'File handle limit for server process', 'uint32'],
      ['Server.Heap.Active', 'Active server heap memory', 'uint64'],
      ['Server.Heap.Allocated', 'Allocated server heap memory', 'uint64'],
      ['Server.Heap.Mapped', 'Mapped server heap memory', 'uint64'],
      ['Server.MemoryUsage.Alarms', 'Server memory usage: alarms', 'uint64'],
      [
        'Server.MemoryUsage.DataCollectionCache',
        'Server memory usage: data collection cache',
        'uint64',
      ],
      ['Server.MemoryUsage.RawDataWriter', 'Server memory usage: raw data writer', 'uint64'],
      [
        'Server.NotificationChannel.HealthCheckStatus(*)',
        'Notification channel {instance}: health check status',
        'int32',
      ],
      [
        'Server.NotificationChannel.LastMessageTimestamp(*)',
        'Notification channel {instance}: timestamp of last message',
        'uint64',
      ],
      [
        'Server.NotificationChannel.MessageCount(*)',
        'Notification channel {instance}: total number of messages',
        'counter32',
      ],
      [
        'Server.NotificationChannel.QueueSize(*)',
        'Notification channel {instance}: queue size',
        'uint32',
      ],
      [
        'Server.NotificationChannel.SendFailureCount(*)',
        'Notification channel {instance}: number of send failures',
        'counter32',
      ],
      [
        'Server.NotificationChannel.SendStatus(*)',
        'Notification channel {instance}: status of last send attempt',
        'int32',
      ],
      ['Server.ObjectCount.AccessPoints', 'Objects: access points', 'uint32'],
      ['Server.ObjectCount.Clusters', 'Objects: clusters', 'uint32'],
      ['Server.ObjectCount.CoolingZones', 'Objects: cooling zones', 'uint32'],
      ['Server.ObjectCount.Facilities', 'Objects: facilities', 'uint32'],
      ['Server.ObjectCount.Interfaces', 'Objects: interfaces', 'uint32'],
      ['Server.ObjectCount.Nodes', 'Objects: nodes', 'uint32'],
      ['Server.ObjectCount.PowerDomains', 'Objects: power domains', 'uint32'],
      ['Server.ObjectCount.Sensors', 'Objects: sensors', 'uint32'],
      ['Server.ObjectCount.Total', 'Objects: total', 'uint32'],
      ['Server.PDS.DriverStat(*)', 'PDS driver metric', 'uint32'],
      ['Server.Pollers.Autobind', 'Pollers: auto bind', 'uint32'],
      ['Server.Pollers.Configuration', 'Pollers: configuration', 'uint32'],
      ['Server.Pollers.Discovery', 'Pollers: discovery', 'uint32'],
      ['Server.Pollers.ICMP', 'Pollers: ICMP', 'uint32'],
      ['Server.Pollers.InstanceDiscovery', 'Pollers: instance discovery', 'uint32'],
      ['Server.Pollers.MapUpdate', 'Pollers: map update', 'uint32'],
      ['Server.Pollers.RoutingTable', 'Pollers: routing table', 'uint32'],
      ['Server.Pollers.Status', 'Pollers: status', 'uint32'],
      ['Server.Pollers.Topology', 'Pollers: topology', 'uint32'],
      ['Server.Pollers.Total', 'Pollers: total', 'uint32'],
      ['Server.QueueSize.Average(*)', 'Server queue {instance}: average size', 'float'],
      ['Server.QueueSize.Current(*)', 'Server queue {instance}: current size', 'int64'],
      ['Server.QueueSize.Max(*)', 'Server queue {instance}: max size', 'int64'],
      ['Server.QueueSize.Min(*)', 'Server queue {instance}: min size', 'int64'],
      ['Server.ReceivedSNMPTraps', 'SNMP traps received since server start', 'counter64'],
      ['Server.ReceivedSyslogMessages', 'Syslog messages received since server start', 'counter64'],
      ['Server.ReceivedWindowsEvents', 'Windows events received since server start', 'counter64'],
      ['Server.SyncerRunTime.Average', 'Syncer run time: average', 'uint32'],
      ['Server.SyncerRunTime.Last', 'Syncer run time: last', 'uint32'],
      ['Server.SyncerRunTime.Max', 'Syncer run time: max', 'uint32'],
      ['Server.SyncerRunTime.Min', 'Syncer run time: min', 'uint32'],
      ['Server.ThreadPool.ActiveRequests(*)', 'Thread pool {instance}: active requests', 'int32'],
      [
        'Server.ThreadPool.AverageWaitTime(*)',
        'Thread pool {instance}: average wait time',
        'uint32',
      ],
      ['Server.ThreadPool.CurrSize(*)', 'Thread pool {instance}: current size', 'int32'],
      ['Server.ThreadPool.Load(*)', 'Thread pool {instance}: current load', 'int32'],
      [
        'Server.ThreadPool.LoadAverage(*)',
        'Thread pool {instance}: load average (1 minute)',
        'float',
      ],
      [
        'Server.ThreadPool.LoadAverage5(*)',
        'Thread pool {instance}: load average (5 minutes)',
        'float',
      ],
      [
        'Server.ThreadPool.LoadAverage15(*)',
        'Thread pool {instance}: load average (15 minutes)',
        'float',
      ],
      ['Server.ThreadPool.MaxSize(*)', 'Thread pool {instance}: maximum size', 'int32'],
      ['Server.ThreadPool.MinSize(*)', 'Thread pool {instance}: minimum size', 'int32'],
      [
        'Server.ThreadPool.ScheduledRequests(*)',
        'Thread pool {instance}: scheduled requests',
        'int32',
      ],
      ['Server.ThreadPool.Usage(*)', 'Thread pool {instance}: usage', 'int32'],
      ['Server.TotalEventsProcessed', 'Total events processed', 'counter64'],
      ['Server.Uptime', 'Server uptime', 'uint32'],
    ],
  },
  {
    appliesTo: (o) => o.class === 'MobileDevice',
    metrics: [
      ['MobileDevice.BatteryLevel', 'Battery level', 'int32'],
      ['MobileDevice.DeviceId', 'Device ID', 'string'],
      ['MobileDevice.LastReportTime', 'Last report time', 'int64'],
      ['MobileDevice.Model', 'Model', 'string'],
      ['MobileDevice.OS.Name', 'Operating system', 'string'],
      ['MobileDevice.OS.Version', 'Operating system version', 'string'],
      ['MobileDevice.SerialNumber', 'Serial number', 'string'],
      ['MobileDevice.Vendor', 'Vendor', 'string'],
      ['MobileDevice.UserId', 'User ID', 'string'],
    ],
  },
  {
    appliesTo: (o) => o.class === 'Node' && !!o.capabilities?.isWifiController,
    metrics: [
      ['WirelessController.APCount.Down', 'Inoperational access points', 'uint32'],
      ['WirelessController.APCount.Operational', 'Operational access points', 'uint32'],
      ['WirelessController.APCount.Total', 'Total access points', 'uint32'],
      ['WirelessController.APCount.Unprovisioned', 'Unprovisioned access points', 'uint32'],
    ],
  },
]

/** @type {Array<{ appliesTo: (object: object) => boolean, tables: Array<[string, string, string[]]> }>} */
const TABLE_GROUPS = [
  {
    appliesTo: () => true,
    tables: [
      ['Hardware.Components', 'Hardware components', ['CATEGORY', 'INDEX']],
      ['Network.Interfaces', 'Network interfaces', ['ID']],
      ['Topology.OSPF.Areas', 'OSPF areas', ['ID']],
      ['Topology.OSPF.Neighbors', 'OSPF neighbors', ['ROUTER_ID', 'IP_ADDRESS']],
      ['Topology.RoutingTable', 'Routing table', ['ID']],
      ['Topology.SwitchForwardingDatabase', 'Switch forwarding database', ['MAC_ADDRESS']],
      ['Topology.WirelessStations', 'Wireless stations table', ['MAC_ADDRESS']],
      ['Traffic.ObservationPoints', 'Traffic observation points', ['INSTANCE']],
    ],
  },
  {
    appliesTo: isManagementServer,
    tables: [
      ['Server.AI.Providers', 'AI providers', ['NAME']],
      ['Server.EventProcessors', 'Event processors', ['ID']],
      ['Server.NotificationChannels', 'Notification channels', ['NAME']],
      ['Server.Queues', 'Server queues', ['NAME']],
    ],
  },
]

function isManagementServer(object) {
  return object.class === 'Node' && !!object.capabilities?.isLocalMgmt
}

// A template can be applied to any owner, so it sees everything, as does a not-yet-known owner.
function groupApplies(group, object) {
  return !object || object.class === 'Template' || group.appliesTo(object)
}

/**
 * @param {object|null} object
 * @returns {Array<{ name: string, description: string, dataType: string }>}
 */
export function internalMetricsFor(object) {
  return METRIC_GROUPS.filter((g) => groupApplies(g, object)).flatMap((g) =>
    g.metrics.map(([name, description, dataType]) => ({ name, description, dataType })),
  )
}

/**
 * @param {object|null} object
 * @returns {Array<{ name: string, description: string, instanceColumns: string[] }>}
 */
export function internalTablesFor(object) {
  return TABLE_GROUPS.filter((g) => groupApplies(g, object)).flatMap((g) =>
    g.tables.map(([name, description, instanceColumns]) => ({
      name,
      description,
      instanceColumns,
    })),
  )
}
