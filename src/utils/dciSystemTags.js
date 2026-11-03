/**
 * The legacy DCI editor's "Interpretation" tag vocabulary, in the legacy order.
 *
 * Only the dotted form (`iface.inbound.bits`, not `iface-inbound-bits`) is valid since schema
 * 70.26. A WebAPI DCI update stores the tag as sent, so the old form makes the DCI invisible
 * to everything that matches by tag (interface traffic views, data export).
 *
 * @typedef {object} DciSystemTag
 * @property {string} tag
 * @property {string} label - legacy wording
 */

/** @type {DciSystemTag[]} */
export const DCI_SYSTEM_TAGS = [
  { tag: 'iface.inbound.bits', label: 'Interface traffic - Inbound - bits/sec' },
  { tag: 'iface.inbound.bytes', label: 'Interface traffic - Inbound - bytes/sec' },
  { tag: 'iface.inbound.util', label: 'Interface traffic - Inbound - Utilization %' },
  { tag: 'iface.outbound.bits', label: 'Interface traffic - Outbound - bits/sec' },
  { tag: 'iface.outbound.bytes', label: 'Interface traffic - Outbound - bytes/sec' },
  { tag: 'iface.outbound.util', label: 'Interface traffic - Outbound - Utilization %' },
  { tag: 'iface.speed', label: 'Interface speed' },
  { tag: 'eed.edc', label: 'EED - Total facility energy (EDC)' },
  { tag: 'eed.eit', label: 'EED - IT equipment energy (EIT)' },
  { tag: 'eed.win', label: 'EED - Water intake (WIN)' },
  { tag: 'eed.reuse', label: 'EED - Reused energy (REUSE)' },
  { tag: 'eed.ren', label: 'EED - Renewable energy (REN)' },
  { tag: 'power.feed', label: 'Power - Feed power' },
  { tag: 'power.in', label: 'Power - Input side power' },
  { tag: 'power.out', label: 'Power - Output side power' },
  { tag: 'power.gen', label: 'Power - On-site generation' },
  { tag: 'cooling.energy', label: 'Cooling - Energy consumption' },
  { tag: 'cooling.power', label: 'Cooling - Power consumption' },
  { tag: 'cooling.load', label: 'Cooling - Thermal load' },
  { tag: 'cooling.temp.supply', label: 'Cooling - Supply temperature' },
  { tag: 'cooling.temp.return', label: 'Cooling - Return temperature' },
  { tag: 'cooling.flow', label: 'Cooling - Coolant flow rate' },
  { tag: 'env.temp.outdoor', label: 'Environment - Outdoor temperature' },
  { tag: 'env.temp.ambient', label: 'Environment - Ambient temperature' },
  { tag: 'env.temp.supply', label: 'Environment - Supply air temperature' },
  { tag: 'env.temp.return', label: 'Environment - Return air temperature' },
  { tag: 'env.temp.inlet', label: 'Environment - Rack inlet temperature' },
  { tag: 'env.temp.outlet', label: 'Environment - Rack outlet temperature' },
  { tag: 'env.humidity.outdoor', label: 'Environment - Outdoor humidity' },
  { tag: 'env.humidity.ambient', label: 'Environment - Ambient humidity' },
  { tag: 'water.flow', label: 'Water - Intake flow rate' },
  { tag: 'heat.export', label: 'Heat - Exported heat flow' },
]

/**
 * First segment of every tag, in vocabulary order, as the legacy data export view builds its
 * "Tag groups" checkboxes.
 *
 * @type {Array<{ prefix: string, pattern: string, tags: string[] }>}
 */
export const DCI_SYSTEM_TAG_GROUPS = DCI_SYSTEM_TAGS.reduce((groups, { tag }) => {
  const prefix = tag.split('.')[0]
  let group = groups.find((g) => g.prefix === prefix)
  if (!group) {
    group = { prefix, pattern: `${prefix}.*`, tags: [] }
    groups.push(group)
  }
  group.tags.push(tag)
  return groups
}, [])

/** @param {string} tag */
export function isKnownSystemTag(tag) {
  return DCI_SYSTEM_TAGS.some((entry) => entry.tag === tag)
}
