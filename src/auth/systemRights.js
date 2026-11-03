/**
 * System access rights bit positions (0-indexed from LSB), as in the client library's
 * UserAccessRights.java. `systemAccessRights` is 64-bit: use BigInt, bits 53+ exceed Number
 * precision. Per-object ACLs are in objectAccessRights.js.
 */
export const SYSTEM_RIGHTS = Object.freeze({
  MANAGE_USERS: 0,
  SERVER_CONFIG: 1,
  CONFIGURE_TRAPS: 2,
  MANAGE_SESSIONS: 3,
  VIEW_EVENT_DB: 4,
  EDIT_EVENT_DB: 5,
  EPP: 6,
  MANAGE_ACTIONS: 7,
  // bit 8: DELETE_ALARMS (deprecated)
  MANAGE_PACKAGES: 9,
  VIEW_EVENT_LOG: 10,
  MANAGE_TOOLS: 11,
  MANAGE_SCRIPTS: 12,
  VIEW_TRAP_LOG: 13,
  VIEW_AUDIT_LOG: 14,
  MANAGE_AGENT_CFG: 15,
  PERSISTENT_STORAGE: 16,
  SEND_NOTIFICATION: 17,
  MOBILE_DEVICE_LOGIN: 18,
  MANAGE_AGENT_TUNNELS: 19,
  READ_SERVER_FILES: 20,
  SERVER_CONSOLE: 21,
  MANAGE_SERVER_FILES: 22,
  MANAGE_MAPPING_TBLS: 23,
  MANAGE_SUMMARY_TBLS: 24,
  REPORTING_SERVER: 25,
  MANAGE_AI_TASKS: 26,
  MANAGE_IMAGE_LIB: 27,
  UNLINK_ISSUES: 28,
  VIEW_SYSLOG: 29,
  USER_SCHEDULED_TASKS: 30,
  OWN_SCHEDULED_TASKS: 31,
  ALL_SCHEDULED_TASKS: 32,
  SCHEDULE_SCRIPT: 33,
  SCHEDULE_FILE_UPLOAD: 34,
  SCHEDULE_MAINTENANCE: 35,
  // bits 36-37: MANAGE_REPOSITORIES, VIEW_REPOSITORIES (archived)
  VIEW_ALL_ALARMS: 38,
  EXTERNAL_INTEGRATION: 39,
  SETUP_TCP_PROXY: 40,
  IMPORT_CONFIGURATION: 41,
  UA_NOTIFICATIONS: 42,
  WEB_SERVICE_DEFINITIONS: 43,
  OBJECT_CATEGORIES: 44,
  MANAGE_GEO_AREAS: 45,
  SSH_KEY_CONFIGURATION: 46,
  MANAGE_OBJECT_QUERIES: 47,
  MANAGE_2FA_METHODS: 48,
  AM_ATTRIBUTE_MANAGE: 49,
  VIEW_ASSET_CHANGE_LOG: 50,
  VIEW_WELCOME_PAGE: 51,
  SEARCH_NETWORK: 52,
  USE_AI_ASSISTANT: 53,
  MANAGE_AI_SKILLS: 54,
  VIEW_NOTIFICATION_LOG: 55,
  VIEW_ACTION_LOG: 56,
  SCAN_NETWORK: 57,
  MANAGE_AI_OPERATORS: 58,
  HTTP_REQUESTS: 59,
  MANAGE_AI_MEMORY: 60,
})

/**
 * Every system right grouped by functional area, with the legacy client's label
 * (SystemRights.java): the single source of right names, for the permission grid and for naming
 * a missing right. `wide` makes a card span both grid columns in the editors.
 */
