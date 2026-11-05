import { describe, it, expect, afterEach } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { TERMINAL_RESET } from '@/utils/sshTerminalProtocol'

// Against the real emulator, because what matters is where the cursor ends up.
describe('TERMINAL_RESET', () => {
  let term

  function open() {
    term = new Terminal({ cols: 40, rows: 10, allowProposedApi: true })
  }

  function write(data) {
    return new Promise((resolve) => term.write(data, resolve))
  }

  function cursor() {
    return { x: term.buffer.active.cursorX, y: term.buffer.active.cursorY }
  }

  function row(y) {
    return term.buffer.active.getLine(y).translateToString(true)
  }

  afterEach(() => {
    term.dispose()
  })

  it('leaves the cursor where it is on the main screen, so nothing gets written over', async () => {
    open()
    await write('first\r\nsecond\r\n$ ')
    const before = cursor()

    await write(TERMINAL_RESET)

    expect(cursor()).toEqual(before)
    await write('next')
    expect(row(0)).toBe('first')
    expect(row(1)).toBe('second')
    expect(row(2)).toBe('$ next')
  })

  it('takes a dead full-screen program off the screen, back to where it started', async () => {
    open()
    await write('first\r\n$ ')
    await write('\x1b[?1049h\x1b[5;5Hinside')
    expect(term.buffer.active.type).toBe('alternate')

    await write(TERMINAL_RESET)

    expect(term.buffer.active.type).toBe('normal')
    expect(cursor()).toEqual({ x: 2, y: 1 })
    expect(row(0)).toBe('first')
  })

  it('turns off the modes a dead program can leave on', async () => {
    open()
    await write('\x1b[?2004h\x1b[?1000h\x1b[?1h\x1b[31m')
    expect(term.modes.bracketedPasteMode).toBe(true)
    expect(term.modes.mouseTrackingMode).toBe('vt200')

    await write(TERMINAL_RESET)

    expect(term.modes.bracketedPasteMode).toBe(false)
    expect(term.modes.mouseTrackingMode).toBe('none')
    expect(term.modes.applicationCursorKeysMode).toBe(false)
  })
})
