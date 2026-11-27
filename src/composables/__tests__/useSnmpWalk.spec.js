import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const startSnmpWalk = vi.fn()
const sockets = []

vi.mock('@/api/objectsApi', () => ({ startSnmpWalk: (...args) => startSnmpWalk(...args) }))

vi.mock('@/api/outputStream', () => ({
  openOutputStream: (wsUrl, handlers) => {
    const socket = { wsUrl, handlers, close: vi.fn() }
    sockets.push(socket)
    return socket
  },
}))

const resolve = vi.fn()
vi.mock('@/queries/useMibQueries', () => ({ useMibNameResolver: () => ({ resolve }) }))

const { useSnmpWalk, SNMP_WALK_LIMIT } = await import('../useSnmpWalk')

function variable(oid, value = 'v') {
  return { oid, type: 'STRING', value, rawValue: '76' }
}

function names(oid) {
  const last = oid.split('.').pop()
  return { name: `col.${last}`, fullName: `iso.col.${last}`, objectOid: '1.3.6.1.9' }
}

/** Lets the frame chain, the name lookups and the publish timer run. */
async function settle() {
  await vi.advanceTimersByTimeAsync(500)
}

let scope

function setup() {
  scope = effectScope()
  return scope.run(() => useSnmpWalk())
}

async function started(walk, request = { objectId: 10, oid: '1.3.6.1.9' }) {
  await walk.start(request)
  return sockets[sockets.length - 1]
}

beforeEach(() => {
  vi.useFakeTimers()
  sockets.length = 0
  startSnmpWalk.mockReset()
  startSnmpWalk.mockResolvedValue({
    oid: '1.3.6.1.9',
    token: 't',
    wsUrl: '/v1/snmp-walks/output/t',
  })
  resolve.mockReset()
  resolve.mockImplementation(async (oid) => names(oid))
})

afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
})

describe('useSnmpWalk', () => {
  it('asks for a capped stream on the chosen agent', async () => {
    const walk = setup()
    await started(walk, { objectId: 10, oid: '1.3.6.1.9', snmpAgentName: 'ups' })
    expect(startSnmpWalk).toHaveBeenCalledWith(10, {
      oid: '1.3.6.1.9',
      snmpAgentName: 'ups',
      limit: SNMP_WALK_LIMIT,
    })
    expect(walk.status.value).toBe('running')
    expect(walk.target.value).toEqual({ objectId: 10, oid: '1.3.6.1.9', snmpAgentName: 'ups' })
  })

  it('shows variables in walk order with their names, then completes and closes', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({
      type: 'data',
      variables: [variable('1.3.6.1.9.1'), variable('1.3.6.1.9.2')],
    })
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.10')] })
    socket.handlers.onFrame({ type: 'completed', count: 3, truncated: false })
    await settle()

    expect(walk.rows.value.map((row) => [row.seq, row.oid, row.name])).toEqual([
      [0, '1.3.6.1.9.1', 'col.1'],
      [1, '1.3.6.1.9.2', 'col.2'],
      [2, '1.3.6.1.9.10', 'col.10'],
    ])
    expect(walk.rows.value[0]).toMatchObject({
      id: '1.3.6.1.9.1',
      fullName: 'iso.col.1',
      objectOid: '1.3.6.1.9',
      type: 'STRING',
      rawValue: '76',
    })
    expect(walk.status.value).toBe('completed')
    expect(walk.truncated.value).toBe(false)
    expect(socket.close).toHaveBeenCalled()
  })

  it('keeps walk order when a later batch resolves its names first', async () => {
    resolve.mockImplementation(async (oid) => {
      if (oid.endsWith('.1')) await new Promise((done) => setTimeout(done, 100))
      return names(oid)
    })
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.2')] })
    socket.handlers.onFrame({ type: 'completed', truncated: false })
    await settle()
    expect(walk.rows.value.map((row) => row.oid)).toEqual(['1.3.6.1.9.1', '1.3.6.1.9.2'])
  })

  it('shows a row without a name when the MIBs do not describe it', async () => {
    resolve.mockResolvedValue(null)
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.4.1.99.1')] })
    socket.handlers.onFrame({ type: 'completed' })
    await settle()
    expect(walk.rows.value[0]).toMatchObject({ name: '', fullName: '', objectOid: null })
  })

  it('reports a walk cut off at the cap', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'completed', count: SNMP_WALK_LIMIT, truncated: true })
    await settle()
    expect(walk.status.value).toBe('completed')
    expect(walk.truncated.value).toBe(true)
  })

  it('keeps the variables that arrived before an SNMP error', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    socket.handlers.onFrame({ type: 'error', message: 'Request timed out' })
    await settle()
    expect(walk.status.value).toBe('error')
    expect(walk.error.value.message).toBe('Request timed out')
    expect(walk.rows.value).toHaveLength(1)
  })

  it('fails with the server answer when the walk is refused', async () => {
    const refusal = Object.assign(new Error('SNMP is not supported on this node'), { status: 400 })
    startSnmpWalk.mockRejectedValue(refusal)
    const walk = setup()
    await walk.start({ objectId: 10, oid: '1.3.6.1.9' })
    expect(walk.status.value).toBe('error')
    expect(walk.error.value).toBe(refusal)
    expect(sockets).toHaveLength(0)
  })

  it('fails when the socket closes without a final frame', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    socket.handlers.onClose({ code: 1008, reason: 'Invalid token' })
    await settle()
    expect(walk.status.value).toBe('error')
    expect(walk.error.value.message).toContain('Invalid token')
    expect(walk.rows.value).toHaveLength(1)
  })

  it('stays completed when the server closes right after its final frame', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'completed', truncated: false })
    socket.handlers.onClose({ code: 1000, reason: '' })
    await settle()
    expect(walk.status.value).toBe('completed')
    expect(walk.error.value).toBeNull()
  })

  it('stop closes the socket, keeps what arrived and ignores later frames', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    await settle()
    walk.stop()
    expect(socket.close).toHaveBeenCalled()
    expect(walk.status.value).toBe('stopped')

    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.2')] })
    socket.handlers.onClose({ code: 1005, reason: '' })
    await settle()
    expect(walk.status.value).toBe('stopped')
    expect(walk.rows.value.map((row) => row.oid)).toEqual(['1.3.6.1.9.1'])
  })

  it('a new walk drops the previous one and its late frames', async () => {
    const walk = setup()
    const first = await started(walk)
    first.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    await settle()

    const second = await started(walk, { objectId: 11, oid: '1.3.6.1.2' })
    expect(first.close).toHaveBeenCalled()
    expect(walk.rows.value).toEqual([])
    first.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.2')] })
    second.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.2.1')] })
    second.handlers.onFrame({ type: 'completed' })
    await settle()
    expect(walk.rows.value.map((row) => row.oid)).toEqual(['1.3.6.1.2.1'])
    expect(walk.target.value.objectId).toBe(11)
  })

  it('updates the table at most every 200 ms while frames stream in', async () => {
    const walk = setup()
    const socket = await started(walk)
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.1')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(walk.rows.value).toHaveLength(1)

    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.2')] })
    socket.handlers.onFrame({ type: 'data', variables: [variable('1.3.6.1.9.3')] })
    await vi.advanceTimersByTimeAsync(50)
    expect(walk.rows.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(walk.rows.value).toHaveLength(3)
  })

  it('closes the socket when its owner goes away', async () => {
    const walk = setup()
    const socket = await started(walk)
    scope.stop()
    expect(socket.close).toHaveBeenCalled()
  })
})
