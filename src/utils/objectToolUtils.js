// ObjectMenuFilter flags

export const FILTER_REQUIRES_SNMP = 0x01
export const FILTER_REQUIRES_AGENT = 0x02
export const FILTER_REQUIRES_OID_MATCH = 0x04
export const FILTER_REQUIRES_NODE_OS_MATCH = 0x08
export const FILTER_REQUIRES_TEMPLATE_MATCH = 0x10
export const FILTER_REQUIRES_CUSTOM_ATTRIBUTE_MATCH = 0x40
export const FILTER_REQUIRES_SSH = 0x80
export const FILTER_REQUIRES_ETHERNET_IP = 0x100
export const FILTER_REQUIRES_MODBUS_TCP = 0x200

// Server InputFieldType

export const INPUT_TYPES = [
  { value: 0, label: 'Text' },
  { value: 1, label: 'Password' },
  { value: 2, label: 'Number' },
  { value: 3, label: 'Date & Time' },
]

export const COLUMN_FORMATS = [
  { value: 0, label: 'String' },
  { value: 1, label: 'Integer' },
  { value: 2, label: 'Float' },
  { value: 3, label: 'IP Address' },
  { value: 4, label: 'MAC Address' },
  { value: 5, label: 'IfIndex' },
]

// Applicable object classes bitmask

export const APPLICABLE_NODE = 0x01
export const APPLICABLE_INTERFACE = 0x02
export const APPLICABLE_SENSOR = 0x04
export const APPLICABLE_ACCESS_POINT = 0x08

// Types where non-Node classes are allowed
export const MULTI_CLASS_TYPES = new Set(['server-script', 'url', 'ssh-command'])

export const TABLE_TYPES = new Set(['snmp-table', 'agent-list'])

// Types with output options (generatesOutput, suppressSuccessMessage)
export const OUTPUT_TYPES = new Set([
  'command',
  'action',
  'server-command',
  'ssh-command',
  'server-script',
])

// Types with the TCP tunnel option
export const TCP_TUNNEL_TYPES = new Set(['command', 'url'])

export const CONTAINER_CONTEXT_TYPES = new Set([
  'command',
  'server-command',
  'server-script',
  'url',
])

const SEP = ''

/** Single-string types return { data }, compound types named fields. */
export function parseToolData(type, data) {
  const parts = (data ?? '').split(SEP)
  switch (type) {
    case 'agent-list':
      return {
        title: parts[0] ?? '',
        parameter: parts[1] ?? '',
        regexp: parts[2] ?? '',
      }
    case 'agent-table':
      return {
        title: parts[0] ?? '',
        parameter: parts[1] ?? '',
      }
    case 'file-download': {
      const maxSize = parseInt(parts[1] ?? '0', 10)
      return {
        remoteFileName: parts[0] ?? '',
        maxSize: Number.isNaN(maxSize) ? 0 : maxSize,
        followChanges: parts[2] === 'true',
      }
    }
    case 'snmp-table':
      return { title: parts[0] ?? '' }
    default:
      return { data: data ?? '' }
  }
}

function buildToolData(type, fields) {
  switch (type) {
    case 'agent-list':
      return [fields.title ?? '', fields.parameter ?? '', fields.regexp ?? ''].join(SEP)
    case 'agent-table':
      return [fields.title ?? '', fields.parameter ?? ''].join(SEP)
    case 'file-download':
      return [
        fields.remoteFileName ?? '',
        String(fields.maxSize ?? 0),
        fields.followChanges ? 'true' : 'false',
      ].join(SEP)
    case 'snmp-table':
      return fields.title ?? ''
    default:
      return fields.data ?? ''
  }
}

function parseFilterXml(xmlString) {
  const result = {
    flags: 0,
    snmpOid: '',
    toolOS: '',
    toolTemplate: '',
    toolCustomAttributes: '',
  }
  if (!xmlString) return result
  try {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
    const root = doc.querySelector('objectMenuFilter')
    if (!root) return result
    const flagsEl = root.querySelector('flags')
    if (flagsEl) result.flags = parseInt(flagsEl.textContent ?? '0', 10) || 0
    result.snmpOid = root.querySelector('snmpOid')?.textContent ?? ''
    result.toolOS = root.querySelector('toolOS')?.textContent ?? ''
    result.toolTemplate = root.querySelector('toolTemplate')?.textContent ?? ''
    result.toolCustomAttributes = root.querySelector('toolCustomAttributes')?.textContent ?? ''
  } catch {
    // defaults on parse error
  }
  return result
}

