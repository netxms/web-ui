import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { startSnmpWalk } from '@/api/objectsApi'
import { openOutputStream } from '@/api/outputStream'
import { useMibNameResolver } from '@/queries/useMibQueries'
import { formatRawValue } from '@/utils/mibNames'

// The server sends 50 variables a frame; one table update per frame would re-filter and
// re-sort the whole result thousands of times during a large walk.
const PUBLISH_INTERVAL_MS = 200

/**
 * Most variables one walk keeps. Legacy has no cap; a walk from the root of a large switch
 * returns hundreds of thousands, more than a browser tab holds comfortably.
 */
export const SNMP_WALK_LIMIT = 100000

/**
 * @typedef {object} SnmpWalkRow
 * @property {string} id - the OID; unique within a walk
 * @property {string} oid
 * @property {number} seq - position in the walk, which is OID order (GETNEXT), so the OID column's
 *   sort key: 1.10 after 1.9
 * @property {string} name - short symbolic name with the instance suffix, '' when unknown
 * @property {string} fullName
 * @property {string|null} objectOid - the MIB object the variable belongs to
 * @property {string} type - ASN.1 type name, as the server prints it
 * @property {string} value - formatted by the server (MIB display hints applied)
 * @property {string} rawValue - hex bytes, '' for numeric types
 */

/**
 * One streamed SNMP walk at a time, with symbolic names resolved before rows are shown (rows
 * keep walk order). Unmounting, `stop` or a new `start` closes the socket, which aborts the walk
 * on the server. Call in setup.
 */
export function useSnmpWalk() {
  const resolver = useMibNameResolver()

  /** @type {import('vue').Ref<'idle'|'running'|'completed'|'stopped'|'error'>} */
  const status = ref('idle')
  /** @type {import('vue').ShallowRef<SnmpWalkRow[]>} */
  const rows = shallowRef([])
  /** @type {import('vue').ShallowRef<Error|null>} */
  const error = shallowRef(null)
  const truncated = ref(false)
  /** What the current or last walk read: `{ objectId, oid, snmpAgentName }`. */
  const target = ref(null)

  let run = null

  async function toRow(variable, seq) {
    const names = await resolver.resolve(variable.oid)
    return {
      id: variable.oid,
      oid: variable.oid,
      seq,
      name: names?.name ?? '',
      fullName: names?.fullName ?? '',
      objectOid: names?.objectOid ?? null,
      type: variable.type ?? '',
      value: variable.value ?? '',
      rawValue: formatRawValue(variable.rawValue),
    }
  }

  /** Steps of one run, in frame order; a step of a run that is no longer current does nothing. */
  function enqueue(current, step) {
    current.chain = current.chain
      .then(() => (run === current ? step() : undefined))
      .catch(
        (err) =>
          run === current &&
          finish(current, 'error', err instanceof Error ? err : new Error('The SNMP walk failed')),
      )
  }

  function publish(current) {
    clearTimeout(current.timer)
    current.timer = null
    if (current.pending.length === 0) return
    rows.value = rows.value.concat(current.pending)
    current.pending = []
    current.lastPublish = Date.now()
  }

  function schedulePublish(current) {
    if (current.timer !== null) return
    const wait = current.lastPublish + PUBLISH_INTERVAL_MS - Date.now()
    if (wait <= 0) publish(current)
    else current.timer = setTimeout(() => run === current && publish(current), wait)
  }

  /** @param {Error|null} [failure] */
  function finish(current, nextStatus, failure = null) {
    publish(current)
    run = null
    current.ended = true
    status.value = nextStatus
    error.value = failure
    current.ws?.close()
  }

  function handleFrame(current, frame) {
    switch (frame.type) {
      case 'data': {
        const variables = frame.variables ?? []
        enqueue(current, async () => {
          const first = current.count
          current.count += variables.length
          const batch = await Promise.all(variables.map((v, i) => toRow(v, first + i)))
          if (run !== current) return
          current.pending.push(...batch)
          schedulePublish(current)
        })
        break
      }
      case 'completed':
        current.ended = true
        enqueue(current, () => {
          truncated.value = !!frame.truncated
          finish(current, 'completed')
        })
        break
      case 'error':
        current.ended = true
        enqueue(current, () =>
          finish(current, 'error', new Error(frame.message || 'The SNMP walk failed')),
        )
        break
    }
  }

  /**
   * @param {{ objectId: number, oid: string, snmpAgentName?: string|null }} request
   */
  async function start({ objectId, oid, snmpAgentName = null }) {
    discard()
    const current = {
      ws: null,
      chain: Promise.resolve(),
      pending: [],
      timer: null,
      lastPublish: 0,
      count: 0,
      ended: false,
    }
    run = current
    rows.value = []
    error.value = null
    truncated.value = false
    target.value = { objectId, oid, snmpAgentName: snmpAgentName || null }
    status.value = 'running'

    let answer
    try {
      answer = await startSnmpWalk(objectId, { oid, snmpAgentName, limit: SNMP_WALK_LIMIT })
    } catch (err) {
      if (run === current) finish(current, 'error', err)
      return
    }
    if (run !== current) return
    if (!answer?.wsUrl) {
      finish(current, 'error', new Error('The server did not open a stream for the walk'))
      return
    }
    current.ws = openOutputStream(answer.wsUrl, {
      onFrame: (frame) => run === current && handleFrame(current, frame),
      onClose: (event) => {
        if (run !== current || current.ended) return
        current.ended = true
        enqueue(current, () =>
          finish(
            current,
            'error',
            new Error(
              `Lost the connection to the server (${event.reason || `code ${event.code}`})`,
            ),
          ),
        )
      },
    })
  }

  /** Forgets the current run without touching the shown state. */
  function discard() {
    const current = run
    if (!current) return
    run = null
    current.ended = true
    clearTimeout(current.timer)
    current.ws?.close()
  }

  /** Keeps the variables already resolved; names still being looked up are dropped. */
  function stop() {
    const current = run
    if (!current) return
    publish(current)
    discard()
    status.value = 'stopped'
  }

  function clear() {
    discard()
    rows.value = []
    error.value = null
    truncated.value = false
    target.value = null
    status.value = 'idle'
  }

  onScopeDispose(discard)

  const running = computed(() => status.value === 'running')

  return { status, running, rows, error, truncated, target, start, stop, clear }
}
