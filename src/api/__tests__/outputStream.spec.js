import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildWsUrl, openOutputStream } from '@/api/outputStream'

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.listeners = {}
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event)
  }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildWsUrl', () => {
  it('puts a relative API base on the page origin with the ws scheme', () => {
    expect(buildWsUrl('/v1/script-executions/output/abc')).toBe(
      `ws://${window.location.host}/api/v1/script-executions/output/abc`,
    )
  })
})

describe('openOutputStream', () => {
  function open() {
    const onFrame = vi.fn()
    const onClose = vi.fn()
    const ws = openOutputStream('/v1/script-executions/output/abc', { onFrame, onClose })
    return { ws, onFrame, onClose }
  }

  it('connects to the built URL', () => {
    const { ws } = open()
    expect(ws.url).toBe(buildWsUrl('/v1/script-executions/output/abc'))
  })

  it('hands JSON frames over parsed', () => {
    const { ws, onFrame } = open()
    ws.emit('message', { data: '{"type":"output","data":"line 1\\n"}' })
    ws.emit('message', { data: '{"type":"completed"}' })
    expect(onFrame.mock.calls).toEqual([
      [{ type: 'output', data: 'line 1\n' }],
      [{ type: 'completed' }],
    ])
  })

  it('treats a frame that is not a JSON object as output', () => {
    const { ws, onFrame } = open()
    ws.emit('message', { data: 'plain text' })
    ws.emit('message', { data: 'null' })
    expect(onFrame.mock.calls).toEqual([
      [{ type: 'output', data: 'plain text' }],
      [{ type: 'output', data: 'null' }],
    ])
  })

  it('passes the close event through', () => {
    const { ws, onClose } = open()
    ws.emit('close', { code: 1006 })
    expect(onClose).toHaveBeenCalledWith({ code: 1006 })
  })
})