export const SYSTEM_RIGHTS_CATEGORIES = Object.freeze([
  {
    name: 'Server Administration',
    rights: [
      { bit: 21, label: 'Access server console' },
      { bit: 1, label: 'Edit server configuration variables' },
      { bit: 3, label: 'Control user sessions' },
      { bit: 25, label: 'Reporting server access' },
      { bit: 18, label: 'Login as mobile device' },
    ],
  },
  {
    name: 'Event & Alarm Management',
    rights: [
      { bit: 5, label: 'Configure event templates' },
      { bit: 4, label: 'View event templates configuration' },
      { bit: 6, label: 'Edit event processing policy' },
      { bit: 7, label: 'Configure server actions' },
      { bit: 10, label: 'View event log' },
      { bit: 38, label: 'View all alarm categories' },
    ],
  },
  {
    name: 'Network & Objects',
    rights: [
      { bit: 2, label: 'Configure SNMP traps' },
      { bit: 13, label: 'View SNMP trap log' },
      { bit: 11, label: 'Configure object tools' },
      { bit: 52, label: 'Search network' },
      { bit: 57, label: 'Scan network' },
      { bit: 45, label: 'Manage geographical areas' },
      { bit: 44, label: 'Manage object categories' },
      { bit: 47, label: 'Manage object queries' },
    ],
  },
  {
    name: 'Agent & Infrastructure',
    rights: [
      { bit: 15, label: 'Manage agent configurations' },
      { bit: 19, label: 'Manage agent tunnels' },
      { bit: 9, label: 'Manage packages' },
      { bit: 40, label: 'Initiate TCP proxy sessions' },
      { bit: 16, label: 'Manage persistent storage' },
    ],
  },
  {
    name: 'Data & Analytics',
    rights: [
      { bit: 24, label: 'Manage DCI summary tables' },
      { bit: 23, label: 'Manage mapping tables' },
      { bit: 27, label: 'Manage image library' },
      { bit: 12, label: 'Manage script library' },
      { bit: 53, label: 'Use AI assistant' },
      { bit: 26, label: 'Manage AI tasks' },
      { bit: 54, label: 'Manage AI skills and functions' },
      { bit: 58, label: 'Manage AI operators' },
      { bit: 60, label: 'Manage AI memory' },
    ],
  },
  {
    name: 'Files & Storage',
    rights: [
      { bit: 22, label: 'Manage server files' },
      { bit: 20, label: 'Read server files' },
      { bit: 46, label: 'Manage SSH keys' },
      { bit: 34, label: 'Schedule file upload' },
    ],
  },
  {
    name: 'Scheduling',
    rights: [
      { bit: 32, label: 'Manage all scheduled tasks' },
      { bit: 31, label: 'Manage own scheduled tasks' },
      { bit: 30, label: 'Manage user scheduled tasks' },
      { bit: 33, label: 'Schedule script execution' },
      { bit: 35, label: 'Schedule object maintenance' },
    ],
  },
  {
    name: 'Users & Security',
    rights: [
      { bit: 0, label: 'Manage users' },
      { bit: 48, label: 'Manage two-factor authentication methods' },
      { bit: 42, label: 'Manage user support application notifications' },
      { bit: 39, label: 'External tool integration account' },
    ],
  },
  {
    name: 'Integrations & Audit',
    wide: true,
    rights: [
      { bit: 43, label: 'Manage web service definitions' },
      { bit: 59, label: 'Execute HTTP requests from scripts' },
      { bit: 17, label: 'Send notifications' },
      { bit: 28, label: 'Unlink helpdesk tickets' },
      { bit: 41, label: 'Import configuration' },
      { bit: 49, label: 'Asset management attributes' },
      { bit: 14, label: 'View audit log' },
      { bit: 29, label: 'View syslog' },
      { bit: 50, label: 'View asset change log' },
      { bit: 51, label: 'View welcome page' },
      { bit: 55, label: 'View notification log' },
      { bit: 56, label: 'View action log' },
    ],
  },
])

/** `{ [bit]: label }` for every right in the catalogue. */
export const SYSTEM_RIGHT_LABELS = Object.freeze(
  Object.fromEntries(
    SYSTEM_RIGHTS_CATEGORIES.flatMap((c) => c.rights.map((r) => [r.bit, r.label])),
  ),
)

/**
 * Camel-cased permission keys → bit position: the vocabulary the app gates on
 * (`usePermissions().can`, `requiredRight`).
 */
