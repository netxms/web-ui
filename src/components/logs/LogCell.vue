<script setup>
import { computed } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import {
  COLUMN_KIND,
  getCodedLabel,
  getColumnKind,
  getSeverityDisplay,
  isUnsetUserId,
} from '@/utils/logColumnTypes'
import ObjectIcon from '@/components/objects/ObjectIcon.vue'
import { formatDateTime } from '@/utils/timeFormat'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  value: { type: null, default: null },
  column: { type: Object, required: true },
  resolver: { type: Object, default: () => ({}) },
  expanded: { type: Boolean, default: false },
})

const kind = computed(() => getColumnKind(props.column.type))
const isEmpty = computed(() => props.value == null || props.value === '')

const severity = computed(() => getSeverityDisplay(props.value))

const timestamp = computed(() => formatDateTime(props.value))

const object = computed(() => props.resolver.objectsById?.get(props.value) ?? null)

const userName = computed(() => props.resolver.usersById?.get(props.value) ?? null)

const eventName = computed(() => props.resolver.eventsByCode?.get(props.value) ?? null)

const zoneName = computed(() => props.resolver.zonesByUin?.get(props.value) ?? null)

/** JSON detail columns arrive already parsed when the value is a valid document. */
const jsonText = computed(() =>
  typeof props.value === 'string' ? props.value : JSON.stringify(props.value, null, 2),
)
</script>

<template>
  <span v-if="isEmpty" class="log-cell log-cell--empty">&mdash;</span>

  <span v-else-if="kind === COLUMN_KIND.TIME" class="log-cell log-cell--time" :title="value">
    {{ timestamp ?? value }}
  </span>

  <span v-else-if="kind === COLUMN_KIND.SEVERITY" class="log-cell log-cell--severity">
    <!-- 1.375em: larger than the text, still inside the line height, so rows keep their height. -->
    <StatusIcon :status="severity.key" size="1.375em" />
    {{ severity.label }}
  </span>

  <!-- Zero is the "no object" sentinel throughout the NetXMS object model. -->
  <span v-else-if="kind === COLUMN_KIND.OBJECT && !value" class="log-cell log-cell--empty">
    &mdash;
  </span>
  <!-- Stops the click so it does not also open the record drawer. -->
  <AppLink
    v-else-if="kind === COLUMN_KIND.OBJECT && object"
    :to="objectTarget(object)"
    class="log-cell log-cell--object"
    :title="object.name"
    @click.stop
    @auxclick.stop
  >
    <ObjectIcon :object="object" class="log-cell-icon" />
    {{ object.name }}
  </AppLink>
  <span v-else-if="kind === COLUMN_KIND.OBJECT" class="log-cell log-cell--unresolved">
    [{{ value }}]
  </span>

  <!-- INVALID_UID: the action never happened, not an id that failed to resolve. -->
  <span
    v-else-if="kind === COLUMN_KIND.USER && isUnsetUserId(value)"
    class="log-cell log-cell--empty"
  >
    &mdash;
  </span>
  <span v-else-if="kind === COLUMN_KIND.USER && userName" class="log-cell">
    <i class="pi pi-user log-cell-icon" />
    {{ userName }}
  </span>
  <span v-else-if="kind === COLUMN_KIND.USER" class="log-cell log-cell--unresolved">
    <i class="pi pi-user log-cell-icon" />
    [{{ value }}]
  </span>

  <span v-else-if="kind === COLUMN_KIND.EVENT" class="log-cell" :title="`Event code ${value}`">
    {{ eventName ?? `[${value}]` }}
  </span>

  <span v-else-if="kind === COLUMN_KIND.ZONE" class="log-cell">
    {{ zoneName ?? `[${value}]` }}
  </span>

  <span v-else-if="kind === COLUMN_KIND.CODED" class="log-cell">
    {{ getCodedLabel(column.type, value) }}
  </span>

  <pre v-else-if="kind === COLUMN_KIND.JSON" class="log-cell log-cell--json">{{ jsonText }}</pre>

  <span
    v-else-if="kind === COLUMN_KIND.NUMERIC || kind === COLUMN_KIND.MAC"
    class="log-cell log-cell--mono"
  >
    {{ value }}
  </span>

  <span
    v-else
    class="log-cell"
    :class="{ 'log-cell--wrap': expanded }"
    :title="expanded ? null : String(value)"
  >
    {{ value }}
  </span>
</template>

<style scoped>
.log-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-cell--empty,
.log-cell--unresolved {
  color: var(--p-text-muted-color);
}

.log-cell--time {
  font-variant-numeric: tabular-nums;
}

.log-cell--mono {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.log-cell--object {
  color: var(--p-primary-color);
}

.log-cell--object:hover {
  text-decoration: underline;
}

.log-cell-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.log-cell--object .log-cell-icon {
  color: inherit;
}

.log-cell--wrap {
  white-space: pre-wrap;
  word-break: break-word;
}

.log-cell--json {
  display: block;
  margin: 0;
  max-height: 20rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  background: var(--p-surface-ground);
  border-radius: 4px;
  padding: 0.5rem;
}
</style>
