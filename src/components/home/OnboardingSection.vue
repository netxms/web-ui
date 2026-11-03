<script setup>
import { computed } from 'vue'
import Panel from 'primevue/panel'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import OnboardingStepCard from './OnboardingStepCard.vue'
import { useObjects, useObjectsByClass } from '@/queries/useObjectQueries'
import { useNotificationChannels } from '@/queries/useNotificationChannelQueries'
import { useUsers } from '@/queries/useUserQueries'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useGuidedTour } from '@/composables/useGuidedTour'
import { ONBOARDING_STEPS, STEP_GROUPS, GROUP_LABELS } from '@/config/onboardingSteps'
import { usePermissions } from '@/composables/usePermissions'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { CAN_KEY_TO_RIGHT } from '@/auth/systemRights'

// Not zero: the panel must survive the user finishing step one, yet never show on an
// established install.
const NEW_INSTALL_NODE_LIMIT = 5

const onboarding = useOnboardingStore()
const { startTour } = useGuidedTour()
const { hasRight } = usePermissions()
const toast = useToast()

// Roots only: GET /v1/objects returns objects with no accessible parent.
const { data: rootObjects, isFetched: rootsFetched } = useObjects()
// Nodes and dashboards sit deeper in the tree, so they come from the search endpoint.
const { data: nodesAndDashboards, isFetched: nodesFetched } = useObjectsByClass([
  'Node',
  'Dashboard',
])
const { data: channels, isFetched: channelsFetched } = useNotificationChannels()
const { data: users, isFetched: usersFetched } = useUsers()

// Settled includes errors (non-admins get 403 on users); before that, an empty node list
// would flash the panel on an established system.
const signalsReady = computed(
  () => rootsFetched.value && nodesFetched.value && channelsFetched.value && usersFetched.value,
)

const nodes = computed(() => (nodesAndDashboards.value ?? []).filter((o) => o.class === 'Node'))

// The most recently created node: right after "Add your first node" that is the one the next
// steps are about.
const targetNode = computed(() =>
  nodes.value.length === 0
    ? null
    : nodes.value.reduce((newest, node) => (node.id > newest.id ? node : newest)),
)

const stepContext = computed(() => ({
  nodes: nodes.value,
  targetNode: targetNode.value,
  dashboards: (nodesAndDashboards.value ?? []).filter((o) => o.class === 'Dashboard'),
  channels: channels.value ?? [],
  users: users.value ?? [],
  infrastructureRoot: (rootObjects.value ?? []).find((o) => o.class === 'ServiceRoot') ?? null,
  dashboardRoot: (rootObjects.value ?? []).find((o) => o.class === 'DashboardRoot') ?? null,
}))

/**
 * Permissive: no declaration, unknown right keys and absent object rights all allow. The server
 * is the real gate, and rights we cannot evaluate must never hide a step.
 *
 * @param {object} step
 * @param {object} ctx
 */
function isPermitted(step, ctx) {
  if (step.requiredRight !== undefined) {
    const keys = Array.isArray(step.requiredRight) ? step.requiredRight : [step.requiredRight]
    const known = keys.filter((k) => CAN_KEY_TO_RIGHT[k] !== undefined)
    if (known.length > 0 && !known.some((k) => hasRight(CAN_KEY_TO_RIGHT[k]))) return false
  }

  if (step.requiredObjectRight !== undefined) {
    const { key, from } = step.requiredObjectRight
    if (!hasObjectRight(from(ctx), key)) return false
  }

  return true
}

const steps = computed(() =>
  ONBOARDING_STEPS.filter((step) => isPermitted(step, stepContext.value)).map((step) => {
    const skipped = onboarding.isSkipped(step.id)
    return {
      ...step,
      skipped,
      // A server signal is authoritative; the recorded flag covers steps that have none.
      completed:
        !skipped &&
        (step.isDone?.(stepContext.value) === true || onboarding.isRecordedComplete(step.id)),
      target: step.action.target(stepContext.value),
      // The add-node button opens a dialog, which would cover the control the tour highlights.
      tourEntry: (step.tourEntry ?? step.action.target)(stepContext.value),
    }
  }),
)

const trackedSteps = computed(() => steps.value.filter((s) => !s.skipped))
const completedCount = computed(() => trackedSteps.value.filter((s) => s.completed).length)
const totalCount = computed(() => trackedSteps.value.length)

const progressPercent = computed(() =>
  totalCount.value === 0 ? 100 : Math.round((completedCount.value / totalCount.value) * 100),
)

const groups = computed(() =>
  STEP_GROUPS.map((group) => ({
    id: group,
    label: GROUP_LABELS[group],
    steps: steps.value.filter((s) => s.group === group),
  })).filter((g) => g.steps.length > 0),
)

// Not stored, unlike `hidden`: the panel returns on its own if a signal flips.
const allDone = computed(() => completedCount.value === totalCount.value)

const looksLikeNewInstall = computed(() => nodes.value.length < NEW_INSTALL_NODE_LIMIT)

const visible = computed(
  () =>
    signalsReady.value &&
    !onboarding.hidden &&
    !allDone.value &&
    looksLikeNewInstall.value &&
    steps.value.length > 0,
)

function onToggle() {
  onboarding.setCollapsed(!onboarding.collapsed)
}

function dismiss() {
  onboarding.hide()
  toast.add({
    severity: 'info',
    summary: 'System setup hidden',
    detail: 'Bring it back any time from Preferences.',
    life: 5000,
  })
}

/** @param {object} step */
function onStartTour(step) {
  startTour(step.tour, { entryRoute: step.tourEntry, stepId: step.id })
}
</script>

<template>
  <Panel v-if="visible" :collapsed="onboarding.collapsed" toggleable @toggle="onToggle">
    <template #header>
      <div class="onboarding-header">
        <div class="onboarding-header-text">
          <i class="pi pi-compass onboarding-header-icon" />
          <span class="onboarding-header-title">System Setup</span>
          <span class="onboarding-header-progress">
            {{ completedCount }}/{{ totalCount }} completed
          </span>
          <Button
            v-tooltip.bottom="'Hide system setup'"
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            aria-label="Hide system setup"
            @click.stop="dismiss"
          />
        </div>
        <div class="onboarding-progress-bar">
          <div class="onboarding-progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>
    </template>

    <div class="onboarding-body">
      <div v-for="group in groups" :key="group.id" class="onboarding-group">
        <h3 class="onboarding-group-title">{{ group.label }}</h3>
        <div class="onboarding-steps-grid">
          <OnboardingStepCard
            v-for="step in group.steps"
            :key="step.id"
            :title="step.title"
            :description="step.description"
            :completed="step.completed"
            :skipped="step.skipped"
            :action-label="step.action.label"
            :action-target="step.target"
            :action-icon="step.action.icon"
            :tour="step.tour"
            @start-tour="onStartTour(step)"
            @skip="onboarding.skipStep(step.id)"
            @unskip="onboarding.unskipStep(step.id)"
          />
        </div>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.onboarding-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  padding-right: 1rem;
}

.onboarding-header-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.onboarding-header-icon {
  font-size: 1.125rem;
  color: var(--p-primary-color);
}

.onboarding-header-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.onboarding-header-progress {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-left: auto;
}

.onboarding-progress-bar {
  height: 4px;
  background: var(--p-surface-border);
  border-radius: 2px;
  overflow: hidden;
}

.onboarding-progress-fill {
  height: 100%;
  background: var(--p-primary-color);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.onboarding-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.onboarding-group-title {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.onboarding-steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 0.75rem;
}
</style>
