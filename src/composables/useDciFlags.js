import { computed } from 'vue'

/**
 * DCF_* from include/nxcldefs.h. The server sends and accepts the raw `flags` integer, which
 * openapi.yaml does not decompose; unmapped bits survive because form.flags round-trips as is.
 */
const DCF_DETECT_ANOMALIES_IFOREST = 0x000001
const DCF_ALL_THRESHOLDS = 0x000002
const DCF_RAW_VALUE_OCTET_STRING = 0x000004
const DCF_SHOW_ON_OBJECT_TOOLTIP = 0x000008
const DCF_AGGREGATE_FUNCTION_MASK = 0x000070
const DCF_AGGREGATE_FUNCTION_SHIFT = 4
const DCF_AGGREGATE_ON_CLUSTER = 0x000080
const DCF_TRANSFORM_AGGREGATED = 0x000100
const DCF_DETECT_ANOMALIES_AI = 0x000200
const DCF_CALCULATE_NODE_STATUS = 0x000400
const DCF_SHOW_IN_OBJECT_OVERVIEW = 0x000800
const DCF_CACHE_MODE_MASK = 0x003000
const DCF_CACHE_MODE_SHIFT = 12
const DCF_AGGREGATE_WITH_ERRORS = 0x004000
const DCF_HIDE_ON_LAST_VALUES_PAGE = 0x008000
const DCF_MULTIPLIERS_MASK = 0x030000
const DCF_MULTIPLIERS_SHIFT = 16
const DCF_STORE_CHANGES_ONLY = 0x040000
const DCF_UNSUPPORTED_AS_ERROR = 0x080000
const DCF_USE_SNMP_MIB_ENUM = 0x100000
// Target side only: template and instance-discovery updates skip a DCI that has it, and the
// server never copies it from a template DCI.
export const DCF_TEMPLATE_OVERRIDE = 0x400000

function bitFlag(form, mask) {
  return computed({
    get: () => ((form.flags ?? 0) & mask) !== 0,
    set: (value) => {
      const current = form.flags ?? 0
      form.flags = value ? current | mask : current & ~mask
    },
  })
}

function maskedValue(form, mask, shift) {
  return computed({
    get: () => ((form.flags ?? 0) & mask) >> shift,
    set: (value) => {
      const current = form.flags ?? 0
      form.flags = (current & ~mask) | ((value << shift) & mask)
    },
  })
}

/** @param {object} form - DCI form with a `flags` integer */
export function useDciFlags(form) {
  return {
    detectAnomaliesIsolationForest: bitFlag(form, DCF_DETECT_ANOMALIES_IFOREST),
    detectAnomaliesAI: bitFlag(form, DCF_DETECT_ANOMALIES_AI),
    processAllThresholds: bitFlag(form, DCF_ALL_THRESHOLDS),
    aggregateOnCluster: bitFlag(form, DCF_AGGREGATE_ON_CLUSTER),
    aggregateWithErrors: bitFlag(form, DCF_AGGREGATE_WITH_ERRORS),
    transformAggregated: bitFlag(form, DCF_TRANSFORM_AGGREGATED),
    storeChangesOnly: bitFlag(form, DCF_STORE_CHANGES_ONLY),
    aggregationFunction: maskedValue(
      form,
      DCF_AGGREGATE_FUNCTION_MASK,
      DCF_AGGREGATE_FUNCTION_SHIFT,
    ),
    multiplierMode: maskedValue(form, DCF_MULTIPLIERS_MASK, DCF_MULTIPLIERS_SHIFT),
    rawValueOctetString: bitFlag(form, DCF_RAW_VALUE_OCTET_STRING),
    useSnmpMibEnum: bitFlag(form, DCF_USE_SNMP_MIB_ENUM),
    showOnObjectTooltip: bitFlag(form, DCF_SHOW_ON_OBJECT_TOOLTIP),
    showInObjectOverview: bitFlag(form, DCF_SHOW_IN_OBJECT_OVERVIEW),
    calculateNodeStatus: bitFlag(form, DCF_CALCULATE_NODE_STATUS),
    hideOnLastValuesPage: bitFlag(form, DCF_HIDE_ON_LAST_VALUES_PAGE),
    unsupportedAsError: bitFlag(form, DCF_UNSUPPORTED_AS_ERROR),
    cacheMode: maskedValue(form, DCF_CACHE_MODE_MASK, DCF_CACHE_MODE_SHIFT),
    templateOverride: bitFlag(form, DCF_TEMPLATE_OVERRIDE),
  }
}