export const CAN_KEY_TO_RIGHT = Object.freeze({
  // Users & Security
  manageUsers: SYSTEM_RIGHTS.MANAGE_USERS,
  manage2faMethods: SYSTEM_RIGHTS.MANAGE_2FA_METHODS,
  externalIntegration: SYSTEM_RIGHTS.EXTERNAL_INTEGRATION,
  uaNotifications: SYSTEM_RIGHTS.UA_NOTIFICATIONS,

  // Server Administration
  configureServer: SYSTEM_RIGHTS.SERVER_CONFIG,
  manageSessions: SYSTEM_RIGHTS.MANAGE_SESSIONS,
  mobileDeviceLogin: SYSTEM_RIGHTS.MOBILE_DEVICE_LOGIN,
  serverConsole: SYSTEM_RIGHTS.SERVER_CONSOLE,
  reportingServer: SYSTEM_RIGHTS.REPORTING_SERVER,

  // Event & Alarm Management
  viewEventDb: SYSTEM_RIGHTS.VIEW_EVENT_DB,
  editEventDb: SYSTEM_RIGHTS.EDIT_EVENT_DB,
  manageEpp: SYSTEM_RIGHTS.EPP,
  manageActions: SYSTEM_RIGHTS.MANAGE_ACTIONS,
  viewEventLog: SYSTEM_RIGHTS.VIEW_EVENT_LOG,
  viewAllAlarms: SYSTEM_RIGHTS.VIEW_ALL_ALARMS,

  // Network & Objects
  configureTrap: SYSTEM_RIGHTS.CONFIGURE_TRAPS,
  manageTools: SYSTEM_RIGHTS.MANAGE_TOOLS,
  viewTrapLog: SYSTEM_RIGHTS.VIEW_TRAP_LOG,
  objectCategories: SYSTEM_RIGHTS.OBJECT_CATEGORIES,
  manageGeoAreas: SYSTEM_RIGHTS.MANAGE_GEO_AREAS,
  manageObjectQueries: SYSTEM_RIGHTS.MANAGE_OBJECT_QUERIES,
  searchNetwork: SYSTEM_RIGHTS.SEARCH_NETWORK,
  scanNetwork: SYSTEM_RIGHTS.SCAN_NETWORK,

  // Agent & Infrastructure
  managePackages: SYSTEM_RIGHTS.MANAGE_PACKAGES,
  manageAgentCfg: SYSTEM_RIGHTS.MANAGE_AGENT_CFG,
  persistentStorage: SYSTEM_RIGHTS.PERSISTENT_STORAGE,
  manageAgentTunnels: SYSTEM_RIGHTS.MANAGE_AGENT_TUNNELS,
  setupTcpProxy: SYSTEM_RIGHTS.SETUP_TCP_PROXY,

  // Files & Storage
  readServerFiles: SYSTEM_RIGHTS.READ_SERVER_FILES,
  manageServerFiles: SYSTEM_RIGHTS.MANAGE_SERVER_FILES,
  scheduleFileUpload: SYSTEM_RIGHTS.SCHEDULE_FILE_UPLOAD,
  sshKeyConfiguration: SYSTEM_RIGHTS.SSH_KEY_CONFIGURATION,

  // Data & Analytics
  manageScripts: SYSTEM_RIGHTS.MANAGE_SCRIPTS,
  manageMappingTbls: SYSTEM_RIGHTS.MANAGE_MAPPING_TBLS,
  manageSummaryTbls: SYSTEM_RIGHTS.MANAGE_SUMMARY_TBLS,
  manageAiTasks: SYSTEM_RIGHTS.MANAGE_AI_TASKS,
  manageImageLib: SYSTEM_RIGHTS.MANAGE_IMAGE_LIB,

  // Scheduling
  userScheduledTasks: SYSTEM_RIGHTS.USER_SCHEDULED_TASKS,
  ownScheduledTasks: SYSTEM_RIGHTS.OWN_SCHEDULED_TASKS,
  allScheduledTasks: SYSTEM_RIGHTS.ALL_SCHEDULED_TASKS,
  scheduleScript: SYSTEM_RIGHTS.SCHEDULE_SCRIPT,
  scheduleMaintenance: SYSTEM_RIGHTS.SCHEDULE_MAINTENANCE,

  // Integrations & Audit
  viewAuditLog: SYSTEM_RIGHTS.VIEW_AUDIT_LOG,
  sendNotification: SYSTEM_RIGHTS.SEND_NOTIFICATION,
  viewSyslog: SYSTEM_RIGHTS.VIEW_SYSLOG,
  unlinkIssues: SYSTEM_RIGHTS.UNLINK_ISSUES,
  importConfiguration: SYSTEM_RIGHTS.IMPORT_CONFIGURATION,
  webServiceDefinitions: SYSTEM_RIGHTS.WEB_SERVICE_DEFINITIONS,
  amAttributeManage: SYSTEM_RIGHTS.AM_ATTRIBUTE_MANAGE,
  viewAssetChangeLog: SYSTEM_RIGHTS.VIEW_ASSET_CHANGE_LOG,
  viewWelcomePage: SYSTEM_RIGHTS.VIEW_WELCOME_PAGE,
  viewNotificationLog: SYSTEM_RIGHTS.VIEW_NOTIFICATION_LOG,
  viewActionLog: SYSTEM_RIGHTS.VIEW_ACTION_LOG,

  // AI
  useAiAssistant: SYSTEM_RIGHTS.USE_AI_ASSISTANT,
  manageAiSkills: SYSTEM_RIGHTS.MANAGE_AI_SKILLS,
  manageAiOperators: SYSTEM_RIGHTS.MANAGE_AI_OPERATORS,
  manageAiMemory: SYSTEM_RIGHTS.MANAGE_AI_MEMORY,
})

/**
 * Human label for a `can` key, or null for an unknown key so callers fall back to generic copy.
 *
 * @param {string} canKey - key from CAN_KEY_TO_RIGHT
 * @returns {string|null}
 */
export function labelForRight(canKey) {
  const bit = CAN_KEY_TO_RIGHT[canKey]
  return bit === undefined ? null : (SYSTEM_RIGHT_LABELS[bit] ?? null)
}
