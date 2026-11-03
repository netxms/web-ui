import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { nextTick, watch } from 'vue'

// The migration runs at import time: seed storage first, then import a fresh module copy.
async function freshImport() {
  vi.resetModules()
  return import('@/utils/appStorage')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  // restoreAllMocks, not unstubAllGlobals: an un-restored Storage.prototype spy would make
  // every later test throw on write.
  vi.restoreAllMocks()
})

describe('bucket', () => {
  it('reads and writes fields without disturbing their neighbours', async () => {
    const { prefs } = await freshImport()

    prefs.set('theme', 'dark')
    prefs.set('rtl', true)

    expect(prefs.get('theme')).toBe('dark')
    expect(prefs.get('rtl')).toBe(true)
    expect(localStorage.getItem('netxms.prefs')).toBe('{"theme":"dark","rtl":true}')
  })

  it('returns the fallback for an absent field, but keeps a stored null', async () => {
    const { prefs } = await freshImport()

    expect(prefs.get('nothing', 'fallback')).toBe('fallback')
    prefs.set('nothing', null)
    expect(prefs.get('nothing', 'fallback')).toBeNull()
  })

  it('removes a field', async () => {
    const { prefs } = await freshImport()
    prefs.set('theme', 'dark')
    prefs.remove('theme')

    expect(prefs.get('theme')).toBeUndefined()
  })

  it('treats corrupt or non-object contents as empty rather than throwing', async () => {
    localStorage.setItem('netxms.prefs', '{ not json')
    const { prefs } = await freshImport()
    expect(prefs.get('theme', 'light')).toBe('light')

    localStorage.setItem('netxms.prefs', '["an","array"]')
    expect(prefs.get('theme', 'light')).toBe('light')
  })

  it('degrades to no persistence when storage throws', async () => {
    const { prefs } = await freshImport()
    const boom = () => {
      throw new Error('QuotaExceededError')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)

    expect(() => prefs.set('theme', 'dark')).not.toThrow()
  })

  it('puts view state in sessionStorage, not localStorage', async () => {
    const { viewState } = await freshImport()
    viewState.write({ activeViews: { infrastructure: 'alarms' } })

    expect(sessionStorage.getItem('netxms.view-state')).toContain('alarms')
    expect(localStorage.getItem('netxms.view-state')).toBeNull()
  })
})

