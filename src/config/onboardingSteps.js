/**
 * Getting-started steps. A step is complete when its `isDone` signal says so or the user's
 * persisted progress records it (a finished tour, "Mark done"), so `isDone` may be absent.
 *
 * `target`, `tourEntry` and `isDone` receive the context built by OnboardingSection:
 *   { nodes, targetNode, dashboards, channels, users, infrastructureRoot, dashboardRoot }
 */
import {
  objectTarget,
  configTarget,
  dashboardTarget,
  perspectiveTarget,
} from '@/utils/routeTargets'

export const STEP_GROUPS = ['setup', 'customize']

export const GROUP_LABELS = {
  setup: 'Essential Setup',
  customize: 'Make It Yours',
}

/**
 * @param {object} ctx
 */
function infrastructureTarget(ctx) {
  return ctx.infrastructureRoot
    ? objectTarget(ctx.infrastructureRoot)
    : perspectiveTarget('infrastructure')
}

/**
 * Falls back to the perspective when no node exists.
 *
 * @param {object} ctx
 * @param {string} viewId
 * @param {object} [options] - extra objectTarget options
 */
function targetNodeTarget(ctx, viewId, options) {
  return ctx.targetNode ? objectTarget(ctx.targetNode, viewId, options) : infrastructureTarget(ctx)
}

/**
 * @type {Array<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   group: 'setup' | 'customize',
 *   action: { label: string, icon: string, target: (ctx: object) => import('vue-router').RouteLocationRaw },
 *   isDone?: (ctx: object) => boolean,
 *   tour?: string,
 *   tourEntry?: (ctx: object) => import('vue-router').RouteLocationRaw,
 *   requiredRight?: string | string[],
 *   requiredObjectRight?: { key: string, from: (ctx: object) => object|null },
 * }>}
 */
/**
 * Gates are permissive when information is missing: an object without `effectiveRights` keeps
 * the step visible, and the server refuses if the user cannot perform it.
 */
export const ONBOARDING_STEPS = [
  {
    id: 'add-node',
    title: 'Add Your First Node',
    description: 'Monitoring starts with one device — a server, switch, router, or any IP host.',
    group: 'setup',
    // `?create=Node` opens the create dialog on arrival (ObjectsView consumes the param).
    action: {
      label: 'Add Node',
      icon: 'pi pi-plus',
      target: (ctx) => ({
        ...infrastructureTarget(ctx),
        query: { create: 'Node' },
      }),
    },
    isDone: (ctx) => ctx.nodes.length > 0,
    requiredObjectRight: { key: 'CREATE', from: (ctx) => ctx.infrastructureRoot },
    tour: 'add-node',
    // Without the dialog: it would cover the + button the tour highlights.
    tourEntry: infrastructureTarget,
  },
  {
    id: 'node-credentials',
    title: 'Set Up Credentials',
    description:
      'A node that answers no SNMP community and no agent secret stays a name on a list.',
    group: 'setup',
    // Not Configuration → SNMP Config: that section is still a Coming Soon placeholder.
    action: {
      label: 'Communication',
      icon: 'pi pi-wifi',
      target: (ctx) => targetNodeTarget(ctx, 'properties', { query: { section: 'communication' } }),
    },
    requiredObjectRight: { key: 'MODIFY', from: (ctx) => ctx.targetNode },
    tour: 'node-credentials',
  },
  {
    id: 'collect-metric',
    title: 'Collect Your First Metric',
    description: 'Add a data collection item, or apply a template that brings a set of them.',
    group: 'setup',
    action: {
      label: 'Data Collection',
      icon: 'pi pi-chart-bar',
      target: (ctx) => targetNodeTarget(ctx, 'dcis'),
    },
    requiredObjectRight: { key: 'MODIFY', from: (ctx) => ctx.targetNode },
    tour: 'collect-metric',
  },
  {
    id: 'get-notified',
    title: 'Get Notified',
    description: 'Add a delivery channel, then an event processing rule that uses it.',
    group: 'setup',
    action: {
      label: 'Notifications',
      icon: 'pi pi-bell',
      target: () => configTarget('notification-channels'),
    },
    isDone: (ctx) => ctx.channels.length > 0,
    requiredRight: 'configureServer',
    tour: 'get-notified',
  },
  {
    id: 'build-dashboard',
    title: 'Build a Dashboard',
    description: 'Put the charts, tables, and maps you check daily on one screen.',
    group: 'customize',
    action: {
      label: 'Dashboards',
      icon: 'pi pi-objects-column',
      target: () => dashboardTarget(),
    },
    isDone: (ctx) => ctx.dashboards.length > 0,
    requiredObjectRight: { key: 'CREATE', from: (ctx) => ctx.dashboardRoot },
    tour: 'build-dashboard',
  },
  {
    id: 'add-user',
    title: 'Add a User Account',
    description: 'Give your team their own logins instead of sharing the admin account.',
    group: 'customize',
    action: {
      label: 'Users & Groups',
      icon: 'pi pi-users',
      target: () => configTarget('users-groups'),
    },
    // Non-admins get an empty users list, so this stays persisted-only for them.
    isDone: (ctx) => ctx.users.length > 1,
    requiredRight: 'manageUsers',
  },
]

/** @param {string} id */
export function getStep(id) {
  return ONBOARDING_STEPS.find((s) => s.id === id) ?? null
}
