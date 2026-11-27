/**
 * Symbolic names for walked OIDs. The walk endpoint sends numeric OIDs only and the MIB endpoint
 * looks up exact nodes only, so a name is found by descending the MIB tree one children list at
 * a time, as legacy's lenient `MibTree.findObject` does on its local copy.
 */

/**
 * @typedef {object} MibName
 * @property {string} name - deepest matching MIB object plus the rest of the OID, e.g. `ifDescr.3`
 * @property {string} fullName - the same with every ancestor, e.g. `iso.org.dod...ifDescr.3`
 * @property {string} objectOid - OID of that MIB object
 */

/**
 * @param {(oid: string) => Promise<{ children?: Array<{ subId: number, oid: string, name?: string|null, hasChildren: boolean }> }|null>} fetchNode
 *   - `''` is the tree root
 */
export function createMibNameResolver(fetchNode) {
  /** OID -> its children by sub-id; null for a node that could not be read. */
  const loaded = new Map()
  const loading = new Map()

  function load(oid) {
    if (!loading.has(oid)) {
      loading.set(
        oid,
        Promise.resolve()
          .then(() => fetchNode(oid))
          .then(
            (node) => new Map((node?.children ?? []).map((child) => [String(child.subId), child])),
            () => null,
          )
          .then((children) => {
            loaded.set(oid, children)
            return children
          }),
      )
    }
    return loading.get(oid)
  }

  /**
   * @param {string} oid - numeric, without a leading dot
   * @returns {Promise<MibName|null>} null when not even the first element is in the MIB tree
   */
  async function resolve(oid) {
    const parts = String(oid ?? '').split('.')
    const names = []
    let parentOid = ''
    let match = null
    let depth = 0
    while (depth < parts.length) {
      const children = loaded.has(parentOid) ? loaded.get(parentOid) : await load(parentOid)
      const child = children?.get(parts[depth])
      if (!child) break
      names.push(child.name || parts[depth])
      match = child
      depth++
      if (!child.hasChildren) break
      parentOid = child.oid
    }
    if (!match) return null
    const rest = parts.slice(depth).join('.')
    const suffix = rest ? `.${rest}` : ''
    return {
      name: names[names.length - 1] + suffix,
      fullName: names.join('.') + suffix,
      objectOid: match.oid,
    }
  }

  return { resolve }
}

/**
 * As legacy's raw value column: `65746830` -> `65 74 68 30`.
 *
 * @param {string|null|undefined} hex
 */
export function formatRawValue(hex) {
  if (!hex) return ''
  return (
    String(hex)
      .toUpperCase()
      .match(/.{1,2}/g)
      ?.join(' ') ?? ''
  )
}