describe('migration from the pre-consolidation layout', () => {
  it('folds loose preference keys in, the account-level ones into userPrefs', async () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('colorTheme', 'violet')
    localStorage.setItem('sidebarCollapsed', 'true')
    localStorage.setItem('cashView.mode', 'logical')

    const { prefs, userPrefs } = await freshImport()

    expect(userPrefs.get('theme')).toBe('dark')
    expect(userPrefs.get('colorTheme')).toBe('violet')
    // String(bool) round-trips back to a real boolean.
    expect(prefs.get('sidebarCollapsed')).toBe(true)
    expect(userPrefs.get('cashView.mode')).toBe('logical')
    expect(prefs.get('theme')).toBeUndefined()

    expect(localStorage.getItem('theme')).toBeNull()
    expect(localStorage.getItem('colorTheme')).toBeNull()
  })

  it('folds the five table column keys into userPrefs', async () => {
    localStorage.setItem('alarmTable', '["severity","message"]')
    localStorage.setItem('usersTable', '["name","email"]')

    const { userPrefs } = await freshImport()

    expect(userPrefs.get('tables.alarm.columns')).toEqual(['severity', 'message'])
    expect(userPrefs.get('tables.users.columns')).toEqual(['name', 'email'])
    expect(localStorage.getItem('alarmTable')).toBeNull()
  })

  it('collapses the per-instance page size keys', async () => {
    localStorage.setItem('appTable.pageSize.interfaces', '100')
    localStorage.setItem('appTable.pageSize.ports', '50')

    const { tables } = await freshImport()

    expect(tables.get('interfaces.pageSize')).toBe(100)
    expect(tables.get('ports.pageSize')).toBe(50)
    expect(localStorage.getItem('appTable.pageSize.interfaces')).toBeNull()
  })

  it('splits the old view-preferences key across session and local storage', async () => {
    localStorage.setItem(
      'netxms-view-preferences',
      JSON.stringify({
        activeViews: { infrastructure: 'alarms' },
        classViews: { infrastructure: { Node: 'status' } },
        treeExpanded: { templates: ['3'] },
        visibleViews: { infrastructure: ['status', 'alarms'] },
        collapsedCards: { 'status.identity': true },
      }),
    )

    const { userPrefs, viewState } = await freshImport()

    // Where the tab is -> per-tab.
    expect(viewState.get('activeViews')).toEqual({ infrastructure: 'alarms' })
    expect(viewState.get('treeExpanded')).toEqual({ templates: ['3'] })
    // What the user configured -> the account.
    expect(userPrefs.get('views.visible')).toEqual({ infrastructure: ['status', 'alarms'] })
    expect(userPrefs.get('views.collapsedCards')).toEqual({ 'status.identity': true })

    expect(localStorage.getItem('netxms-view-preferences')).toBeNull()
  })

  it('renames the per-domain keys onto the one naming scheme', async () => {
    localStorage.setItem('netxms-sidebar-prefs', '{"showAliases":false,"sidebarWidth":300}')
    localStorage.setItem('netxms-object-query', '{"saved":[]}')

    const { userPrefs } = await freshImport()

    expect(localStorage.getItem('netxms.sidebar')).toBe('{"sidebarWidth":300}')
    expect(localStorage.getItem('netxms-sidebar-prefs')).toBeNull()
    expect(userPrefs.get('sidebar.showAliases')).toBe(false)
    expect(userPrefs.get('objectQuery.saved')).toEqual([])
  })

  it('does not run twice, so a later value is not overwritten by a stale legacy key', async () => {
    localStorage.setItem('theme', 'dark')
    const first = await freshImport()
    expect(first.userPrefs.get('theme')).toBe('dark')

    // The user switches back, then a legacy key reappears (e.g. an old tab writes one).
    first.userPrefs.set('theme', 'light')
    localStorage.setItem('theme', 'dark')

    const second = await freshImport()
    expect(second.userPrefs.get('theme')).toBe('light')
  })

  it('survives an unreadable legacy value without losing the rest', async () => {
    localStorage.setItem('netxms.recentSearchItems', '{ broken json')
    localStorage.setItem('colorTheme', 'amber')

    const { userPrefs } = await freshImport()

    expect(userPrefs.get('colorTheme')).toBe('amber')
  })
})

describe('moving account-level preferences into userPrefs (version 3)', () => {
  function seedVersion2() {
    localStorage.setItem('netxms.storage-version', '2')
    localStorage.setItem(
      'netxms.prefs',
      JSON.stringify({ theme: 'dark', navCollapsed: true, 'statusMap.toolbarCollapsed': {} }),
    )
    localStorage.setItem(
      'netxms.tables',
      JSON.stringify({ 'alarm.columns': ['severity'], 'interfaces.pageSize': 50 }),
    )
    localStorage.setItem(
      'netxms.log-prefs',
      JSON.stringify({
        lastLog: 'EventLog',
        drawerWidth: 600,
        byLog: {
          EventLog: { columns: ['a'], mode: 'stream', pageSize: 100 },
          Syslog: { pageSize: 50 },
        },
      }),
    )
    localStorage.setItem(
      'netxms.network-map-view',
      JSON.stringify({ hideLinks: true, showGrid: false, propertiesWidth: 500 }),
    )
    localStorage.setItem(
      'netxms.object-query',
      JSON.stringify({ saved: [{ id: 'q1', name: 'n', script: 's' }], advanced: true }),
    )
  }

  it('moves taste and content, and leaves what depends on the screen', async () => {
    seedVersion2()

    const { prefs, tables, userPrefs, createBucket } = await freshImport()

    expect(userPrefs.read()).toEqual({
      theme: 'dark',
      'tables.alarm.columns': ['severity'],
      'logs.presentation': { EventLog: { columns: ['a'], mode: 'stream' } },
      'networkMap.hideLinks': true,
      'networkMap.showGrid': false,
      'objectQuery.saved': [{ id: 'q1', name: 'n', script: 's' }],
      'objectQuery.advanced': true,
    })
    // Nobody has claimed them yet: the first account to sync uploads them.
    expect(userPrefs.owner()).toBeNull()

    expect(prefs.read()).toEqual({ navCollapsed: true, 'statusMap.toolbarCollapsed': {} })
    expect(tables.read()).toEqual({ 'interfaces.pageSize': 50 })
    expect(createBucket('log-prefs', 'local').read()).toEqual({
      lastLog: 'EventLog',
      drawerWidth: 600,
      byLog: { EventLog: { pageSize: 100 }, Syslog: { pageSize: 50 } },
    })
    expect(createBucket('network-map-view', 'local').read()).toEqual({ propertiesWidth: 500 })
    // Everything in it moved, so the key goes.
    expect(localStorage.getItem('netxms.object-query')).toBeNull()
    expect(localStorage.getItem('netxms.storage-version')).toBe('3')
  })

  it('does not run again once at version 3', async () => {
    localStorage.setItem('netxms.storage-version', '3')
    localStorage.setItem('netxms.prefs', JSON.stringify({ theme: 'dark' }))

    const { prefs, userPrefs } = await freshImport()

    expect(prefs.get('theme')).toBe('dark')
    expect(userPrefs.get('theme')).toBeUndefined()
  })
})

