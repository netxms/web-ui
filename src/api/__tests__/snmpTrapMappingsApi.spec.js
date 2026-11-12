// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

const client = await import('../client')
const { getSnmpTrapMappings, getSnmpTrapMapping, updateSnmpTrapMapping } =
  await import('../snmpTrapMappingsApi')

beforeEach(() => vi.clearAllMocks())

describe('snmpTrapMappingsApi normalization', () => {
  it('fills what the server omits: no parameters, a null tag', async () => {
    client.get.mockResolvedValue({
      id: 4,
      guid: 'g',
      oid: '1.3.6.1.6.3.1.1.5.3',
      eventCode: 500,
      eventTag: null,
      description: 'linkDown',
      transformationScript: '',
    })

    expect(await getSnmpTrapMapping(4)).toEqual({
      id: 4,
      guid: 'g',
      oid: '1.3.6.1.6.3.1.1.5.3',
      eventCode: 500,
      eventTag: '',
      description: 'linkDown',
      transformationScript: '',
      parameters: [],
    })
    expect(client.get).toHaveBeenCalledWith('/v1/snmp-trap-mappings/4')
  })

  it('keeps parameter order and tells positional from OID mappings', async () => {
    client.get.mockResolvedValue([
      {
        id: 1,
        oid: '1.3.6.1.4.1.9',
        parameters: [
          { id: 1, oid: '1.3.6.1.2.1.2.2.1.1', description: 'ifIndex', flags: 0 },
          { id: 2, position: 3, description: 'third', flags: 1 },
        ],
      },
    ])

    const [mapping] = await getSnmpTrapMappings()
    expect(mapping.parameters).toEqual([
      { oid: '1.3.6.1.2.1.2.2.1.1', position: 0, description: 'ifIndex', flags: 0 },
      { oid: '', position: 3, description: 'third', flags: 1 },
    ])
  })

  it('answers an empty list for a non-array body', async () => {
    client.get.mockResolvedValue(null)
    expect(await getSnmpTrapMappings()).toEqual([])
  })

  it('updates through PUT on the mapping id', async () => {
    client.put.mockResolvedValue({ id: 9, oid: '1.3' })
    const result = await updateSnmpTrapMapping(9, { description: 'x' })
    expect(client.put).toHaveBeenCalledWith('/v1/snmp-trap-mappings/9', { description: 'x' })
    expect(result.id).toBe(9)
  })
})
