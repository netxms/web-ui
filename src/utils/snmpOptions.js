// Values are the symbolic names the WebAPI uses (`SnmpConfig` / `SnmpAgentConfig`).

export const SNMP_VERSION_OPTIONS = [
  { value: '1', label: 'SNMP v1' },
  { value: '2c', label: 'SNMP v2c' },
  { value: '3', label: 'SNMP v3' },
]

export const SNMP_AUTH_METHOD_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'MD5', label: 'MD5' },
  { value: 'SHA1', label: 'SHA1' },
  { value: 'SHA224', label: 'SHA224' },
  { value: 'SHA256', label: 'SHA256' },
  { value: 'SHA384', label: 'SHA384' },
  { value: 'SHA512', label: 'SHA512' },
]

export const SNMP_PRIV_METHOD_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'DES', label: 'DES' },
  { value: 'AES-128', label: 'AES-128' },
  { value: 'AES-192', label: 'AES-192' },
  { value: 'AES-256', label: 'AES-256' },
]
