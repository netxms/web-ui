import { describe, it, expect } from 'vitest'
import { buildInterfaceDcis, INTERFACE_DCI_METRICS, snmpInstanceOf } from '@/utils/interfaceDci'

const IFACE = { id: 187, name: 'ether5', index: 5, ifTableSuffix: [] }
const DEFAULT_SCHEDULE = { pollingScheduleType: 'default', retentionType: 'default' }

function build(node, metricId, { delta = true, iface = IFACE, schedule = DEFAULT_SCHEDULE } = {}) {
  const [dci] = buildInterfaceDcis({
    iface,
    node,
    choices: [{ metricId, delta, description: 'Inbound traffic on @@ifName@@' }],
    schedule,
  })
  return dci
}

const AGENT_64 = { capabilities: { isNativeAgent: true, hasAgentIfxCounters: true } }
const AGENT_32 = { capabilities: { isNativeAgent: true, hasAgentIfxCounters: false } }
const SNMP_X = { capabilities: { isNativeAgent: false, hasIfxTable: true } }
const SNMP = { capabilities: { isNativeAgent: false, hasIfxTable: false } }

describe('buildInterfaceDcis', () => {
  it('collects through the agent with 64-bit counters when it has them', () => {
    const dci = build(AGENT_64, 'inBytes')
    expect(dci).toMatchObject({
      name: 'Net.Interface.BytesIn64(5)',
      origin: 'agent',
      dataType: 'counter64',
      deltaCalculation: 'averagePerSecond',
      systemTag: 'iface.inbound.bytes',
      unitName: 'B/s',
    })
  })

  it('falls back to 32-bit agent counters', () => {
    const dci = build(AGENT_32, 'outPackets')
    expect(dci.name).toBe('Net.Interface.PacketsOut(5)')
    expect(dci.dataType).toBe('counter32')
  })

  it('reads ifXTable over SNMP when the device has it', () => {
    const dci = build(SNMP_X, 'outBytes')
    expect(dci).toMatchObject({
      name: '.1.3.6.1.2.1.31.1.1.1.10.5',
      origin: 'snmp',
      dataType: 'counter64',
    })
  })

  it('reads ifTable over SNMP otherwise', () => {
    const dci = build(SNMP, 'inBytes')
    expect(dci.name).toBe('.1.3.6.1.2.1.2.2.1.10.5')
    expect(dci.dataType).toBe('counter32')
  })

  it('keeps error counters 32-bit on every path', () => {
    expect(build(AGENT_64, 'inErrors')).toMatchObject({
      name: 'Net.Interface.InErrors(5)',
      dataType: 'counter32',
    })
    expect(build(SNMP_X, 'outErrors')).toMatchObject({
      name: '.1.3.6.1.2.1.2.2.1.20.5',
      dataType: 'counter32',
    })
  })

  it('turns bytes into bits with a transformation script', () => {
    const dci = build(AGENT_64, 'inBits')
    expect(dci.name).toBe('Net.Interface.BytesIn64(5)')
    expect(dci.transformationScript).toBe('return $1 * 8;')
    expect(dci.systemTag).toBe('iface.inbound.bits')
    expect(dci.unitName).toBe('b/s')
  })

  it('tags only the delta variant, and uses the absolute unit without delta', () => {
    const dci = build(AGENT_64, 'inBytes', { delta: false })
    expect(dci.systemTag).toBe('')
    expect(dci.deltaCalculation).toBe('none')
    expect(dci.unitName).toBe('B (Metric)')
  })

  it('puts the interface name into the description and links the interface', () => {
    const dci = build(AGENT_64, 'inBytes')
    expect(dci.description).toBe('Inbound traffic on ether5')
    expect(dci.relatedObject).toBe(187)
  })

  it('sends interval and retention only when they are custom', () => {
    expect(build(AGENT_64, 'inBytes')).not.toHaveProperty('pollingInterval')
    expect(build(AGENT_64, 'inBytes')).not.toHaveProperty('retentionTime')
    const custom = build(AGENT_64, 'inBytes', {
      schedule: {
        pollingScheduleType: 'custom',
        pollingInterval: 30,
        retentionType: 'custom',
        retentionTime: 90,
      },
    })
    expect(custom).toMatchObject({ pollingInterval: '30', retentionTime: '90' })
  })

  it('knows every metric the dialog offers', () => {
    for (const { id } of INTERFACE_DCI_METRICS) {
      expect(() => build(SNMP, id)).not.toThrow()
    }
  })
})

describe('snmpInstanceOf', () => {
  it('uses the ifTable suffix when the driver reported one', () => {
    expect(snmpInstanceOf({ index: 5, ifTableSuffix: [1, 5] })).toBe('.1.5')
  })

  it('uses the ifIndex otherwise', () => {
    expect(snmpInstanceOf({ index: 5, ifTableSuffix: [] })).toBe('.5')
  })
})
