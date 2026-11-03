import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userPrefs } from '@/utils/appStorage'
import { useAlarmTableStore } from '@/stores/alarmTableStore'

// Column layouts follow the account (userPrefs).
const BUCKET_KEY = 'netxms.user-prefs'
const FIELD = 'tables.alarm.columns'

const readColumns = () => JSON.parse(localStorage.getItem(BUCKET_KEY) ?? '{}')[FIELD]
const writeColumns = (value) => localStorage.setItem(BUCKET_KEY, JSON.stringify({ [FIELD]: value }))
const DEFAULT_COLUMNS = [
  'severity',
  'state',
  'source',
  'message',
  'repeatCount',
  'helpdeskReference',
  'lastChangeTime',
]

describe('alarmTableStore', () => {
  let pinia

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => pinia._e.stop())

  it('defaults visibleColumnIds to the built-in column set', () => {
    expect(useAlarmTableStore().visibleColumnIds).toEqual(DEFAULT_COLUMNS)
  })

  it('persists changes to the account preferences', async () => {
    const store = useAlarmTableStore()
    store.visibleColumnIds = ['severity', 'state', 'message', 'zone']
    await nextTick()
    expect(readColumns()).toEqual(['severity', 'state', 'message', 'zone'])
  })

  it('restores persisted values in a fresh store instance', () => {
    writeColumns(['severity', 'state', 'message', 'created'])
    setActivePinia(createPinia())
    expect(useAlarmTableStore().visibleColumnIds).toEqual([
      'severity',
      'state',
      'message',
      'created',
    ])
  })

  it("re-reads when sign-in brings another account's columns", async () => {
    const store = useAlarmTableStore()

    userPrefs.replace({ [FIELD]: ['message'] }, '7')
    await nextTick()
    expect(store.visibleColumnIds).toEqual(['message'])

    // An account that never chose gets the defaults, and they are not written back.
    userPrefs.replace({}, '8')
    await nextTick()
    expect(store.visibleColumnIds).toEqual(DEFAULT_COLUMNS)
    expect(readColumns()).toBeUndefined()
  })

  it('falls back to defaults on malformed persisted JSON', () => {
    localStorage.setItem(BUCKET_KEY, '{not valid json')
    setActivePinia(createPinia())
    expect(useAlarmTableStore().visibleColumnIds).toEqual(DEFAULT_COLUMNS)
  })

  describe('column order', () => {
    const ORDER_FIELD = 'tables.alarm.order'
    const readOrder = () => JSON.parse(localStorage.getItem(BUCKET_KEY) ?? '{}')[ORDER_FIELD]
    const CATALOG = [
      { id: 'severity', mandatory: true },
      { id: 'state' },
      { id: 'zone' },
      { id: 'message' },
    ]
    const ids = (columns) => columns.map((c) => c.id)

    it('shows the mandatory and ticked columns in catalog order by default', () => {
      const store = useAlarmTableStore()
      store.visibleColumnIds = ['message', 'state']
      expect(store.columnOrder).toEqual([])
      expect(ids(store.shownColumns(CATALOG))).toEqual(['severity', 'state', 'message'])
    })

    it('moves a column, keeping hidden ones in place, and persists the order', async () => {
      const store = useAlarmTableStore()
      store.visibleColumnIds = ['state', 'message']
      store.moveColumn(CATALOG, { id: 'message', targetId: 'severity', after: false })
      await nextTick()

      expect(ids(store.shownColumns(CATALOG))).toEqual(['message', 'severity', 'state'])
      expect(readOrder()).toEqual(['message', 'severity', 'state', 'zone'])
    })

    it("re-reads when sign-in brings another account's order", async () => {
      const store = useAlarmTableStore()
      store.columnOrder = ['state', 'severity']

      userPrefs.replace({ [ORDER_FIELD]: ['zone', 'message'] }, '7')
      await nextTick()
      expect(store.columnOrder).toEqual(['zone', 'message'])

      userPrefs.replace({}, '8')
      await nextTick()
      expect(store.columnOrder).toEqual([])
    })
  })
})
