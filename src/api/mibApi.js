import { get } from './client'

// The server sends enumValues as a "name(value),..." string, e.g. "up(1),down(2)".
function parseEnumValues(raw) {
  if (!raw) return null
  return raw
    .split(',')
    .map((item) => {
      const m = item.trim().match(/^(.+)\((\d+)\)$/)
      return m ? { name: m[1], value: Number(m[2]) } : null
    })
    .filter(Boolean)
}

/**
 * A MIB node with its immediate children.
 * @param {string} [oid] - dotted numeric OID, e.g. "1.3.6.1.2.1.1"; empty for the synthetic root
 * @returns {Promise<object|null>}
 */
export async function getMibNode(oid) {
  const node = oid ? await get(`/v1/snmp-mib/${oid}`) : await get('/v1/snmp-mib')
  if (!node) return null
  return { ...node, enumValues: parseEnumValues(node.enumValues) }
}