/** '' when the filter has no content. */
function buildFilterXml(filter) {
  if (
    !filter ||
    (filter.flags === 0 &&
      !filter.snmpOid &&
      !filter.toolOS &&
      !filter.toolTemplate &&
      !filter.toolCustomAttributes)
  ) {
    return ''
  }
  const parts = [`<flags>${filter.flags}</flags>`]
  if (filter.snmpOid) parts.push(`<snmpOid>${escapeXml(filter.snmpOid)}</snmpOid>`)
  if (filter.toolOS) parts.push(`<toolOS>${escapeXml(filter.toolOS)}</toolOS>`)
  if (filter.toolTemplate)
    parts.push(`<toolTemplate>${escapeXml(filter.toolTemplate)}</toolTemplate>`)
  if (filter.toolCustomAttributes)
    parts.push(
      `<toolCustomAttributes>${escapeXml(filter.toolCustomAttributes)}</toolCustomAttributes>`,
    )
  return `<objectMenuFilter>${parts.join('')}</objectMenuFilter>`
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `tool` is null for a new one. */
export function buildToolForm(tool) {
  const type = tool?.type ?? 'internal'
  return {
    name: tool?.name ?? '',
    description: tool?.description ?? '',
    type,
    dataFields: parseToolData(type, tool?.data ?? ''),
    flags: {
      askConfirmation: tool?.flags?.askConfirmation ?? false,
      generatesOutput: tool?.flags?.generatesOutput ?? false,
      disabled: tool?.flags?.disabled ?? false,
      showInCommands: tool?.flags?.showInCommands ?? false,
      snmpIndexedByValue: tool?.flags?.snmpIndexedByValue ?? false,
      runInContainerContext: tool?.flags?.runInContainerContext ?? false,
      suppressSuccessMessage: tool?.flags?.suppressSuccessMessage ?? false,
      setupTcpTunnel: tool?.flags?.setupTcpTunnel ?? false,
    },
    confirmationMessage: tool?.confirmationMessage ?? '',
    commandName: tool?.commandName ?? '',
    commandShortName: tool?.commandShortName ?? '',
    remotePort: tool?.remotePort ?? 0,
    remoteHost: tool?.remoteHost ?? '',
    icon: tool?.icon ?? null,
    applicableClasses: tool?.applicableClasses ?? APPLICABLE_NODE,
    acl: [...(tool?.acl ?? [])],
    inputFields: (tool?.inputFields ?? []).map((f) => ({ ...f })),
    columns: (tool?.columns ?? []).map((c) => ({ ...c })),
    filter: parseFilterXml(tool?.filter ?? ''),
  }
}

export function buildToolPayload(form) {
  return {
    name: form.name,
    description: form.description,
    type: form.type,
    data: buildToolData(form.type, form.dataFields),
    flags: { ...form.flags },
    confirmationMessage: form.confirmationMessage,
    commandName: form.commandName,
    commandShortName: form.commandShortName,
    remotePort: form.remotePort,
    remoteHost: form.remoteHost,
    icon: form.icon,
    applicableClasses: form.applicableClasses,
    acl: [...form.acl],
    inputFields: form.inputFields.map((f) => ({ ...f })),
    columns: form.columns.map((c) => ({ ...c })),
    filter: buildFilterXml(form.filter),
  }
}

export const TOOL_TYPE_LABELS = {
  internal: 'Internal',
  action: 'Agent command',
  'snmp-table': 'SNMP Table',
  'agent-list': 'Agent List',
  url: 'URL',
  command: 'Local command',
  'server-command': 'Server Command',
  'file-download': 'File Download',
  'server-script': 'Server Script',
  'agent-table': 'Agent Table',
  'ssh-command': 'SSH Command',
}

export const TOOL_TYPES = Object.entries(TOOL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export function inputTypeLabel(type) {
  return INPUT_TYPES.find((t) => t.value === type)?.label ?? String(type)
}

export function columnFormatLabel(format) {
  return COLUMN_FORMATS.find((f) => f.value === format)?.label ?? String(format)
}
