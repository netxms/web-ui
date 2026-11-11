<script setup>
import { computed } from 'vue'
import {
  Droplet,
  Factory,
  Flame,
  Gauge,
  Leaf,
  Server,
  Snowflake,
  Thermometer,
  Zap,
} from 'lucide-vue-next'
import AppLink from '@/components/common/AppLink.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import FigureTile from '@/components/data-center/FigureTile.vue'
import InfoCard from '@/components/objects/InfoCard.vue'
import { isDemoDataCenterId } from '@/api/dataCenterApi'
import {
  usePowerDomainConfigs,
  useTaggedDcis,
  useDataCenterValues,
} from '@/queries/useDataCenterQueries'
import {
  POWER_LOAD_TAGS,
  coolingZoneRows,
  facilityPower,
  feedLossRisks,
  feedTags,
  firstTagLoads,
  nodesOfClass,
  objectMetric,
  powerDomainRows,
  powerSplit,
  rackPowerTotal,
  statusCounts,
  sumKilowatts,
  toKilowatts,
  upsLosses,
} from '@/utils/dataCenter'
import { getClassIconColor, getStatusInfo } from '@/utils/objectUtils'
import { useDataCenterTarget } from '@/composables/useDataCenterTarget'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  /** Facility, as a full sub-tree node */
  object: { type: Object, required: true },
})

const dataCenterTarget = useDataCenterTarget()

const isDemo = computed(() => isDemoDataCenterId(props.object.id))
const facilityId = computed(() => props.object.id)

const domainRows = computed(() => powerDomainRows(props.object))
const zoneRows = computed(() => coolingZoneRows(props.object))
const rooms = computed(() => nodesOfClass(props.object, 'Room'))
const racks = computed(() => nodesOfClass(props.object, 'Rack'))
const domainIds = computed(() => domainRows.value.map((row) => row.node.id))
const zoneIds = computed(() => zoneRows.value.map((row) => row.node.id))
const rackIds = computed(() => racks.value.map((rack) => rack.id))

const CARBON = 'ENTSOE.CarbonIntensity('
const RENEWABLES = 'ENTSOE.RenewableShare('
const FACILITY_TAGS = [
  'heat.export',
  'env.temp.outdoor',
  'env.humidity.outdoor',
  'water.flow',
  'eed.win',
]
const ZONE_TAGS = ['cooling.power']
const RACK_TAGS = ['env.temp.inlet']

const dciObjectIds = computed(() => [
  facilityId.value,
  ...domainIds.value,
  ...zoneIds.value,
  ...rackIds.value,
])
const { configs, isLoading: loadingConfigs } = usePowerDomainConfigs(domainIds)
const {
  items,
  isLoading: loadingDcis,
  isError: dciError,
} = useTaggedDcis(
  dciObjectIds,
  [...new Set([...POWER_LOAD_TAGS, ...FACILITY_TAGS, ...ZONE_TAGS, ...RACK_TAGS])],
  [CARBON, RENEWABLES],
)
const { valueOf, isFetching, isLoading: loadingValues } = useDataCenterValues(items)
/** Until the DCI lists and their values are in, an absent metric is not yet a missing one. */
const loading = computed(() => loadingConfigs.value || loadingDcis.value || loadingValues.value)

const facilityMetric = (base, combine) =>
  objectMetric(items.value, facilityId.value, base, valueOf, combine)

const power = computed(() => facilityPower(domainRows.value, configs.value, items.value, valueOf))
const itLoad = computed(() => rackPowerTotal(rackIds.value, items.value, valueOf))
const coolingPower = computed(() =>
  sumKilowatts(zoneIds.value, 'cooling.power', items.value, valueOf),
)
const losses = computed(() => upsLosses(domainRows.value, configs.value, items.value, valueOf))
const pue = computed(() =>
  power.value.value != null &&
  itLoad.value.value > 0 &&
  itLoad.value.reporting === itLoad.value.total
    ? power.value.value / itLoad.value.value
    : null,
)

