import { get, put } from './client'

/**
 * Get the XML configuration for a log parser.
 * @param {'syslog'|'windows-event'|'opentelemetry'} type
 * @returns {Promise<{type: string, content: string}>}
 */
export function getLogParser(type) {
  return get(`/v1/log-parsers/${type}`)
}

/**
 * Replace the XML configuration for a log parser.
 * @param {'syslog'|'windows-event'|'opentelemetry'} type
 * @param {string} content - XML document, or empty string to clear
 * @returns {Promise<null>}
 */
export function updateLogParser(type, content) {
  return put(`/v1/log-parsers/${type}`, { content })
}
