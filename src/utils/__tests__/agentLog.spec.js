import { describe, expect, it } from 'vitest'
import {
  AGENT_LOG_TAIL_BYTES,
  agentLogFilename,
  agentLogTail,
  describeAgentLogError,
} from '@/utils/agentLog'

describe('agentLogTail', () => {
  it('keeps a log shorter than the limit whole', () => {
    expect(agentLogTail('first\nsecond\n', 13)).toEqual({
      text: 'first\nsecond\n',
      truncated: false,
    })
  })

  it('drops the incomplete first line of a truncated tail', () => {
    expect(agentLogTail('rst line\nsecond\nthird\n', AGENT_LOG_TAIL_BYTES)).toEqual({
      text: 'second\nthird\n',
      truncated: true,
    })
  })

  // The server includes what the agent writes during the transfer, so the body can exceed it.
  it('treats a body larger than the limit as truncated', () => {
    expect(agentLogTail('ab\ncd\n', 20, 10).truncated).toBe(true)
  })

  it('keeps a truncated tail that has no line break', () => {
    expect(agentLogTail('no newline at all', 10, 10).text).toBe('no newline at all')
  })
})

describe('agentLogFilename', () => {
  it('names the file after the node', () => {
    expect(agentLogFilename('web-01')).toBe('web-01-nxagentd.log')
  })

  it('replaces characters a file name cannot hold', () => {
    expect(agentLogFilename('db:01/primary')).toBe('db-01-primary-nxagentd.log')
  })

  it('falls back when the node has no usable name', () => {
    expect(agentLogFilename('')).toBe('node-nxagentd.log')
  })
})

describe('describeAgentLogError', () => {
  const agentError = (agentErrorCode, agentErrorText = 'text') => ({
    status: 500,
    message: 'Agent error',
    data: { reason: 'Agent error', agentErrorCode, agentErrorText },
  })

  it('explains a log that is not written to a file', () => {
    expect(describeAgentLogError(agentError(945))).toMatch(/does not write its log to a file/)
  })

  it('explains an agent too old for the request', () => {
    expect(describeAgentLogError(agentError(400))).toMatch(/too old/)
  })

  it('points at MasterServers when the agent refuses the server', () => {
    expect(describeAgentLogError(agentError(403))).toMatch(/MasterServers/)
  })

  it('passes any other agent error on with its code', () => {
    expect(describeAgentLogError(agentError(408, 'Request timeout'))).toBe(
      'Agent error 408: Request timeout',
    )
  })

  it('explains the missing access right', () => {
    expect(describeAgentLogError({ status: 403, message: 'Access denied' })).toMatch(
      /Download files/,
    )
  })

  it('reads a 404 as a server without the route', () => {
    expect(describeAgentLogError({ status: 404, message: 'Not found' })).toMatch(/server version/)
  })

  it('shows the server reason for a failure without an agent code', () => {
    expect(
      describeAgentLogError({ status: 500, message: 'No connection to agent', data: {} }),
    ).toBe('No connection to agent')
  })
})
