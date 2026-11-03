import { computed, toValue } from 'vue'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as businessServicesApi from '@/api/businessServicesApi'
import { MODERATE_TIER, STATIC_TIER, VOLATILE_TIER } from './config'

export const businessServiceKeys = {
  allChecks: () => ['business-service', 'checks'],
  checks: (objectId) => ['business-service', 'checks', objectId],
  availability: (objectId, period) => ['business-service', 'availability', objectId, period],
  /** Keyed by the resolved window, so widgets on the same period share one request. */
  availabilityRange: (objectId, from, to) => [
    'business-service',
    'availability-range',
    objectId,
    from,
    to,
  ],
}

/**
 * `from` is sent verbatim: the server parses relative offsets. `minutes` turns the server's
 * uptime percentage into downtime, which stays consistent with it because the server merges
 * overlapping downtime intervals.
 */
export const AVAILABILITY_PERIODS = [
  { key: 'day', label: 'Today (24h)', from: '-1d', minutes: 24 * 60 },
  { key: 'week', label: 'Last 7 days', from: '-7d', minutes: 7 * 24 * 60 },
  { key: 'month', label: 'Last 30 days', from: '-30d', minutes: 30 * 24 * 60 },
  { key: 'year', label: 'Last year', from: '-365d', minutes: 365 * 24 * 60 },
]

/** The longest window also carries the ticket list, so the log covers everything shown. */
const TICKET_PERIOD = 'year'

/**
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 */
export function useBusinessServiceChecks(objectId) {
  return useQuery({
    queryKey: computed(() => businessServiceKeys.checks(toValue(objectId))),
    queryFn: () => businessServicesApi.getBusinessServiceChecks(toValue(objectId)),
    enabled: computed(() => !!toValue(objectId)),
    ...VOLATILE_TIER,
  })
}

/** A prototype's checks are copied into every service created from it, so all lists refresh. */
function useCheckMutation(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: businessServiceKeys.allChecks() }),
  })
}

/** Takes `{ objectId, data }`, resolves to the check as created. */
export function useCreateBusinessServiceCheck() {
  return useCheckMutation(({ objectId, data }) =>
    businessServicesApi.createBusinessServiceCheck(objectId, data),
  )
}

/**
 * Legacy "Add object checks" / "Add DCI checks". Takes `{ objectId, items }`; resolves to one
 * `Promise.allSettled` result per item.
 */
export function useCreateBusinessServiceChecks() {
  return useCheckMutation(({ objectId, items }) =>
    Promise.allSettled(
      items.map((data) => businessServicesApi.createBusinessServiceCheck(objectId, data)),
    ),
  )
}

/** Takes `{ objectId, checkId, data }`, resolves to the check as stored. */
export function useUpdateBusinessServiceCheck() {
  return useCheckMutation(({ objectId, checkId, data }) =>
    businessServicesApi.updateBusinessServiceCheck(objectId, checkId, data),
  )
}

/** Takes `{ objectId, checkIds }`; resolves like the bulk create. */
export function useDeleteBusinessServiceChecks() {
  return useCheckMutation(({ objectId, checkIds }) =>
    Promise.allSettled(
      checkIds.map((checkId) => businessServicesApi.deleteBusinessServiceCheck(objectId, checkId)),
    ),
  )
}

/**
 * One request per window: the server computes a single percentage per call.
 *
 * @param {import('vue').MaybeRefOrGetter<number>} objectId
 */
export function useBusinessServiceAvailability(objectId) {
  const queries = useQueries({
    queries: computed(() =>
      AVAILABILITY_PERIODS.map((period) => ({
        queryKey: businessServiceKeys.availability(toValue(objectId), period.key),
        queryFn: () =>
          businessServicesApi.getBusinessServiceAvailability(toValue(objectId), {
            from: period.from,
            includeTickets: period.key === TICKET_PERIOD,
          }),
        enabled: !!toValue(objectId),
        ...VOLATILE_TIER,
      })),
    ),
  })

  const isLoading = computed(() => queries.value.some((q) => q.isLoading))
  const isFetching = computed(() => queries.value.some((q) => q.isFetching))
  const isError = computed(() => queries.value.every((q) => q.isError))
  const error = computed(() => queries.value.find((q) => q.error)?.error ?? null)

  const stats = computed(() => {
    const out = {}
    AVAILABILITY_PERIODS.forEach((period, index) => {
      const uptimePct = queries.value[index]?.data?.uptime
      if (uptimePct == null) return
      out[period.key] = {
        uptimePct,
        downtimeMinutes: Math.round(((100 - uptimePct) / 100) * period.minutes),
      }
    })
    return out
  })

  const downtimeLog = computed(() => {
    const index = AVAILABILITY_PERIODS.findIndex((p) => p.key === TICKET_PERIOD)
    const tickets = queries.value[index]?.data?.tickets ?? []
    return tickets.map((ticket) => {
      const start = ticket.creationTime ? new Date(ticket.creationTime) : null
      const end = ticket.closureTime ? new Date(ticket.closureTime) : null
      return {
        id: ticket.id,
        startTime: ticket.creationTime ?? null,
        endTime: ticket.closureTime ?? null,
        // An open ticket has no end, so measure it against now to show how long it has run.
        durationMinutes:
          start != null ? Math.max(0, Math.round(((end ?? new Date()) - start) / 60000)) : null,
        reason: ticket.reason || ticket.checkDescription || null,
      }
    })
  })

  function refetch() {
    for (const query of queries.value) query.refetch()
  }

  return { stats, downtimeLog, isLoading, isFetching, isError, error, refetch }
}

/**
 * Uptime over one arbitrary window. A closed period cannot change once answered, so it is
 * cached for the session; a live one gets the moderate refresh. `staleTime` is a function
 * because the widget is edited in place and `live` can change without a remount.
 *
 * @param {import('vue').MaybeRefOrGetter<number|null>} objectId
 * @param {import('vue').MaybeRefOrGetter<{ from: string, to: string }|null>} range
 * @param {{ live?: import('vue').MaybeRefOrGetter<boolean>,
 *           enabled?: import('vue').MaybeRefOrGetter<boolean> }} [options]
 *   `live` marks a window that runs up to now.
 */
export function useObjectAvailability(objectId, range, options = {}) {
  const baseEnabled = computed(() => !!toValue(objectId) && !!toValue(range))
  const isLive = () => !!toValue(options.live)
  return useQuery({
    queryKey: computed(() => {
      const window = toValue(range) ?? {}
      return businessServiceKeys.availabilityRange(toValue(objectId), window.from, window.to)
    }),
    queryFn: () => {
      const window = toValue(range)
      return businessServicesApi.getBusinessServiceAvailability(toValue(objectId), {
        from: window.from,
        to: window.to,
      })
    },
    enabled:
      options.enabled === undefined
        ? baseEnabled
        : computed(() => baseEnabled.value && !!toValue(options.enabled)),
    ...MODERATE_TIER,
    staleTime: () => (isLive() ? MODERATE_TIER.staleTime : Infinity),
    gcTime: STATIC_TIER.gcTime,
  })
}
