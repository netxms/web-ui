/**
 * Items are alphabetical by label within each group (enforced by configSections.spec.js).
 *
 * `requiredRight` is the system right needed to *read* a section, as a `usePermissions().can`
 * key; an array means any one suffices. Values match the `checkSystemAccessRights` call in the
 * server's WebAPI handler; a wrong key hides a section the user could have used. No
 * `requiredRight` means readable by everyone; the section then gates its own write controls.
 *
 * `requiredComponent` (a `SERVER_COMPONENTS` id the server must have registered) hides a
 * section outright and keeps it out of `RestrictedDisclosure`, since no grant would bring it
 * back. No section uses it today.
 */

export const DEFAULT_SECTION = 'object-tools'

export const menuGroups = [
  {
    label: 'System',
    items: [
      // Skills list accepts MANAGE_AI_SKILLS or USE_AI_ASSISTANT. Not component-gated: only chat
      // returns 503 without an AI provider, and this is where the assistant gets configured.
      {
        id: 'ai-assistant',
        label: 'AI Assistant',
        icon: 'pi pi-microchip',
        requiredRight: ['useAiAssistant', 'manageAiSkills'],
      },
      // Every handler checks SYSTEM_ACCESS_SERVER_CONFIG.
      {
        id: 'server-config',
        label: 'Server Configuration',
        icon: 'pi pi-sliders-h',
        requiredRight: 'configureServer',
      },
      {
        id: 'ssh-keys',
        label: 'SSH Keys',
        icon: 'pi pi-key',
        requiredRight: 'sshKeyConfiguration',
      },
      {
        id: 'two-factor-auth',
        label: 'Two-Factor Auth',
        icon: 'pi pi-shield',
        requiredRight: 'manage2faMethods',
      },
      {
        id: 'users-groups',
        label: 'Users & Groups',
        icon: 'pi pi-users',
        requiredRight: 'manageUsers',
      },
      {
        id: 'web-service-definitions',
        label: 'Web Service Definitions',
        icon: 'pi pi-globe',
        requiredRight: 'webServiceDefinitions',
      },
    ],
  },
  {
    label: 'Objects',
    items: [
      // SYSTEM_ACCESS_MANAGE_AM_SCHEMA, bit 49
      {
        id: 'asset-management-schema',
        label: 'Asset Management Schema',
        icon: 'pi pi-database',
        requiredRight: 'amAttributeManage',
      },
      {
        id: 'dci-summary-tables',
        label: 'DCI Summary Tables',
        icon: 'pi pi-table',
        requiredRight: 'manageSummaryTbls',
      },
      {
        id: 'geographical-areas',
        label: 'Geographical Areas',
        icon: 'pi pi-map',
        requiredRight: 'manageGeoAreas',
      },
      {
        id: 'image-library',
        label: 'Image Library',
        icon: 'pi pi-images',
        requiredRight: 'manageImageLib',
      },
      {
        id: 'object-categories',
        label: 'Object Categories',
        icon: 'pi pi-th-large',
        requiredRight: 'objectCategories',
      },
      {
        id: 'object-queries',
        label: 'Object Queries',
        icon: 'pi pi-search',
        requiredRight: 'manageObjectQueries',
      },
      // The list is ACL-filtered per user; MANAGE_TOOLS only gates create/update/delete.
      { id: 'object-tools', label: 'Object Tools', icon: 'pi pi-wrench' },
    ],
  },
  {
    label: 'Automation',
    items: [
      // MANAGE_ACTIONS or EPP
      {
        id: 'actions',
        label: 'Actions',
        icon: 'pi pi-bolt',
        requiredRight: ['manageActions', 'manageEpp'],
      },
      // Gated on EPP, not on the event-database rights.
      {
        id: 'alarm-categories',
        label: 'Alarm Categories',
        icon: 'pi pi-tag',
        requiredRight: 'manageEpp',
      },
      {
        id: 'chat-bots',
        label: 'Chat Bots',
        icon: 'pi pi-comments',
        requiredRight: 'configureServer',
      },
      {
        id: 'event-forwarders',
        label: 'Event Forwarders',
        icon: 'pi pi-share-alt',
        requiredRight: 'configureServer',
      },
      // Anyone granted read on a single chain through its access list may read the registry;
      // the static right only shortcuts the check for administrators.
      {
        id: 'epp',
        label: 'Event Processing',
        icon: 'pi pi-sitemap',
        requiredRight: 'manageEpp',
        runtimeRight: 'eppChainAccess',
      },
      // VIEW_EVENT_DB, EDIT_EVENT_DB or EPP
      {
        id: 'event-templates',
        label: 'Event Templates',
        icon: 'pi pi-bell',
        requiredRight: ['viewEventDb', 'editEventDb', 'manageEpp'],
      },
      {
        id: 'log-parsers',
        label: 'Log Parsers',
        icon: 'pi pi-file-edit',
        requiredRight: 'configureServer',
      },
      // Listing needs the right; reading one table does not.
      {
        id: 'mapping-tables',
        label: 'Mapping Tables',
        icon: 'pi pi-arrow-right-arrow-left',
        requiredRight: 'manageMappingTbls',
      },
      {
        id: 'notification-channels',
        label: 'Notification Channels',
        icon: 'pi pi-megaphone',
        requiredRight: 'configureServer',
      },
      {
        id: 'persistent-storage',
        label: 'Persistent Storage',
        icon: 'pi pi-database',
        requiredRight: 'persistentStorage',
      },
      // ALL, USER or OWN scheduled tasks
      {
        id: 'scheduled-tasks',
        label: 'Scheduled Tasks',
        icon: 'pi pi-clock',
        requiredRight: ['allScheduledTasks', 'userScheduledTasks', 'ownScheduledTasks'],
      },
      {
        id: 'script-library',
        label: 'Script Library',
        icon: 'pi pi-code',
        requiredRight: 'manageScripts',
      },
    ],
  },
  {
    label: 'Network',
    items: [
      // List, bind and unbind all check MANAGE_AGENT_TUNNELS.
      {
        id: 'agent-tunnels',
        label: 'Agent Tunnels',
        icon: 'pi pi-arrows-h',
        requiredRight: 'manageAgentTunnels',
      },
      // Network Discovery and SNMP Config still render ComingSoonSection.
      {
        id: 'network-discovery',
        label: 'Network Discovery',
        icon: 'pi pi-globe',
        requiredRight: 'configureServer',
      },
      {
        id: 'snmp-config',
        label: 'SNMP Config',
        icon: 'pi pi-cog',
        requiredRight: 'configureServer',
      },
      {
        id: 'snmp-trap-mappings',
        label: 'SNMP Traps',
        icon: 'pi pi-inbox',
        requiredRight: 'configureTrap',
      },
    ],
  },
]

