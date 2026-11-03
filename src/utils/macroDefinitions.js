/**
 * @typedef {Object} MacroDef
 * @property {string} trigger - text inserted on selection
 * @property {string} label
 * @property {string} description
 * @property {string} [group]
 */

/** @type {MacroDef[]} */
export const GLOBAL_MACROS = [
  { trigger: '%n', label: '%n', description: 'Name of event source object', group: 'Object' },
  { trigger: '%a', label: '%a', description: 'IP address of event source object', group: 'Object' },
  { trigger: '%i', label: '%i', description: 'Source object ID (hex)', group: 'Object' },
  { trigger: '%I', label: '%I', description: 'Source object ID (decimal)', group: 'Object' },
  { trigger: '%g', label: '%g', description: 'GUID of the source object', group: 'Object' },
  { trigger: '%L', label: '%L', description: 'Alias of event source object', group: 'Object' },
  { trigger: '%C', label: '%C', description: 'Comment of event source object', group: 'Object' },
  { trigger: '%z', label: '%z', description: 'Zone UIN of source object', group: 'Object' },
  { trigger: '%Z', label: '%Z', description: 'Zone name of source object', group: 'Object' },
  { trigger: '%{', label: '%{name}', description: 'Custom attribute value', group: 'Object' },
  { trigger: '%m', label: '%m', description: "Event's message text", group: 'Event' },
  {
    trigger: '%M',
    label: '%M',
    description: 'Custom message (filter script CUSTOM_MESSAGE)',
    group: 'Event',
  },
  { trigger: '%c', label: '%c', description: 'Event code', group: 'Event' },
  { trigger: '%N', label: '%N', description: 'Event name', group: 'Event' },
  { trigger: '%s', label: '%s', description: 'Event severity as number (0–4)', group: 'Event' },
  { trigger: '%S', label: '%S', description: 'Event severity as text', group: 'Event' },
  {
    trigger: '%t',
    label: '%t',
    description: 'Event timestamp (dd-mm-yyyy hh:mm:ss)',
    group: 'Event',
  },
  { trigger: '%T', label: '%T', description: 'Event timestamp as Unix epoch', group: 'Event' },
  { trigger: '%E', label: '%E', description: 'Comma-separated user tags', group: 'Event' },
  { trigger: '%A', label: '%A', description: "Alarm's text", group: 'Alarm' },
  { trigger: '%K', label: '%K', description: "Alarm's key", group: 'Alarm' },
  { trigger: '%D', label: '%D', description: 'DCI comment (threshold events only)', group: 'DCI' },
  { trigger: '%1', label: '%1', description: 'Event parameter 1', group: 'Parameters' },
  { trigger: '%2', label: '%2', description: 'Event parameter 2', group: 'Parameters' },
  { trigger: '%3', label: '%3', description: 'Event parameter 3', group: 'Parameters' },
  { trigger: '%4', label: '%4', description: 'Event parameter 4', group: 'Parameters' },
  { trigger: '%5', label: '%5', description: 'Event parameter 5', group: 'Parameters' },
  { trigger: '%<', label: '%<name>', description: 'Event parameter by name', group: 'Parameters' },
  { trigger: '%v', label: '%v', description: 'NetXMS server version', group: 'Special' },
  { trigger: '%%', label: '%%', description: 'Literal percent character', group: 'Special' },
  { trigger: '%(nl)', label: '%(nl)', description: 'Newline character', group: 'Special' },
  { trigger: '%(tab)', label: '%(tab)', description: 'Tab character', group: 'Special' },
  { trigger: '%[', label: '%[name]', description: 'Script library output', group: 'Special' },
]

/**
 * Not event macros: printf-style conversions for the legacy client's DataFormatter.format().
 * @type {MacroDef[]}
 */
export const DCI_FORMAT_MACROS = [
  { trigger: '%s', label: '%s', description: 'Value as string', group: 'Value' },
  { trigger: '%d', label: '%d', description: 'Value as integer', group: 'Value' },
  { trigger: '%f', label: '%f', description: 'Value as floating point', group: 'Value' },
  {
    trigger: '%.2f',
    label: '%.2f',
    description: 'Floating point, 2 decimal places',
    group: 'Value',
  },
  { trigger: '%x', label: '%x', description: 'Value as hexadecimal', group: 'Value' },
  {
    trigger: '%{m,u}s',
    label: '%{m,u}s',
    description: 'Multipliers and units (server default)',
    group: 'Multipliers & units',
  },
  {
    trigger: '%{m}s',
    label: '%{m}s',
    description: 'Scale with multipliers (k, M, G, ...)',
    group: 'Multipliers & units',
  },
  {
    trigger: '%{u}s',
    label: '%{u}s',
    description: "Append the DCI's measurement unit",
    group: 'Multipliers & units',
  },
  {
    trigger: '%*s',
    label: '%*s',
    description: 'Short form of %{m}s',
    group: 'Multipliers & units',
  },
  { trigger: '%%', label: '%%', description: 'Literal percent character', group: 'Special' },
]

/**
 * @param {Array<{name: string, displayName?: string}>} inputFields
 * @returns {MacroDef[]}
 */
export function createInputFieldMacros(inputFields) {
  return inputFields.map((f) => ({
    trigger: `%(in:${f.name})`,
    label: `%(in:${f.name})`,
    description: f.displayName || f.name,
    group: 'Input Fields',
  }))
}
