// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  binaryStringToBytes,
  chunkBytes,
  classifyClose,
  classifyPaste,
  describeConnectError,
  findConnection,
  hasUsablePrimaryIp,
  parseSshViewId,
  reconnectDelayMs,
  rememberConnection,
  storedCredentialsState,
  terminalShortcut,
} from '@/utils/sshTerminalProtocol'

describe('classifyClose', () => {
  it.each([
    [{ reason: 'normal', code: 1000 }, 'ended', false],
    [{ reason: 'error', code: 1000 }, 'error', false],
    [{ reason: 'overflow', code: 1000 }, 'overflow', false],
    [{ reason: 'agent_disconnect', code: 1000 }, 'lost', true],
    [{ reason: null, code: 1006 }, 'lost', true],
    // netxmsd shutting down closes with 1000 and no notification.
    [{ reason: null, code: 1000 }, 'lost', true],
    [{ reason: null, code: 1008 }, 'expired', false],
  ])('%j is %s, auto-reconnect %s', (input, kind, autoReconnect) => {
    const result = classifyClose(input)
    expect(result.kind).toBe(kind)
    expect(result.autoReconnect).toBe(autoReconnect)
  })

  it('a user logging out is not reported as an error', () => {
    expect(classifyClose({ reason: 'normal', code: 1000 }).severity).toBe('info')
    expect(classifyClose({ reason: 'error', code: 1000 }).severity).toBe('error')
  })
})

describe('describeConnectError', () => {
  it.each([
    // An agent answer: the login may have been tried, and the agent cannot say which part failed.
    [{ status: 502, data: { reason: 'Remote connect failed' } }, true, true],
    [{ status: 504, data: { reason: 'Request timeout' } }, true, true],
    // Never got as far as the device.
    [{ status: 502, data: { reason: 'Cannot connect to SSH proxy agent' } }, false, true],
    [{ status: 503, data: { reason: 'SSH proxy not available' } }, false, true],
    [{ status: 0, data: null }, false, true],
    // Retrying cannot change these.
    [{ status: 403, data: { reason: 'Access denied' } }, false, false],
    [{ status: 404, data: { reason: 'Invalid object ID' } }, false, false],
    [{ status: 400, data: { reason: 'Invalid terminal size' } }, false, false],
  ])('%j reached device %s, retryable %s', (err, mayHaveReachedDevice, retryable) => {
    const result = describeConnectError(err)
    expect(result.mayHaveReachedDevice).toBe(mayHaveReachedDevice)
    expect(result.retryable).toBe(retryable)
    expect(result.severity).toBe('error')
  })

  it('keeps the server text for an agent failure, so nothing is hidden', () => {
    const result = describeConnectError({ status: 502, data: { reason: 'Remote connect failed' } })
    expect(result.detail).toContain('Remote connect failed')
  })

  it('names the missing subagent when the proxy agent does not know the command', () => {
    const result = describeConnectError({ status: 502, data: { reason: 'Unknown command' } })
    expect(result.detail).toContain('ssh')
    expect(result.mayHaveReachedDevice).toBe(false)
  })
})

describe('reconnectDelayMs', () => {
  it('backs off and then holds at the ceiling', () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)
    expect(delays).toEqual([1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000])
  })
})

describe('chunkBytes', () => {
  it('splits into frames no larger than the limit, without losing or reordering a byte', () => {
    const bytes = Uint8Array.from({ length: 10000 }, (_, i) => i % 251)
    const chunks = chunkBytes(bytes, 4096)
    expect(chunks.map((c) => c.length)).toEqual([4096, 4096, 1808])
    const joined = new Uint8Array(chunks.flatMap((c) => [...c]))
    expect(joined).toEqual(bytes)
  })

  it('leaves a keystroke as one frame', () => {
    expect(chunkBytes(new Uint8Array([13]), 4096).map((c) => c.length)).toEqual([1])
  })
})

describe('binaryStringToBytes', () => {
  it('keeps mouse report bytes above 127 as single bytes', () => {
    expect([...binaryStringToBytes('\x1b[M\xe0')]).toEqual([27, 91, 77, 224])
  })
})

