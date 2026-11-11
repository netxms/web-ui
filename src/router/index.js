import { createRouter, createWebHistory } from 'vue-router'
import { requiredRightForTool } from '@/views/tools/toolRegistry'
import { DEFAULT_SECTION, requiredRightForSection } from '@/views/configuration/configSections'
import { setRouteTitle } from '@/utils/pageTitle'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      component: () => import('@/layouts/AuthLayout.vue'),
      children: [
        {
          path: '',
          name: 'login',
          component: () => import('@/views/auth/LoginView.vue'),
          meta: { title: 'Sign in', requiresAuth: false },
        },
      ],
    },
    {
      path: '/',
      component: () => import('@/layouts/DefaultLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/home',
        },
        {
          path: 'home',
          name: 'home',
          component: () => import('@/views/home/HomeView.vue'),
          meta: { title: 'Home', sidebar: false },
        },
        {
          path: 'preferences',
          name: 'preferences',
          component: () => import('@/views/preferences/PreferencesView.vue'),
          meta: { title: 'Preferences', sidebar: false },
        },
        {
          path: 'infrastructure/:objectId?/:viewId?/:entityId?',
          name: 'infrastructure',
          component: () => import('@/views/objects/ObjectsView.vue'),
          meta: { title: 'Infrastructure', sidebar: true },
        },
        {
          path: 'alarms/:alarmId?',
          name: 'alarms',
          component: () => import('@/views/alarms/AlarmsView.vue'),
          meta: { title: 'Alarms', sidebar: false },
        },
        {
          path: 'incidents/:incidentId?',
          name: 'incidents',
          component: () => import('@/views/incidents/IncidentsView.vue'),
          meta: { title: 'Incidents', sidebar: false },
        },
        {
          path: 'dashboards/:dashboardId?',
          name: 'dashboards',
          component: () => import('@/views/dashboard/DashboardsView.vue'),
          meta: { title: 'Dashboards', sidebar: true, fullBleed: true },
        },
        {
          path: 'network-maps/:mapId?',
          name: 'network-maps',
          component: () => import('@/views/network-maps/NetworkMapsView.vue'),
          meta: { title: 'Network Maps', sidebar: true, fullBleed: true },
        },
        {
          path: 'templates/:objectId?/:viewId?/:entityId?',
          name: 'templates',
          component: () => import('@/views/templates/TemplatesView.vue'),
          meta: { title: 'Templates', sidebar: true },
        },
        {
          path: 'assets/:objectId?/:viewId?',
          name: 'assets',
          component: () => import('@/views/assets/AssetsView.vue'),
          meta: { title: 'Assets', sidebar: true },
        },
        {
          path: 'business-services/:objectId?/:viewId?',
          name: 'business-services',
          component: () => import('@/views/business-services/BusinessServicesView.vue'),
          meta: { title: 'Business Services', sidebar: true },
        },
        {
          // The catalog gets the full width; a selected log gets the log list in the sidebar.
          path: 'logs',
          name: 'logs',
          component: () => import('@/views/logs/LogsView.vue'),
          meta: { title: 'Logs', sidebar: false },
        },
        {
          path: 'logs/:logName',
          name: 'log',
          component: () => import('@/views/logs/LogsView.vue'),
          meta: { title: 'Logs', sidebar: true },
        },
        {
          // Either right opens it (chat needs one, observations the other); each tab checks its own.
          path: 'ai/:tab?',
          name: 'ai',
          component: () => import('@/views/ai/AiView.vue'),
          meta: {
            title: 'AI',
            sidebar: false,
            requiredRight: ['useAiAssistant', 'viewEventLog'],
          },
        },
        {
          // Keeps old links working.
          path: 'events',
          redirect: '/logs/EventLog',
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('@/views/tools/ToolsView.vue'),
          meta: { title: 'Tools', sidebar: false },
        },
        {
          path: 'tools/:toolId',
          name: 'tool',
          component: () => import('@/views/tools/ToolsView.vue'),
          meta: {
            title: 'Tools',
            sidebar: true,
            requiredRight: (to) => requiredRightForTool(to.params.toolId),
          },
        },
        {
          // DEFAULT_SECTION is readable by any authenticated user.
          path: 'configuration',
          redirect: `/configuration/${DEFAULT_SECTION}`,
        },
        {
          path: 'configuration/:sectionId/:entityId?',
          name: 'configuration',
          component: () => import('@/views/configuration/ConfigurationView.vue'),
          meta: {
            title: 'Configuration',
            sidebar: true,
            requiredRight: (to) => requiredRightForSection(to.params.sectionId),
          },
        },
        {
          path: 'forbidden',
          name: 'forbidden',
          component: () => import('@/views/errors/ForbiddenView.vue'),
          meta: { title: 'Access Denied', requiresAuth: true },
        },
        ...(import.meta.env.DEV
          ? [
              {
                path: 'dev-lab',
                name: 'dev-lab',
                component: () => import('@/views/dev/DevLabView.vue'),
                meta: { title: 'Dev Lab', sidebar: false },
              },
              {
                path: 'data-center/:objectId?/:viewId?',
                name: 'data-center',
                component: () => import('@/views/data-center/DataCenterView.vue'),
                meta: { title: 'Data Center', sidebar: true },
              },
            ]
          : []),
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/NotFoundView.vue'),
          meta: { title: 'Not Found' },
        },
      ],
    },
  ],
})

const PERSPECTIVE_ROOTS = [
  '/infrastructure',
  '/configuration',
  '/ai',
  '/logs',
  '/tools',
  '/dashboards',
  '/network-maps',
  '/templates',
  '/assets',
  '/business-services',
  '/data-center',
]

router.afterEach(async (to, from) => {
  setRouteTitle(to.meta.title)

  for (const root of PERSPECTIVE_ROOTS) {
    if (from.path.startsWith(root) && !to.path.startsWith(root)) {
      const { usePerspectiveStore } = await import('@/stores/perspectiveStore')
      usePerspectiveStore().savePath(root, from.fullPath)
      break
    }
  }
})

router.beforeEach(async (to) => {
  const { useAuthStore } = await import('@/stores/authStore')
  const authStore = useAuthStore()
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && authStore.isAuthenticated) {
    return { name: 'home' }
  }

  const requiredRight =
    typeof to.meta.requiredRight === 'function' ? to.meta.requiredRight(to) : to.meta.requiredRight

  if (requiredRight) {
    const { usePermissions } = await import('@/composables/usePermissions')
    const { can } = usePermissions()
    // Any one suffices: several server handlers accept alternatives.
    const keys = Array.isArray(requiredRight) ? requiredRight : [requiredRight]
    if (!keys.some((key) => can.value[key])) {
      return { name: 'forbidden', query: { right: keys[0], from: to.fullPath } }
    }
  }
})

export default router
