/**
 * Everything the app persists lives in a few namespaced buckets, each one JSON object under one
 * key. The bucket decides whether browser tabs share a value:
 *
 * - `prefs`, `tables` (localStorage): choices for this browser and screen (collapsed panels,
 *   page sizes), shared across tabs.
 * - `viewState` (sessionStorage): where this tab is (active view, tree expansion). Browsers
 *   clone it into a tab opened from a link, which then diverges independently.
 * - `userPrefs`: follows the account; a local cache of server-side user variables
 *   (`userPreferencesSync.js`) for taste and the user's own content.
 *
 * Auth (`sessionGuid`, `user`) stays outside: `useSessionSync` keys cross-tab logout off those
 * exact names via `storage` events.
 */

import { nextTick, ref } from 'vue'

const NAMESPACE = 'netxms'

// Storage can throw: Safari's private mode on write, some policies on the accessor itself.
function area(kind) {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

/**
 * @param {string} name - key suffix; the full key is `netxms.<name>`
 * @param {'local'|'session'} kind
 */
export function createBucket(name, kind) {
  const key = `${NAMESPACE}.${name}`

  function read() {
    try {
      const raw = area(kind)?.getItem(key)
      const parsed = raw ? JSON.parse(raw) : null
      // A non-object (corrupt or hand-edited) must not be spread into callers.
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function write(data) {
    try {
      area(kind)?.setItem(key, JSON.stringify(data))
    } catch {
      // Unavailable or over quota; persistence is best-effort.
    }
  }

  return {
    key,
    read,
    write,

    /**
     * @param {string} field - flat field name, e.g. `'rackView.use3D'`
     * @param {*} [fallback] - returned when the field is absent, not when it is `null`
     */
    get(field, fallback = undefined) {
      const value = read()[field]
      return value === undefined ? fallback : value
    },

    set(field, value) {
      const data = read()
      data[field] = value
      write(data)
    },

    remove(field) {
      const data = read()
      delete data[field]
      write(data)
    },
  }
}

export const prefs = createBucket('prefs', 'local')

/** Keyed by table id. */
export const tables = createBucket('tables', 'local')

export const viewState = createBucket('view-state', 'session')

const userPrefsBucket = createBucket('user-prefs', 'local')
const USER_PREFS_OWNER_KEY = `${NAMESPACE}.user-prefs-owner`

/**
 * The account's preferences, cached locally so reads stay synchronous and the first paint has
 * the right theme. `userPreferencesSync.js` connects the server writer and replaces the cache
 * on sign-in.
 *
 * A null `owner` marks values held before preferences moved to the server: the first account
 * to sync uploads the ones its server copy lacks, and claims the cache.
 *
 * `revision` ticks on every replace; anything holding a copied value re-reads on it.
 */
export const userPrefs = (() => {
  const revision = ref(0)
  /** @type {((field: string, value: *) => void) | null} */
  let writer = null

  // True while holders re-read after a replace: their persist watchers write back what they
  // read, or defaults, and sending those would pin the defaults on the server.
  let applying = false

  function remove(field) {
    if (applying) return
    const data = userPrefsBucket.read()
    if (!(field in data)) return
    delete data[field]
    userPrefsBucket.write(data)
    writer?.(field, undefined)
  }

  return {
    key: userPrefsBucket.key,
    read: userPrefsBucket.read,
    get: userPrefsBucket.get,
    revision,

    set(field, value) {
      if (value === undefined) return remove(field)
      if (applying) return
      const data = userPrefsBucket.read()
      if (field in data && JSON.stringify(data[field]) === JSON.stringify(value)) return
      data[field] = value
      userPrefsBucket.write(data)
      writer?.(field, value)
    },

    remove,

    /** @returns {string|null} */
    owner() {
      try {
        return area('local')?.getItem(USER_PREFS_OWNER_KEY) ?? null
      } catch {
        return null
      }
    },

    /**
     * @param {Record<string, *>} values
     * @param {string|null} owner
     */
    replace(values, owner) {
      userPrefsBucket.write(values)
      try {
        const local = area('local')
        if (owner == null) local?.removeItem(USER_PREFS_OWNER_KEY)
        else local?.setItem(USER_PREFS_OWNER_KEY, owner)
      } catch {
        // Persistence is best-effort.
      }
      applying = true
      revision.value++
      // Resolves after the scheduler has run the watchers this revision bump queued, including
      // the persist watchers they trigger in turn.
      nextTick(() => {
        applying = false
      })
    },

    /** @param {((field: string, value: *) => void) | null} fn - undefined value = removed */
    connect(fn) {
      writer = fn
    },
  }
})()

// Migration from the earlier key layout; runs at import time, before any bucket is read.
const LEGACY_PREFS = {
  theme: 'theme',
  rtl: 'rtl',
  colorTheme: 'colorTheme',
  navCollapsed: 'navCollapsed',
  sidebarCollapsed: 'sidebarCollapsed',
  'createNodeDialog.showAgain': 'createNodeDialog.showAgain',
  'assetsGroupView.viewMode': 'assetsGroupView.viewMode',
  'cashView.mode': 'cashView.mode',
  'cashView.timeRange': 'cashView.timeRange',
  'rackView.use3D': 'rackView.use3D',
  recentSearchItems: 'netxms.recentSearchItems',
}

const LEGACY_BUCKET_KEYS = {
  'netxms.log-prefs': 'netxms-log-prefs',
  'netxms.network-map-view': 'netxms-network-map-view-state',
  'netxms.object-query': 'netxms-object-query',
  'netxms.sidebar': 'netxms-sidebar-prefs',
}

const LEGACY_TABLE_COLUMNS = {
  alarm: 'alarmTable',
  incident: 'incidentTable',
  interface: 'interfaceTable',
  users: 'usersTable',
  groups: 'groupsTable',
}

/** Values stored as bare strings; everything else was JSON. */
const LEGACY_RAW_STRINGS = new Set([
  'theme',
  'rtl',
  'colorTheme',
  'navCollapsed',
  'sidebarCollapsed',
  'createNodeDialog.showAgain',
  'assetsGroupView.viewMode',
  'cashView.mode',
  'cashView.timeRange',
  'rackView.use3D',
])

/** @param {Storage} local */
function migrateLegacyKeys(local) {
  const prefsData = prefs.read()
  for (const [field, legacyKey] of Object.entries(LEGACY_PREFS)) {
    try {
      const raw = local.getItem(legacyKey)
      if (raw === null) continue
      if (prefsData[field] === undefined) {
        // `'true'`/`'false'` were written by String(bool); restore the boolean.
        if (raw === 'true' || raw === 'false') prefsData[field] = raw === 'true'
        else prefsData[field] = LEGACY_RAW_STRINGS.has(field) ? raw : JSON.parse(raw)
      }
      local.removeItem(legacyKey)
    } catch {
      // A single unreadable key must not abort the rest of the migration.
    }
  }
  prefs.write(prefsData)

  const tablesData = tables.read()
  for (const [id, legacyKey] of Object.entries(LEGACY_TABLE_COLUMNS)) {
    try {
      const raw = local.getItem(legacyKey)
      if (raw === null) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && tablesData[`${id}.columns`] === undefined) {
        tablesData[`${id}.columns`] = parsed
      }
      local.removeItem(legacyKey)
    } catch {
      // ignore
    }
  }

  // Page sizes were one key per table instance: `appTable.pageSize.<storageKey>`.
  try {
    const pageSizeKeys = []
    for (let i = 0; i < local.length; i++) {
      const k = local.key(i)
      if (k?.startsWith('appTable.pageSize.')) pageSizeKeys.push(k)
    }
    for (const k of pageSizeKeys) {
      const id = k.slice('appTable.pageSize.'.length)
      const size = Number(local.getItem(k))
      if (size && tablesData[`${id}.pageSize`] === undefined) tablesData[`${id}.pageSize`] = size
      local.removeItem(k)
    }
  } catch {
    // ignore
  }
  tables.write(tablesData)

  // `netxms-view-preferences`: the per-tab half seeds this tab's viewState, the rest prefs.
  try {
    const raw = local.getItem('netxms-view-preferences')
    if (raw) {
      const stored = JSON.parse(raw) ?? {}
      const session = viewState.read()
      if (session.activeViews === undefined) {
        viewState.write({
          activeViews: stored.activeViews ?? {},
          classViews: stored.classViews ?? {},
          treeExpanded: stored.treeExpanded ?? {},
        })
      }
      const p = prefs.read()
      if (p['views.visible'] === undefined) p['views.visible'] = stored.visibleViews ?? {}
      if (p['views.collapsedCards'] === undefined) {
        p['views.collapsedCards'] = stored.collapsedCards ?? {}
      }
      prefs.write(p)
      local.removeItem('netxms-view-preferences')
    }
  } catch {
    // ignore
  }

  for (const [key, legacyKey] of Object.entries(LEGACY_BUCKET_KEYS)) {
    try {
      const raw = local.getItem(legacyKey)
      if (raw === null) continue
      if (local.getItem(key) === null) local.setItem(key, raw)
      local.removeItem(legacyKey)
    } catch {
      // ignore
    }
  }
}

/** Same field name in `userPrefs`. */
const USER_PREFS_FROM_PREFS = [
  'theme',
  'colorTheme',
  'rtl',
  'alarms.notify.minSeverity',
  'alarms.notify.position',
  'views.visible',
  'views.collapsedCards',
  'createNodeDialog.showAgain',
  'assetsGroupView.viewMode',
  'rackView.use3D',
  'statusMap.objectView',
  'cashView.mode',
  'cashView.timeRange',
  'recentSearchItems',
]

/** Field in the bucket -> field in `userPrefs`. */
const USER_PREFS_FROM_DOMAIN_BUCKETS = {
  sidebar: { showAliases: 'sidebar.showAliases' },
  'network-map-view': {
    hideLinks: 'networkMap.hideLinks',
    hideLinkLabels: 'networkMap.hideLinkLabels',
    showGrid: 'networkMap.showGrid',
    snapToGrid: 'networkMap.snapToGrid',
  },
  'object-query': { saved: 'objectQuery.saved', advanced: 'objectQuery.advanced' },
}

/**
 * Moved locally, with no owner, so settings survive a server without the variables route; the
 * first account to sync claims them.
 *
 * @param {Storage} local
 */
function migrateToUserPrefs(local) {
  const moved = userPrefsBucket.read()
  const take = (field, value) => {
    if (value !== undefined && moved[field] === undefined) moved[field] = value
  }

  const prefsData = prefs.read()
  for (const field of USER_PREFS_FROM_PREFS) {
    take(field, prefsData[field])
    delete prefsData[field]
  }
  prefs.write(prefsData)

  // Column choices are taste; page sizes depend on the screen and stay.
  const tablesData = tables.read()
  for (const field of Object.keys(tablesData)) {
    if (!field.endsWith('.columns')) continue
    take(`tables.${field}`, tablesData[field])
    delete tablesData[field]
  }
  tables.write(tablesData)

  for (const [name, fields] of Object.entries(USER_PREFS_FROM_DOMAIN_BUCKETS)) {
    try {
      const bucket = createBucket(name, 'local')
      if (local.getItem(bucket.key) === null) continue
      const data = bucket.read()
      for (const [from, to] of Object.entries(fields)) {
        take(to, data[from])
        delete data[from]
      }
      if (Object.keys(data).length) bucket.write(data)
      else local.removeItem(bucket.key)
    } catch {
      // ignore
    }
  }

  // Log columns and mode move; page size, the last log and the drawer width stay.
  try {
    if (local.getItem(`${NAMESPACE}.log-prefs`) !== null) {
      const logPrefs = createBucket('log-prefs', 'local')
      const data = logPrefs.read()
      const presentation = {}
      for (const [logName, entry] of Object.entries(data.byLog ?? {})) {
        const { columns, mode, ...rest } = entry ?? {}
        if (columns !== undefined || mode !== undefined) {
          presentation[logName] = { columns, mode }
        }
        if (Object.keys(rest).length) data.byLog[logName] = rest
        else delete data.byLog[logName]
      }
      if (Object.keys(presentation).length) take('logs.presentation', presentation)
      logPrefs.write(data)
    }
  } catch {
    // ignore
  }

  userPrefsBucket.write(moved)
}

function migrate() {
  const local = area('local')
  if (!local) return

  const MIGRATED_FLAG = `${NAMESPACE}.storage-version`
  let version
  try {
    version = Number(local.getItem(MIGRATED_FLAG)) || 0
  } catch {
    return
  }
  if (version >= 3) return

  if (version < 2) migrateLegacyKeys(local)
  migrateToUserPrefs(local)

  try {
    local.setItem(MIGRATED_FLAG, '3')
  } catch {
    // ignore
  }
}

migrate()
