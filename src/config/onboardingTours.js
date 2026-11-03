/**
 * Guided tours, keyed by onboarding step. Each step:
 *   route       optional route location to be on before highlighting
 *   target      CSS selector for the anchor - always a `data-tour` attribute
 *   title/body  popover text
 *   side/align  driver.js placement hints
 *
 * A step whose anchor never appears ends the tour quietly (composables/useGuidedTour.js).
 */
import { configTarget, dashboardTarget } from '@/utils/routeTargets'

/** @type {Record<string, { steps: Array<object> }>} */
export const ONBOARDING_TOURS = {
  'add-node': {
    steps: [
      {
        target: '[data-tour="create-object"]',
        title: 'Create objects here',
        body: 'Pick Node, then give it a name and an IP address or DNS name. Everything else can wait.',
        side: 'right',
        align: 'start',
      },
      {
        target: '[data-tour="object-tree"]',
        title: 'Your infrastructure tree',
        body: 'New objects land here. Select one and its views open alongside — status, alarms, metrics.',
        side: 'right',
        align: 'center',
      },
    ],
  },

  'node-credentials': {
    steps: [
      {
        target: '[data-tour="properties-section-communication"]',
        title: 'How the server reaches this node',
        body: 'SNMP community and version, agent port and shared secret. Wrong credentials here are the usual reason a node stays Unknown.',
        side: 'right',
        align: 'start',
      },
      {
        target: '[data-tour="properties-section-polling"]',
        title: 'How often it checks',
        body: 'Status and configuration poll intervals. The defaults are sane — come back when you have a reason.',
        side: 'right',
        align: 'start',
      },
    ],
  },

  'collect-metric': {
    steps: [
      {
        target: '[data-tour="create-dci"]',
        title: 'Define what to collect',
        body: 'A data collection item is one metric: its origin (agent, SNMP, internal), its data type, and how often to sample it.',
        side: 'bottom',
        align: 'end',
      },
      {
        target: '[data-tour="view-tabs"]',
        title: 'Then thresholds and graphs',
        body: 'Thresholds turn a value into an event. Performance charts what you have collected so far.',
        side: 'bottom',
        align: 'start',
      },
    ],
  },

  'get-notified': {
    steps: [
      {
        route: configTarget('notification-channels'),
        target: '[data-tour="config-section-notification-channels"]',
        title: 'Start with a delivery channel',
        body: 'A channel is the route out — SMTP, SMS, Slack. Configure one and send yourself a test message.',
        side: 'right',
        align: 'start',
      },
      {
        route: configTarget('epp'),
        target: '[data-tour="config-section-epp"]',
        title: 'Then a rule that uses it',
        body: 'Event processing decides which events raise an alarm and which notify your channel. Without a rule, nothing is sent.',
        side: 'right',
        align: 'start',
      },
    ],
  },

  'build-dashboard': {
    steps: [
      {
        route: dashboardTarget(),
        target: '[data-tour="create-object"]',
        title: 'Create a dashboard',
        body: 'Name it after the thing it answers — "Core switches", "Overnight batch" — not after what it contains.',
        side: 'right',
        align: 'start',
      },
      {
        target: '[data-tour="object-tree"]',
        title: 'Open it, then edit',
        body: 'Select the dashboard here and switch on Edit to drag widgets onto the grid.',
        side: 'right',
        align: 'center',
      },
    ],
  },
}

/**
 * Tours that start on an object's own view take the first step's route from `entryRoute`.
 *
 * @param {string} tourId
 * @param {import('vue-router').RouteLocationRaw} [entryRoute]
 * @returns {Array<object>|null}
 */
export function getTourSteps(tourId, entryRoute) {
  const tour = ONBOARDING_TOURS[tourId]
  if (!tour) return null

  return tour.steps.map((step, index) =>
    index === 0 && entryRoute && !step.route ? { ...step, route: entryRoute } : step,
  )
}