const fmt = (value, digits = 1) => (value == null ? '—' : value.toFixed(digits))
const pct = (share) => `${Math.round(share * 100)} %`
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

function kilowatts(metric) {
  return metric ? toKilowatts(metric.value, metric.unit) : null
}

/** Where each figure comes from, behind the info icon beside its label. */
const FIGURE_INFO = {
  power: 'power.feed of the grid entry domains plus power.gen of the generator domains.',
  it: 'power.feed of the racks in this facility, each rack counted once.',
  pue: 'Facility power divided by IT load, right now. Shown when every rack with power metrics reports.',
  cooling: 'cooling.power of the cooling zones.',
  heat: 'heat.export of the facility.',
  outdoor: 'env.temp.outdoor and env.humidity.outdoor of the facility.',
  water: 'water.flow of the facility; the meter total is its eed.win.',
  carbon: "The ENTSO-E subagent's ENTSOE.CarbonIntensity metric, on the facility.",
  renewables: "The ENTSO-E subagent's ENTSOE.RenewableShare metric, on the facility.",
}

const SPLIT_INFO =
  "IT is the racks' power.feed, cooling the zones' cooling.power, UPS losses each UPS's power.in less its power.out; Other is the rest of facility power."

/** Three rows of three: power, cooling, water and grid. */
const figures = computed(() => {
  const heat = facilityMetric('heat.export')
  const temp = facilityMetric('env.temp.outdoor', 'max')
  const humidity = facilityMetric('env.humidity.outdoor', 'max')
  const flow = facilityMetric('water.flow')
  const meter = facilityMetric('eed.win')
  const carbon = facilityMetric(CARBON, 'max')
  const renewables = facilityMetric(RENEWABLES, 'max')
  const unmeasured = power.value.unmeasured.map((node) => node.name).join(', ')
  const note = (text) => (loading.value ? '' : text)
  return [
    {
      id: 'power',
      tone: 'power',
      icon: Zap,
      label: 'Facility power',
      value: fmt(power.value.value),
      unit: 'kW',
      note: note(unmeasured ? `${unmeasured} not measured` : 'grid entries and generators'),
    },
    {
      id: 'it',
      tone: 'power',
      icon: Server,
      label: 'IT load',
      value: fmt(itLoad.value.value),
      unit: 'kW',
      note: note(
        !itLoad.value.total
          ? 'no rack power metrics'
          : itLoad.value.reporting < itLoad.value.total
            ? `${itLoad.value.reporting} of ${itLoad.value.total} racks report`
            : plural(itLoad.value.total, 'rack', 'racks'),
      ),
    },
    {
      id: 'pue',
      tone: 'power',
      icon: Gauge,
      label: 'PUE',
      value: fmt(pue.value, 2),
      note: 'instantaneous',
    },
    {
      id: 'cooling',
      tone: 'cooling',
      icon: Snowflake,
      label: 'Cooling power',
      value: fmt(coolingPower.value.value),
      unit: 'kW',
      note: note(
        coolingPower.value.count
          ? plural(coolingPower.value.count, 'zone', 'zones')
          : 'no cooling.power metric',
      ),
    },
    {
      id: 'heat',
      tone: 'cooling',
      icon: Flame,
      label: 'Heat exported',
      value: fmt(kilowatts(heat)),
      unit: 'kW',
      note: note(heat ? '' : 'no heat.export metric'),
    },
    {
      id: 'outdoor',
      tone: 'cooling',
      icon: Thermometer,
      label: 'Outdoor',
      value: fmt(temp?.value ?? null),
      unit: '°C',
      note: humidity ? `${Math.round(humidity.value)} % humidity` : '',
    },
    {
      id: 'water',
      tone: 'water',
      icon: Droplet,
      label: 'Water intake',
      value: fmt(flow?.value ?? null, 2),
      unit: flow?.unit ?? '',
      note: note(
        meter
          ? `meter ${Math.round(meter.value).toLocaleString()} ${meter.unit}`.trim()
          : flow
            ? ''
            : 'no water.flow metric',
      ),
    },
    {
      id: 'carbon',
      tone: 'water',
      icon: Factory,
      label: 'Grid carbon intensity',
      value: fmt(carbon?.value ?? null, 0),
      unit: carbon?.unit ?? '',
      note: note(carbon ? '' : 'no ENTSO-E metric'),
    },
    {
      id: 'renewables',
      tone: 'water',
      icon: Leaf,
      label: 'Grid renewable share',
      value: fmt(renewables?.value ?? null, 0),
      unit: '%',
      note: note(renewables ? '' : 'no ENTSO-E metric'),
      share: renewables ? Math.min(Math.max(renewables.value, 0), 100) : null,
    },
  ]
})

