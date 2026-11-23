import { describe, it, expect } from 'vitest'
import { agentCommandLine } from '@/utils/agentCommand'

/** The server's `SplitCommandLine` (src/server/core/tools.cpp), for round-trip checks. */
function splitCommandLine(command) {
  const out = []
  let current = ''
  let state = 3
  for (const c of command) {
    if (state === 1) {
      if (c === '"') state = 0
      else current += c
    } else if (state === 2) {
      if (c === "'") state = 0
      else current += c
    } else if (c === ' ') {
      if (state === 0) {
        out.push(current)
        current = ''
        state = 3
      }
    } else if (c === '"') state = 1
    else if (c === "'") state = 2
    else {
      current += c
      state = 0
    }
  }
  if (state !== 3) out.push(current)
  return out
}

/** The server's macro expansion of `%%` (the only macro an argument can contain after quoting). */
function expandPercent(command) {
  return command.replaceAll('%%', '%')
}

describe('agentCommandLine', () => {
  it('leaves plain arguments bare', () => {
    expect(agentCommandLine('Process.Terminate', [1234])).toBe('Process.Terminate 1234')
  })

  it('quotes arguments with spaces', () => {
    expect(agentCommandLine('Service.Start', ['Print Spooler'])).toBe(
      'Service.Start "Print Spooler"',
    )
  })

  it('doubles percent signs so the server does not expand them as macros', () => {
    expect(agentCommandLine('System.UninstallProduct', ['100%Free'])).toBe(
      'System.UninstallProduct 100%%Free',
    )
  })

  it.each([
    ['Print Spooler'],
    ['say "hi"'],
    ["it's"],
    [`a "b" c's d`],
    ['{3F2504E0-4F89-11D3-9A0C-0305E82C3301}'],
    ['50% off'],
    [''],
  ])('round-trips %j through the server split', (arg) => {
    const parts = splitCommandLine(expandPercent(agentCommandLine('X.Action', [arg])))
    expect(parts).toEqual(['X.Action', arg])
  })
})
