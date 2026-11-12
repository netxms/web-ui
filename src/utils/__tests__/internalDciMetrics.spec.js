// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { internalMetricsFor, internalTablesFor } from '../internalDciMetrics'

function names(list) {
  return list.map((m) => m.name)
}

describe('internalMetricsFor', () => {
  it('offers the common metrics on any owner', () => {
    const metrics = names(internalMetricsFor({ class: 'Container' }))
    expect(metrics).toContain('Status')
    expect(metrics).toContain('ChildStatus(*)')
    expect(metrics).not.toContain('ICMP.ResponseTime.Last')
  })

  it('adds node metrics on a node, agent metrics only with an agent', () => {
    const plain = names(internalMetricsFor({ class: 'Node', capabilities: {} }))
    expect(plain).toContain('ICMP.ResponseTime.Last')
    expect(plain).not.toContain('AgentStatus')

    const withAgent = names(
      internalMetricsFor({ class: 'Node', capabilities: { isNativeAgent: true } }),
    )
    expect(withAgent).toContain('AgentStatus')
  })

  it('keeps server metrics to the management server node', () => {
    const node = names(internalMetricsFor({ class: 'Node', capabilities: {} }))
    expect(node).not.toContain('Server.Uptime')

    const server = names(internalMetricsFor({ class: 'Node', capabilities: { isLocalMgmt: true } }))
    expect(server).toContain('Server.Uptime')
  })

  it('gives clusters the autobind poll times and mobile devices their own metrics', () => {
    expect(names(internalMetricsFor({ class: 'Cluster' }))).toContain('PollTime.AutoBind.Last')
    expect(names(internalMetricsFor({ class: 'MobileDevice' }))).toContain(
      'MobileDevice.BatteryLevel',
    )
  })

  it('offers everything on a template, or when the owner is unknown', () => {
    for (const owner of [{ class: 'Template' }, null]) {
      const metrics = names(internalMetricsFor(owner))
      expect(metrics).toContain('Server.Uptime')
      expect(metrics).toContain('MobileDevice.Model')
      expect(metrics).toContain('WirelessController.APCount.Total')
    }
  })

  it('carries a DCI data type on every metric, with unique names', () => {
    const all = internalMetricsFor(null)
    const valid = new Set([
      'int32',
      'uint32',
      'int64',
      'uint64',
      'counter32',
      'counter64',
      'float',
      'string',
    ])
    for (const m of all) expect(valid.has(m.dataType)).toBe(true)
    expect(new Set(names(all)).size).toBe(all.length)
  })
})

describe('internalTablesFor', () => {
  it('lists server tables only for the management server or a template', () => {
    expect(names(internalTablesFor({ class: 'Node', capabilities: {} }))).not.toContain(
      'Server.Queues',
    )
    expect(
      names(internalTablesFor({ class: 'Node', capabilities: { isLocalMgmt: true } })),
    ).toContain('Server.Queues')
    expect(names(internalTablesFor({ class: 'Template' }))).toContain('Server.Queues')
  })

  it('carries the instance columns', () => {
    const table = internalTablesFor(null).find((t) => t.name === 'Topology.OSPF.Neighbors')
    expect(table.instanceColumns).toEqual(['ROUTER_ID', 'IP_ADDRESS'])
  })
})