const SPLIT_PARTS = {
  it: {
    label: 'IT',
    color: 'color-mix(in srgb, var(--p-text-color) 42%, var(--p-content-background))',
  },
  cooling: { label: 'Cooling', color: getClassIconColor('CoolingZone') },
  losses: { label: 'UPS losses', color: getClassIconColor('PowerDomain') },
  other: {
    label: 'Other',
    color: 'color-mix(in srgb, var(--p-text-color) 16%, var(--p-content-background))',
  },
}

/** Where the facility power goes; only once IT load, the largest part, is known. */
const split = computed(() => {
  if (itLoad.value.value == null) return null
  const result = powerSplit(power.value.value, [
    { id: 'it', value: itLoad.value.value },
    { id: 'cooling', value: coolingPower.value.value },
    { id: 'losses', value: losses.value },
  ])
  if (!result) return null
  return {
    ...result,
    parts: result.parts.map((part) => ({ ...part, ...SPLIT_PARTS[part.id] })),
  }
})

const roomOfRack = computed(() => {
  const map = new Map()
  for (const room of rooms.value) {
    for (const child of room.children ?? []) if (!map.has(child.id)) map.set(child.id, room)
  }
  return map
})

/** Demo racks exist only in the seed, so without a room there is nothing to open. */
function rackFindingTarget(rack, room) {
  if (room) return dataCenterTarget(room, 'floorPlan')
  return isDemo.value ? null : objectTarget({ id: rack.id, class: 'Rack' }, 'rack')
}

const loads = computed(() => firstTagLoads(domainIds.value, items.value, valueOf))
const risks = computed(() =>
  feedLossRisks(
    domainRows.value,
    domainRows.value,
    configs.value,
    loads.value,
    feedTags(domainRows.value, configs.value),
  ),
)

const findings = computed(() => [
  ...racks.value
    .filter((rack) => rack.status >= 1 && rack.status <= 4)
    .sort((a, b) => b.status - a.status || a.name.localeCompare(b.name))
    .map((rack) => {
      const room = roomOfRack.value.get(rack.id) ?? null
      const inlet = objectMetric(items.value, rack.id, 'env.temp.inlet', valueOf, 'max')
      return {
        key: `rack-${rack.id}`,
        status: rack.status,
        name: rack.name,
        where: room?.name ?? '',
        reason: inlet
          ? `inlet ${fmt(inlet.value)} °C`
          : getStatusInfo(rack.status).label.toLowerCase(),
        target: rackFindingTarget(rack, room),
      }
    }),
  ...risks.value.map((risk) => ({
    key: `risk-${risk.lostFeed}-${risk.id}`,
    status: 2,
    name: risk.node.name,
    where: `if feed ${risk.lostFeed} is lost`,
    reason: `${fmt(risk.load)} of ${fmt(risk.rated)} kW`,
    target: dataCenterTarget(risk.node, 'power'),
  })),
])