const allSections = menuGroups.flatMap((g) => g.items)

export function getSectionLabel(sectionId) {
  return allSections.find((s) => s.id === sectionId)?.label ?? sectionId
}

export function getSectionIcon(sectionId) {
  return allSections.find((s) => s.id === sectionId)?.icon ?? 'pi pi-box'
}

/**
 * A `runtimeRight` names a gate only the server can resolve (a per-object access list). It is
 * an alternative to the static right, consulted only after that fails. An unresolved gate
 * (absent or `null`) counts as permitted, so a late answer does not flash a permission error.
 *
 * @param {{ requiredRight?: string|string[], runtimeRight?: string }} item
 * @param {Record<string, boolean>} can - the `can` map from usePermissions()
 * @param {Record<string, boolean|null>} [runtime] - resolved runtime gates, by key
 * @returns {boolean}
 */
export function isSectionPermitted(item, can, runtime) {
  const required = item?.requiredRight
  if (required) {
    const keys = Array.isArray(required) ? required : [required]
    if (keys.some((key) => can?.[key])) return true
  }
  const gate = item?.runtimeRight
  if (gate) return runtime?.[gate] !== false
  return !required
}

/**
 * Unlike an unresolved permission gate, an unresolved component reads as unavailable: the list
 * is empty until `/v1/server-info` lands (see `useServerComponents`).
 *
 * @param {{ requiredComponent?: string }} item
 * @param {string[]} [components] - `server-info.components`
 * @returns {boolean}
 */
export function isSectionAvailable(item, components) {
  const required = item?.requiredComponent
  if (!required) return true
  return Array.isArray(components) && components.includes(required)
}

/**
 * Groups left empty are removed.
 *
 * @param {Record<string, boolean>} can
 * @param {Record<string, boolean|null>} [runtime]
 * @param {string[]} [components] - `server-info.components`
 */
export function visibleGroups(can, runtime, components) {
  return menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (i) => isSectionAvailable(i, components) && isSectionPermitted(i, can, runtime),
      ),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * Sections withheld by permission, for the "hidden by your permissions" disclosure. Sections
 * missing a server component are not listed, so this is not the complement of `visibleGroups`.
 *
 * @param {Record<string, boolean>} can
 * @param {Record<string, boolean|null>} [runtime]
 * @param {string[]} [components] - `server-info.components`
 */
export function hiddenSections(can, runtime, components) {
  return allSections.filter(
    (item) => isSectionAvailable(item, components) && !isSectionPermitted(item, can, runtime),
  )
}

/**
 * Tells "not available on this server" apart from "not permitted" on a direct navigation.
 *
 * @param {string} id
 * @returns {string|null}
 */
export function requiredComponentForSection(id) {
  return allSections.find((s) => s.id === id)?.requiredComponent ?? null
}

/**
 * For the router guard. Unknown ids return null so a bad URL reaches the view's own handling. A
 * section with a `runtimeRight` also returns null: the guard cannot wait on the server, so the
 * section renders its own restricted state.
 *
 * @param {string} id
 * @returns {string|string[]|null}
 */
export function requiredRightForSection(id) {
  const section = allSections.find((s) => s.id === id)
  if (!section || section.runtimeRight) return null
  return section.requiredRight ?? null
}