describe('userPrefs', () => {
  it('reads and writes like a bucket, under its own key', async () => {
    const { userPrefs } = await freshImport()

    userPrefs.set('theme', 'dark')

    expect(userPrefs.get('theme')).toBe('dark')
    expect(userPrefs.get('rtl', false)).toBe(false)
    expect(JSON.parse(localStorage.getItem('netxms.user-prefs'))).toEqual({ theme: 'dark' })
  })

  it('passes each change to the connected writer, and skips an equal value', async () => {
    const { userPrefs } = await freshImport()
    const writer = vi.fn()
    userPrefs.connect(writer)

    userPrefs.set('views.visible', { objects: ['a'] })
    userPrefs.set('views.visible', { objects: ['a'] })
    userPrefs.remove('views.visible')
    userPrefs.remove('views.visible')
    userPrefs.set('theme', 'dark')
    userPrefs.set('theme', undefined)

    expect(writer.mock.calls).toEqual([
      ['views.visible', { objects: ['a'] }],
      ['views.visible', undefined],
      ['theme', 'dark'],
      ['theme', undefined],
    ])
  })

  it('writes the first value of a field, even one that looks like a default', async () => {
    const { userPrefs } = await freshImport()
    const writer = vi.fn()
    userPrefs.connect(writer)

    userPrefs.set('rtl', false)

    expect(writer).toHaveBeenCalledWith('rtl', false)
  })

  it('replaces every value and the owner, and ticks the revision', async () => {
    const { userPrefs } = await freshImport()
    userPrefs.set('theme', 'dark')
    const before = userPrefs.revision.value

    userPrefs.replace({ rtl: true }, '7')

    expect(userPrefs.read()).toEqual({ rtl: true })
    expect(userPrefs.owner()).toBe('7')
    expect(userPrefs.revision.value).toBe(before + 1)

    userPrefs.replace({}, null)
    expect(userPrefs.owner()).toBeNull()
  })

  it('drops what holders write back while they re-read after a replace', async () => {
    const { userPrefs } = await freshImport()
    const writer = vi.fn()
    userPrefs.connect(writer)
    // A holder that re-reads on replace and persists whatever it holds, like the stores do.
    watch(userPrefs.revision, () => userPrefs.set('tables.alarm.columns', ['default']))

    userPrefs.replace({ theme: 'dark' }, '7')
    await nextTick()

    expect(writer).not.toHaveBeenCalled()
    expect(userPrefs.get('tables.alarm.columns')).toBeUndefined()

    // Afterwards a change is a change again.
    userPrefs.set('theme', 'light')
    expect(writer).toHaveBeenCalledWith('theme', 'light')
  })
})