describe('classifyPaste', () => {
  it('pastes one line straight away', () => {
    expect(classifyPaste('show ip route', { bracketed: false }).action).toBe('paste')
  })

  it('asks first when a line break would run something, a trailing one included', () => {
    expect(classifyPaste('reboot\n', { bracketed: false })).toMatchObject({
      action: 'confirm',
      lines: 1,
    })
    expect(classifyPaste('a\r\nb\n\nc', { bracketed: false })).toMatchObject({
      action: 'confirm',
      lines: 3,
    })
  })

  it('does not ask when the shell holds a bracketed paste until Enter', () => {
    expect(classifyPaste('a\nb', { bracketed: true }).action).toBe('paste')
  })

  it('refuses what the agent could silently truncate, bracketed or not', () => {
    const huge = 'x'.repeat(64 * 1024 + 1)
    expect(classifyPaste(huge, { bracketed: true }).action).toBe('reject')
    expect(classifyPaste('x'.repeat(64 * 1024), { bracketed: true }).action).toBe('paste')
  })

  it('measures in bytes, because that is what goes over the wire', () => {
    const multibyte = String.fromCharCode(0xe9).repeat(32 * 1024 + 1)
    expect(classifyPaste(multibyte, { bracketed: true }).action).toBe('reject')
  })
})

describe('terminalShortcut', () => {
  const key = (overrides) => ({
    key: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...overrides,
  })

  it.each([
    [key({ key: 'C', ctrlKey: true, shiftKey: true }), 'copy'],
    [key({ key: 'V', ctrlKey: true, shiftKey: true }), 'paste'],
    [key({ key: 'F', ctrlKey: true, shiftKey: true }), 'find'],
    [key({ key: 'F6', ctrlKey: true, shiftKey: true }), 'leave'],
    // These belong to the shell: SIGINT, literal-next, forward search, a function key.
    [key({ key: 'c', ctrlKey: true }), null],
    [key({ key: 'v', ctrlKey: true }), null],
    [key({ key: 'f', ctrlKey: true }), null],
    [key({ key: 'F6' }), null],
    [key({ key: 'w', ctrlKey: true }), null],
  ])('%j is %s', (event, shortcut) => {
    expect(terminalShortcut(event)).toBe(shortcut)
  })
})

describe('parseSshViewId', () => {
  it.each([
    ['ssh:1', 1],
    ['ssh:12', 12],
    ['ssh:0', null],
    ['ssh:abc', null],
    ['ssh:', null],
    ['tool:1', null],
    [null, null],
  ])('%s is %s', (viewId, index) => {
    expect(parseSshViewId(viewId)).toBe(index)
  })
})

describe('hasUsablePrimaryIp', () => {
  it.each([
    [{ ipAddress: { family: 2, address: '10.0.0.1' } }, true],
    [{ ipAddress: '10.0.0.1' }, true],
    [{ ipAddress: { family: 10, address: '2001:db8::1' } }, true],
    [{ ipAddress: { address: '0.0.0.0' } }, false],
    [{ ipAddress: { address: '::' } }, false],
    [{ ipAddress: null }, false],
    [{}, false],
  ])('%j is %s', (object, usable) => {
    expect(hasUsablePrimaryIp(object)).toBe(usable)
  })
})

describe('storedCredentialsState', () => {
  it('knows the login when the server sent one', () => {
    expect(storedCredentialsState({ ssh: { login: 'admin' } })).toBe('known')
  })

  it('knows there is none when the user could have read it', () => {
    expect(
      storedCredentialsState({ ssh: { login: '' }, effectiveRights: { readCredentials: true } }),
    ).toBe('none')
  })

  it('cannot tell when the server withholds it from this user', () => {
    expect(
      storedCredentialsState({
        ssh: { login: '' },
        effectiveRights: { readCredentials: false, modify: false },
      }),
    ).toBe('hidden')
  })
})

describe('rememberConnection', () => {
  it('never stores a password, whatever it is handed', () => {
    const stored = rememberConnection([], 7, { mode: 'custom', login: 'admin', password: 's3cret' })
    expect(JSON.stringify(stored)).not.toContain('s3cret')
    expect(findConnection(stored, 7)).toEqual({
      objectId: 7,
      mode: 'custom',
      login: 'admin',
      keyId: 0,
    })
  })

  it('replaces the entry of a node instead of adding a second one', () => {
    let stored = rememberConnection([], 7, { mode: 'custom', login: 'a' })
    stored = rememberConnection(stored, 7, { mode: 'custom', login: 'b' })
    expect(stored).toHaveLength(1)
    expect(findConnection(stored, 7).login).toBe('b')
  })

  it('drops the node used longest ago past the limit, keeping the one just used', () => {
    let stored = []
    for (const id of [1, 2, 3]) stored = rememberConnection(stored, id, { mode: 'stored' }, 3)
    stored = rememberConnection(stored, 1, { mode: 'stored' }, 3)
    stored = rememberConnection(stored, 4, { mode: 'stored' }, 3)
    expect(stored.map((entry) => entry.objectId).sort()).toEqual([1, 3, 4])
  })

  it('finds nothing in a corrupt or missing value', () => {
    expect(findConnection(undefined, 7)).toBeNull()
    expect(findConnection({ 7: {} }, 7)).toBeNull()
  })
})
