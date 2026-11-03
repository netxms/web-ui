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
    ws.emit('message', { data: '{"type":"completed"}' })
    const other = open()
    other.ws.emit('message', { data: 'null' })
    expect(onFrame.mock.calls[0]).toEqual([{ type: 'output', data: 'plain text' }])
    expect(other.onFrame.mock.calls).toEqual([[{ type: 'output', data: 'null' }]])
  })

  it('passes the close event through', () => {
    const { ws, onClose } = open()
    ws.emit('close', { code: 1006 })
    expect(onClose).toHaveBeenCalledWith({ code: 1006 })
  })

  // A script printing in a loop sends thousands of frames a second. One render and layout for each
  // froze the page for 25 s over 5000 lines.
  describe('a burst of output', () => {
    const output = (text) => ({ data: JSON.stringify({ type: 'output', data: text }) })

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('arrives merged, the first chunk at once and the rest once per interval', () => {
      const { ws, onFrame } = open()
      ws.emit('message', output('a'))
      ws.emit('message', output('b'))
      ws.emit('message', output('c'))
      expect(onFrame.mock.calls).toEqual([[{ type: 'output', data: 'a' }]])

      vi.advanceTimersByTime(100)
      expect(onFrame.mock.calls).toEqual([
        [{ type: 'output', data: 'a' }],
        [{ type: 'output', data: 'bc' }],
      ])
    })

    it('does not hold back the output of a slow script', () => {
      const { ws, onFrame } = open()
      ws.emit('message', output('a'))
      vi.advanceTimersByTime(500)
      ws.emit('message', output('b'))
      expect(onFrame.mock.calls).toEqual([
        [{ type: 'output', data: 'a' }],
        [{ type: 'output', data: 'b' }],
      ])
    })

    it('goes out ahead of the frame that follows it', () => {
      const { ws, onFrame } = open()
      ws.emit('message', output('a'))
      ws.emit('message', output('b'))
      ws.emit('message', { data: '{"type":"result","data":1}' })
      ws.emit('message', { data: '{"type":"completed"}' })
      expect(onFrame.mock.calls).toEqual([
        [{ type: 'output', data: 'a' }],
        [{ type: 'output', data: 'b' }],
        [{ type: 'result', data: 1 }],
        [{ type: 'completed' }],
      ])

      vi.advanceTimersByTime(100)
      expect(onFrame).toHaveBeenCalledTimes(4)
    })

    it('goes out ahead of the close', () => {
      const { ws, onFrame, onClose } = open()
      const order = []
      onFrame.mockImplementation((frame) => order.push(frame.data))
      onClose.mockImplementation(() => order.push('closed'))
      ws.emit('message', output('a'))
      ws.emit('message', output('b'))
      ws.emit('close', { code: 1000 })
      expect(order).toEqual(['a', 'b', 'closed'])
    })
  })
})