const statusGroups = computed(() =>
  [
    { id: 'rooms', title: 'Rooms', nodes: rooms.value },
    { id: 'power', title: 'Power domains', nodes: domainRows.value.map((row) => row.node) },
    { id: 'cooling', title: 'Cooling zones', nodes: zoneRows.value.map((row) => row.node) },
  ]
    .filter((group) => group.nodes.length)
    .map((group) => ({
      ...group,
      counts: statusCounts(group.nodes),
      flagged: group.nodes
        .filter((node) => node.status !== 0)
        .sort((a, b) => b.status - a.status || a.name.localeCompare(b.name)),
      normal: group.nodes.filter((node) => node.status === 0).length,
    })),
)

const statusSummary = computed(() => {
  const total = statusGroups.value.reduce((sum, group) => sum + group.nodes.length, 0)
  return total ? plural(total, 'object', 'objects') : null
})
</script>

<template>
  <div class="facility-overview">
    <DemoNoticeBanner v-if="isDemo" message="Demo facility: the figures are sample data." />

    <div class="fo-toolbar">
      <span class="fo-muted">Live figures from the facility's DCIs</span>
      <span v-if="dciError" class="fo-muted">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        Some metrics could not be read.
      </span>
      <i v-if="loading || isFetching" class="pi pi-spin pi-spinner fo-muted" aria-hidden="true" />
    </div>

    <section class="fo-figures" aria-label="Facility figures">
      <FigureTile
        v-for="figure in figures"
        :key="figure.id"
        :label="figure.label"
        :icon="figure.icon"
        :tone="figure.tone"
        :value="figure.value"
        :unit="figure.unit"
        :note="figure.note"
        :info="FIGURE_INFO[figure.id]"
      >
        <div
          v-if="figure.share != null"
          class="fo-share"
          role="img"
          :aria-label="`${Math.round(figure.share)} % renewable`"
        >
          <span class="fo-share__fill" :style="{ width: `${figure.share}%` }" />
        </div>
      </FigureTile>
    </section>

    <section v-if="split" class="fo-split" aria-labelledby="fo-split-title">
      <div class="fo-split__head">
        <h3 id="fo-split-title" class="fo-section__title">
          Where {{ fmt(power.value) }} kW goes
        </h3>
        <InfoHint :text="SPLIT_INFO" label="the power split" />
      </div>
      <div
        class="fo-split__bar"
        role="img"
        :aria-label="split.parts.map((p) => `${p.label} ${fmt(p.value)} kW`).join(', ')"
      >
        <span
          v-for="part in split.parts"
          :key="part.id"
          class="fo-split__part"
          :style="{ flex: part.value, background: part.color }"
          :title="`${part.label}: ${fmt(part.value)} kW`"
        />
      </div>
      <ul class="fo-split__legend">
        <li v-for="part in split.parts" :key="part.id">
          <span class="fo-swatch" :style="{ background: part.color }" />
          {{ part.label }}
          <strong>{{ fmt(part.value) }} kW</strong> · {{ pct(part.share) }}
        </li>
      </ul>
      <p v-if="split.exceeds" class="fo-muted fo-hint">
        The parts add up to {{ fmt(split.measured) }} kW, more than the {{ fmt(power.value) }} kW
        the grid entries and generators report.
      </p>
    </section>

    <div class="fo-columns">
      <InfoCard
        title="Needs attention"
        :summary="loading ? null : findings.length ? String(findings.length) : 'All clear'"
      >
        <ul v-if="findings.length" class="fo-findings">
          <li v-for="finding in findings" :key="finding.key">
            <component
              :is="finding.target ? AppLink : 'div'"
              v-bind="finding.target ? { to: finding.target } : {}"
              :aria-label="[finding.name, finding.where, finding.reason].filter(Boolean).join(', ')"
              class="fo-finding"
            >
              <StatusIcon :status="finding.status" class="fo-finding__icon" />
              <span class="fo-finding__who">
                <span class="fo-finding__name">{{ finding.name }}</span>
                <span v-if="finding.where" class="fo-finding__where">{{ finding.where }}</span>
              </span>
              <span
                class="fo-finding__reason"
                :style="{ color: getStatusInfo(finding.status).textColor }"
              >
                {{ finding.reason }}
              </span>
            </component>
          </li>
        </ul>
        <p v-else-if="!loading" class="fo-muted fo-hint">
          No rack in trouble, and every power domain stays within its rating when one feed is lost.
        </p>
      </InfoCard>

      <InfoCard title="Status" :summary="statusSummary">
        <p v-if="!statusGroups.length" class="fo-muted fo-hint">
          No rooms, power domains or cooling zones below this facility yet.
        </p>
        <div v-else class="fo-status">
          <section v-for="group in statusGroups" :key="group.id" class="fo-status__group">
            <header class="fo-status__head">
              <h4 class="fo-status__title">{{ group.title }}</h4>
              <span class="fo-status__counts">
                <template v-for="(entry, i) in group.counts" :key="entry.status">
                  <template v-if="i"> · </template>{{ entry.count }}
                  {{ getStatusInfo(entry.status).label }}
                </template>
              </span>
            </header>
            <div
              class="fo-status__bar"
              role="img"
              :aria-label="`${group.title}: ${group.counts
                .map((c) => `${c.count} ${getStatusInfo(c.status).label}`)
                .join(', ')}`"
            >
              <span
                v-for="entry in group.counts"
                :key="entry.status"
                :style="{ flex: entry.count, background: getStatusInfo(entry.status).color }"
              />
            </div>
            <ul class="fo-status__list">
              <li v-for="node in group.flagged" :key="node.id">
                <AppLink :to="dataCenterTarget(node)" class="fo-chip">
                  <StatusIcon :status="node.status" />
                  {{ node.name }}
                </AppLink>
              </li>
              <li v-if="group.normal" class="fo-muted fo-status__normal">
                {{ group.flagged.length ? `+ ${group.normal} normal` : 'all normal' }}
              </li>
            </ul>
          </section>
        </div>
      </InfoCard>
    </div>
  </div>
</template>

<style scoped>
.facility-overview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  height: 100%;
  overflow-y: auto;
  container-type: inline-size;
}

.facility-overview > * {
  flex-shrink: 0;
}

.fo-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.fo-muted {
  color: var(--p-text-muted-color);
}

.fo-figures {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.fo-share {
  height: 6px;
  margin-top: 0.25rem;
  border-radius: 3px;
  background: color-mix(in srgb, var(--p-text-color) 8%, var(--p-content-background));
  overflow: hidden;
}

.fo-share__fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--tile-hue);
}

.fo-section__title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.fo-split {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fo-split__bar,
.fo-status__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
}

.fo-split__part {
  min-width: 3px;
}

.fo-split__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.fo-split__legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.fo-swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 2px;
  flex-shrink: 0;
}

.fo-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
}

.fo-hint {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
}

.fo-findings {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fo-findings li {
  border-bottom: 1px solid var(--p-content-border-color);
}

.fo-findings li:last-child {
  border-bottom: 0;
}

.fo-finding {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.375rem;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
  font-size: 0.875rem;
}

a.fo-finding:hover {
  background: var(--p-content-hover-background);
}

.fo-finding__icon {
  flex-shrink: 0;
}

.fo-finding__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.fo-finding__name {
  font-weight: 600;
}

.fo-finding__where {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.fo-finding__reason {
  margin-inline-start: auto;
  font-weight: 600;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.fo-status {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.fo-status__group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.fo-status__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.fo-status__title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.fo-status__counts {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.fo-status__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.fo-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.2rem 0.55rem 0.2rem 0.4rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 999px;
  font-size: 0.8125rem;
  color: inherit;
  text-decoration: none;
}

.fo-chip:hover {
  background: var(--p-content-hover-background);
}

.fo-status__normal {
  font-size: 0.8125rem;
}

.fo-split__head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

@container (max-width: 760px) {
  .fo-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 560px) {
  .fo-figures {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
