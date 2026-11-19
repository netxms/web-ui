import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ startObjectPoll: vi.fn() }))
vi.mock('@/api/objectsApi', () => api)

import { usePollExecutionStore } from '@/stores/pollExecutionStore'

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = false
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event)
  }

  frame(frame) {
    this.emit('message', { data: JSON.stringify(frame) })
  }

  close() {
    this.closed = true
  }
}

const texts = (execution) => execution.lines.map((line) => [line.level, line.text])

let store

beforeEach(() => {
  setActivePinia(createPinia())
  store = usePollExecutionStore()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  api.startObjectPoll.mockReset()
  api.startObjectPoll.mockResolvedValue({ pollType: 'status', wsUrl: '/v1/polls/output/t1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pollExecutionStore', () => {
  it('streams a poll into its output, levels kept, between the run markers', async () => {
    await store.start(7, 'status')
    expect(api.startObjectPoll).toHaveBeenCalledWith(7, 'status')
    const ws = FakeWebSocket.instances[0]
    expect(ws.url).toContain('/v1/polls/output/t1')
    expect(store.getExecution(7, 'status').status).toBe('running')

    ws.frame({ type: 'output', data: 'Starting status poll of node core' })
    ws.frame({ type: 'output', level: 'info', data: '   Interface status retrieved' })
    ws.frame({ type: 'completed' })

    const execution = store.getExecution(7, 'status')
    expect(texts(execution)).toEqual([
      ['local', '**** Poll request sent to server ****'],
      [null, 'Starting status poll of node core'],
      ['info', '   Interface status retrieved'],
      ['local', '**** Poll completed successfully ****'],
    ])
    expect(execution.status).toBe('completed')
    expect(execution.completedAt).toBeInstanceOf(Date)
    expect(ws.closed).toBe(true)
  })

  it('ignores a second start while the poll runs', async () => {
    await store.start(7, 'status')
    await store.start(7, 'status')
    expect(api.startObjectPoll).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('keeps one output per object and poll type', async () => {
    await store.start(7, 'status')
    await store.start(7, 'topology')
    await store.start(8, 'status')
    expect(api.startObjectPoll).toHaveBeenCalledTimes(3)
    FakeWebSocket.instances[1].frame({ type: 'output', data: 'topology line' })
    expect(texts(store.getExecution(7, 'topology')).at(-1)).toEqual([null, 'topology line'])
    expect(texts(store.getExecution(7, 'status'))).toHaveLength(1)
    expect(texts(store.getExecution(8, 'status'))).toHaveLength(1)
  })

  it('appends a new run to the earlier output, which only Clear empties', async () => {
    await store.start(7, 'status')
    FakeWebSocket.instances[0].frame({ type: 'completed' })
    await store.start(7, 'status')
    FakeWebSocket.instances[1].frame({ type: 'output', data: 'second run' })

    const execution = store.getExecution(7, 'status')
    expect(texts(execution)).toEqual([
      ['local', '**** Poll request sent to server ****'],
      ['local', '**** Poll completed successfully ****'],
      ['local', '**** Poll request sent to server ****'],
      [null, 'second run'],
    ])

    store.clearOutput(7, 'status')
    expect(execution.lines).toEqual([])
    expect(execution.status).toBe('running')
  })

  it('reports a refused start in the output', async () => {
    api.startObjectPoll.mockRejectedValue(new Error('Poll type is not applicable to this object'))
    await store.start(7, 'map-update')

    const execution = store.getExecution(7, 'map-update')
    expect(execution.status).toBe('error')
    expect(execution.error).toBe('Poll type is not applicable to this object')
    expect(texts(execution).slice(1)).toEqual([
      ['error', 'POLL ERROR: Poll type is not applicable to this object'],
      ['local', '**** Poll failed ****'],
    ])
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('reports a connection that ends without the completed frame', async () => {
    await store.start(7, 'status')
    const ws = FakeWebSocket.instances[0]
    ws.frame({ type: 'output', data: 'Starting status poll' })
    ws.emit('close', { code: 1006, reason: '' })

    const execution = store.getExecution(7, 'status')
    expect(execution.status).toBe('error')
    expect(texts(execution).at(-2)).toEqual([
      'error',
      'POLL ERROR: Lost the connection to the server (code 1006); the poll runs on there without output',
    ])
  })

  it('writes nothing for a run that sign-out dropped while it was starting', async () => {
    let answer
    api.startObjectPoll.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const starting = store.start(7, 'status')
    store.reset()
    answer({ wsUrl: '/v1/polls/output/t1' })
    await starting

    expect(store.getExecution(7, 'status')).toBeNull()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
