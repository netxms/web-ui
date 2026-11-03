/**
 * Entries in `src/data/changelog.json` ship with the frontend bundle, so they must stay
 * version-neutral (the connected server may run a different version) and age out by date.
 */

/**
 * Build-time switch (VITE_WHATS_NEW=false) for installs without egress or white-label builds.
 * HomeView also checks the server's `EnableWelcomePage` client configuration hint.
 */
export const WHATS_NEW_ENABLED = import.meta.env.VITE_WHATS_NEW !== 'false'

/** The blog posts about 5-8 times a year, so a shorter window often leaves no entries. */
export const CHANGELOG_MAX_AGE_DAYS = 365

export const CHANGELOG_MAX_ENTRIES = 4

const DAY_MS = 86400000

/**
 * Entries with a missing or unparseable date, or `hidden: true`, are dropped.
 *
 * @param {Array<{id: number, title: string, date?: string, hidden?: boolean}>|null|undefined}
 *   entries
 * @param {number} [now] - epoch ms
 * @returns {Array<object>}
 */
export function freshEntries(entries, now = Date.now()) {
  if (!Array.isArray(entries)) return []

  return entries
    .filter((entry) => !entry?.hidden)
    .map((entry) => ({ entry, at: Date.parse(entry?.date ?? '') }))
    .filter(({ at }) => !Number.isNaN(at) && now - at <= CHANGELOG_MAX_AGE_DAYS * DAY_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, CHANGELOG_MAX_ENTRIES)
    .map(({ entry }) => entry)
}
