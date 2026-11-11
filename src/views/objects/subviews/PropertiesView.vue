<script setup>
import { computed, defineAsyncComponent, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import Button from 'primevue/button'
import PropertiesSectionNav from '@/components/properties/PropertiesSectionNav.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { getSectionsForClass } from '@/config/propertySections'
import { usePropertyEditor } from '@/composables/usePropertyEditor'
import { useDashboard, useSaveDashboard } from '@/queries/useDashboardQueries'
import { isDemoDashboardId } from '@/api/demoDashboardStorage'
import {
  useObject,
  useUpdateObjectProperties,
  useUpdateObjectLocation,
  useUpdateObjectStatusCalculation,
  useUpdateObjectCustomAttribute,
  useDeleteObjectCustomAttribute,
  useUpdateObjectResponsibleUser,
  useDeleteObjectResponsibleUser,
  useUpdateObjectDashboards,
  useUpdateObjectTrustedObjects,
  useUpdateObjectAccessRights,
  useUpdateObjectPolling,
  useUpdateObjectAutoBind,
  useObjectAgentConfig,
  useUpdateObjectAgentConfig,
  useObjectSnmpConfig,
  useUpdateObjectSnmpConfig,
  useUpdateObjectPhysicalPlacement,
  useCreateObjectUrl,
  useUpdateObjectUrl,
  useDeleteObjectUrl,
} from '@/queries/useObjectQueries'
import {
  objectToApiPayload,
  objectToLocationPayload,
  objectToStatusCalcPayload,
  objectToPhysicalPlacementPayload,
} from '@/api/objectAdapters'
import { interfacePropertiesPatch, isValidMacAddress } from '@/utils/interfaceDisplay'
import { propertyGroupPatch, rackCabinetPatch } from '@/utils/dataCenterProperties'
import { useUpdateDataCenterGroup } from '@/queries/useDataCenterQueries'

const props = defineProps({
  object: { type: Object, required: true },
  /** The host can close the view: the footer offers Apply and Save & Close instead of Save. */
  closable: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const route = useRoute()
const router = useRouter()

const objectId = computed(() => props.object?.id)
const { data: currentObject, isError, error, refetch } = useObject(objectId)

const objectClass = computed(() => (currentObject.value ?? props.object)?.class)
const { data: agentConfig } = useObjectAgentConfig(
  computed(() => (objectClass.value === 'Node' ? objectId.value : null)),
)
const { data: snmpConfig } = useObjectSnmpConfig(
  computed(() => (objectClass.value === 'Node' ? objectId.value : null)),
)

// Dashboard widgets/layout live behind their own fetch. Demo dashboard IDs collide with
// unrelated generic-object mocks (or 404), so useObject() can't be trusted for them.
const isMockDashboard = computed(
  () => objectClass.value === 'Dashboard' && isDemoDashboardId(objectId.value),
)
const { data: dashboardExtra } = useDashboard(
  computed(() => (objectClass.value === 'Dashboard' ? objectId.value : null)),
)

/** Object Context section fields, as adaptApiDashboard reads them. */
function dashboardContextFields(dashboard) {
  return {
    displayPriority: dashboard.displayPriority,
    showAsObjectView: dashboard.showAsObjectView,
    showContextSelector: dashboard.showContextSelector,
    forcedContextObjectId: dashboard.forcedContextObjectId,
    objectContextFlagsSupported: dashboard.objectContextFlagsSupported,
  }
}

const details = computed(() => {
  const base = currentObject.value ?? props.object
  if (!base) return base

  if (base.class === 'Dashboard') {
    if (isMockDashboard.value) {
      // Mock IDs bypass useObject: a generic-shaped object built from the dashboard fetch.
      if (!dashboardExtra.value) return null
      return {
        id: dashboardExtra.value.id,
        class: 'Dashboard',
        status: 0,
        alias: '',
        category: '',
        aiHint: '',
        comments: '',
        commentsSource: '',
        customAttributes: [],
        responsibleUsers: [],
        trustedObjects: [],
        urls: [],
        nameOnMap: null,
        mapImage: null,
        drilldownObjectId: 0,
        autoBindFilters: [0, 1].map(() => ({ autoBind: false, autoUnbind: false, source: '' })),
        name: dashboardExtra.value.name,
        cols: dashboardExtra.value.cols,
        rowHeight: dashboardExtra.value.rowHeight,
        scrollable: dashboardExtra.value.scrollable,
        ...dashboardContextFields(dashboardExtra.value),
        widgets: dashboardExtra.value.widgets,
      }
    }
    if (!dashboardExtra.value) return base
    return {
      ...base,
      cols: dashboardExtra.value.cols,
      rowHeight: dashboardExtra.value.rowHeight,
      scrollable: dashboardExtra.value.scrollable,
      ...dashboardContextFields(dashboardExtra.value),
      widgets: dashboardExtra.value.widgets,
    }
  }

  if (base.class !== 'Node') return base
  const result = { ...base }
  if (agentConfig.value) {
    result.agent = { ...agentConfig.value, secretTouched: false }
  }
  if (snmpConfig.value) {
    const cfg = snmpConfig.value
    result.snmp = {
      ...cfg,
      authPassword: cfg.authPassword ?? '',
      authPasswordTouched: false,
      privPassword: cfg.privPassword ?? '',
      privPasswordTouched: false,
      // Copied so the draft never aliases query cache data. Passwords come back as null (or
      // are omitted without credential access).
      agents: (cfg.agents ?? []).map((a) => ({
        ...a,
        address: a.address ?? '',
        authName: a.authName ?? '',
        authPassword: a.authPassword ?? '',
        privPassword: a.privPassword ?? '',
        contextName: a.contextName ?? '',
      })),
      trap: cfg.trap
        ? {
            ...cfg.trap,
            authPassword: cfg.trap.authPassword ?? '',
            authPasswordTouched: false,
            privPassword: cfg.trap.privPassword ?? '',
            privPasswordTouched: false,
          }
        : null,
    }
  }
  return result
})

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const sections = computed(() => getSectionsForClass(details.value?.class ?? 'Node'))

// From the query param, with fallback
const activeSection = computed(() => {
  const fromQuery = route.query.section
  if (fromQuery && sections.value.some((s) => s.id === fromQuery)) {
    return fromQuery
  }
  return sections.value[0]?.id ?? 'general'
})

const currentSectionMeta = computed(() => sections.value.find((s) => s.id === activeSection.value))

const activeSectionComponent = computed(() => {
  const meta = currentSectionMeta.value
  if (!meta?.component) return null
  return defineAsyncComponent(meta.component)
})

const { mutateAsync: updateProperties } = useUpdateObjectProperties()
const { mutateAsync: updateLocation } = useUpdateObjectLocation()
const { mutateAsync: updateStatusCalculation } = useUpdateObjectStatusCalculation()
const { mutateAsync: updateCustomAttr } = useUpdateObjectCustomAttribute()
const { mutateAsync: deleteCustomAttr } = useDeleteObjectCustomAttribute()
const { mutateAsync: updateResponsibleUser } = useUpdateObjectResponsibleUser()
const { mutateAsync: deleteResponsibleUser } = useDeleteObjectResponsibleUser()
const { mutateAsync: updateDashboards } = useUpdateObjectDashboards()
const { mutateAsync: updateTrustedObjects } = useUpdateObjectTrustedObjects()
const { mutateAsync: updateAccessRights } = useUpdateObjectAccessRights()
const { mutateAsync: updatePolling } = useUpdateObjectPolling()
const { mutateAsync: updateAutoBind } = useUpdateObjectAutoBind()
const { mutateAsync: updateAgentConfig } = useUpdateObjectAgentConfig()
const { mutateAsync: updateSnmpConfig } = useUpdateObjectSnmpConfig()
const { mutateAsync: updatePhysicalPlacement } = useUpdateObjectPhysicalPlacement()
const { mutateAsync: createUrl } = useCreateObjectUrl()
const { mutateAsync: updateUrl } = useUpdateObjectUrl()
const { mutateAsync: deleteUrl } = useDeleteObjectUrl()
const { mutateAsync: saveDashboardWidgets } = useSaveDashboard()
const { mutateAsync: updateDataCenterGroup } = useUpdateDataCenterGroup()

const confirm = useConfirm()

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]))
}

/** Optional strings go out as null when empty. */
function toApiSnmpAgent(a) {
  return {
    name: a.name,
    address: a.address || null,
    port: a.port,
    version: a.version,
    authName: a.authName || null,
    authMethod: a.authMethod,
    authPassword: a.authPassword || null,
    privMethod: a.privMethod,
    privPassword: a.privPassword || null,
    contextName: a.contextName || null,
  }
}

/**
 * Warns before saving an object only the system superuser could access (inheritance off, no
 * direct ACL entries), as the legacy client does. Resolves true to proceed.
 */
function confirmEmptyAcl() {
  return new Promise((resolve) => {
    confirm.require({
      header: 'No Access Configured',
      message:
        'Neither inheritance nor direct access rights are configured. Only the system user ' +
        'will have access to this object. Continue?',
      icon: 'pi pi-exclamation-triangle',
      acceptProps: { label: 'Save anyway', severity: 'danger' },
      rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    })
  })
}

/** Dashboard-specific fields are not covered by the generic object PATCH. */
function dashboardFieldsDirty(data, orig) {
  return (
    JSON.stringify(data.widgets) !== JSON.stringify(orig?.widgets) ||
    data.cols !== orig?.cols ||
    data.rowHeight !== orig?.rowHeight ||
    data.scrollable !== orig?.scrollable ||
    data.displayPriority !== orig?.displayPriority ||
    data.showAsObjectView !== orig?.showAsObjectView ||
    data.showContextSelector !== orig?.showContextSelector ||
    data.aiHint !== orig?.aiHint
  )
}

const { draft, isDirty, isSaving, saveError, save, cancel } = usePropertyEditor(details, {
  onSave: async (data) => {
    // Mock dashboard IDs have no backing object to PATCH; only the dashboard save applies.
    if (isMockDashboard.value) {
      if (dashboardFieldsDirty(data, details.value)) {
        await saveDashboardWidgets({
          id: data.id,
          data: {
            widgets: data.widgets,
            cols: data.cols,
            rowHeight: data.rowHeight,
            scrollable: data.scrollable,
            displayPriority: data.displayPriority,
            aiHint: data.aiHint,
          },
        })
      }
      return
    }

    // Access rights go through their own PUT (full ACL replacement). Confirmed before any
    // mutation runs, so a cancel leaves everything unsaved.
    const accessFields = ['inheritAccessRights', 'accessList']
    const accessDirty =
      JSON.stringify(pick(data, accessFields)) !==
      JSON.stringify(pick(details.value ?? {}, accessFields))
    if (accessDirty && !data.inheritAccessRights && (data.accessList ?? []).length === 0) {
      if (!(await confirmEmptyAcl())) {
        throw Object.assign(new Error('Save cancelled'), { cancelled: true })
      }
    }

    // A MAC the server would silently store as all zeroes is refused before anything is sent.
    const payload = objectToApiPayload(data)
    if (data.class === 'Interface') {
      const interfacePatch = interfacePropertiesPatch(data, details.value)
      if ('macAddress' in interfacePatch && !isValidMacAddress(interfacePatch.macAddress)) {
        throw new Error('The MAC address is not valid.')
      }
      Object.assign(payload, interfacePatch)
    }
    Object.assign(payload, rackCabinetPatch(data, details.value))
    await updateProperties({ id: data.id, payload })
    const orig = details.value

    const groupPatch = propertyGroupPatch(data, orig)
    if (groupPatch) await updateDataCenterGroup({ id: data.id, ...groupPatch })

    const locationDirty =
      JSON.stringify({ g: data.geoLocation, p: data.postalAddress }) !==
      JSON.stringify({ g: orig?.geoLocation, p: orig?.postalAddress })
    if (locationDirty) {
      await updateLocation({ id: data.id, payload: objectToLocationPayload(data) })
    }

    const statusCalcFields = [
      'calcAlg',
      'propAlg',
      'fixedStatus',
      'shift',
      'singleThreshold',
      'translation',
      'thresholds',
    ]
    const statusCalcDirty =
      JSON.stringify(pick(data, statusCalcFields)) !==
      JSON.stringify(pick(orig ?? {}, statusCalcFields))
    if (statusCalcDirty) {
      await updateStatusCalculation({ id: data.id, payload: objectToStatusCalcPayload(data) })
    }

    // Its own sub-resource: a server that predates it answers 404 instead of the phantom 200
    // the top-level patch gives for an unknown group.
    const placementDirty =
      JSON.stringify(data.physicalPlacement ?? null) !==
      JSON.stringify(orig?.physicalPlacement ?? null)
    if (placementDirty) {
      await updatePhysicalPlacement({
        id: data.id,
        payload: objectToPhysicalPlacementPayload(data),
      })
    }

    // Own attrs (sourceObject === 0) and local overrides (redefined: true)
    const origOwn = (orig?.customAttributes ?? []).filter(
      (a) => a.sourceObject === 0 || a.flags?.redefined,
    )
    const draftOwn = (data.customAttributes ?? []).filter(
      (a) => a.sourceObject === 0 || a.flags?.redefined,
    )
    for (const a of origOwn) {
      if (!draftOwn.find((d) => d.name === a.name)) {
        await deleteCustomAttr({ id: data.id, name: a.name })
      }
    }
    for (const a of draftOwn) {
      const prev = origOwn.find((o) => o.name === a.name)
      if (!prev || prev.value !== a.value || prev.flags?.inheritable !== a.flags?.inheritable) {
        await updateCustomAttr({
          id: data.id,
          name: a.name,
          payload: { value: a.value, inheritable: a.flags?.inheritable === true },
        })
      }
    }

    const origRU = orig?.responsibleUsers ?? []
    const draftRU = data.responsibleUsers ?? []
    for (const u of origRU) {
      if (!draftRU.find((d) => d.userId === u.userId)) {
        await deleteResponsibleUser({ id: data.id, userId: u.userId })
      }
    }
    for (const u of draftRU) {
      const prev = origRU.find((o) => o.userId === u.userId)
      if (!prev || prev.tag !== u.tag) {
        await updateResponsibleUser({ id: data.id, userId: u.userId, tag: u.tag ?? '' })
      }
    }

    const origDashboards = orig?.dashboards ?? []
    const draftDashboards = data.dashboards ?? []
    if (JSON.stringify(origDashboards) !== JSON.stringify(draftDashboards)) {
      await updateDashboards({ id: data.id, payload: draftDashboards })
    }

    const origTrusted = orig?.trustedObjects ?? []
    const draftTrusted = data.trustedObjects ?? []
    if (JSON.stringify(origTrusted) !== JSON.stringify(draftTrusted)) {
      await updateTrustedObjects({ id: data.id, payload: draftTrusted })
    }

    if (accessDirty) {
      await updateAccessRights({
        id: data.id,
        payload: {
          inheritAccessRights: data.inheritAccessRights,
          accessList: (data.accessList ?? []).map(({ userId, access }) => ({ userId, access })),
        },
      })
    }

    if (JSON.stringify(pick(data, ['polling'])) !== JSON.stringify(pick(orig ?? {}, ['polling']))) {
      await updatePolling({ id: data.id, payload: data.polling })
    }

    // sharedSecret is write-only (never returned by GET), so it's sent only when edited
    if (data.agent) {
      const origAgent = orig?.agent ?? {}
      const payload = {}
      for (const key of [
        'port',
        'proxy',
        'forceEncryption',
        'tunnelOnly',
        'cacheMode',
        'compressionMode',
        'certificateMappingMethod',
        'certificateMappingData',
      ]) {
        if (data.agent[key] !== origAgent[key]) payload[key] = data.agent[key]
      }
      if (data.agent.secretTouched) payload.sharedSecret = data.agent.sharedSecret || null
      if (Object.keys(payload).length) {
        await updateAgentConfig({ id: data.id, payload })
      }
    }

    // Auth/priv passwords are write-only (not returned without read-credentials access), so
    // they're sent only when edited
    if (data.snmp) {
      const origSnmp = orig?.snmp ?? {}
      const payload = {}
      for (const key of [
        'version',
        'port',
        'proxy',
        'codepage',
        'settingsLocked',
        'authName',
        'authMethod',
        'privMethod',
        'contextName',
      ]) {
        if (data.snmp[key] !== origSnmp[key]) payload[key] = data.snmp[key]
      }
      if (data.snmp.authPasswordTouched) payload.authPassword = data.snmp.authPassword || null
      if (data.snmp.privPasswordTouched) payload.privPassword = data.snmp.privPassword || null

      const origTrap = origSnmp.trap ?? null
      const draftTrap = data.snmp.trap ?? null
      if (!draftTrap) {
        if (origTrap) payload.trap = null
      } else {
        const trapPayload = {}
        for (const key of ['version', 'authName', 'authMethod', 'privMethod']) {
          if (draftTrap[key] !== origTrap?.[key]) trapPayload[key] = draftTrap[key]
        }
        if (draftTrap.authPasswordTouched) trapPayload.authPassword = draftTrap.authPassword || null
        if (draftTrap.privPasswordTouched) trapPayload.privPassword = draftTrap.privPassword || null
        if (!origTrap || Object.keys(trapPayload).length) payload.trap = trapPayload
      }

      // The API replaces the whole array; an unconditional send would blank the stored
      // passwords for a caller whose GET omitted them.
      const draftAgents = data.snmp.agents ?? []
      if (JSON.stringify(draftAgents) !== JSON.stringify(origSnmp.agents ?? [])) {
        payload.agents = draftAgents.map(toApiSnmpAgent)
      }

      if (Object.keys(payload).length) {
        await updateSnmpConfig({ id: data.id, payload })
      }
    }

    if (
      JSON.stringify(pick(data, ['autoBindFilters'])) !==
      JSON.stringify(pick(orig ?? {}, ['autoBindFilters']))
    ) {
      const filters = data.autoBindFilters.map((f) => ({
        autoBind: f.autoBind,
        autoUnbind: f.autoUnbind,
        source: f.source || null,
      }))
      await updateAutoBind({ id: data.id, payload: { autoBindFilters: filters } })
    }

    // Negative temp IDs are new URLs.
    const origUrls = orig?.urls ?? []
    const draftUrls = data.urls ?? []
    for (const u of origUrls) {
      if (!draftUrls.find((d) => d.id === u.id)) {
        await deleteUrl({ id: data.id, urlId: u.id })
      }
    }
    for (const u of draftUrls) {
      if (u.id < 0) {
        await createUrl({
          id: data.id,
          payload: { url: u.url, description: u.description ?? null },
        })
      } else {
        const prev = origUrls.find((o) => o.id === u.id)
        if (prev && (prev.url !== u.url || prev.description !== u.description)) {
          await updateUrl({
            id: data.id,
            urlId: u.id,
            payload: { url: u.url, description: u.description ?? null },
          })
        }
      }
    }

    // Dashboards persist through their own endpoint.
    if (objectClass.value === 'Dashboard' && dashboardFieldsDirty(data, orig)) {
      await saveDashboardWidgets({
        id: data.id,
        data: {
          widgets: data.widgets,
          cols: data.cols,
          rowHeight: data.rowHeight,
          scrollable: data.scrollable,
          displayPriority: data.displayPriority,
          showAsObjectView: data.showAsObjectView,
          showContextSelector: data.showContextSelector,
          objectContextFlagsSupported: data.objectContextFlagsSupported,
          aiHint: data.aiHint,
        },
      })
    }
  },
})

/** Also its ctrl/middle-click "open in new tab" href. */
function sectionTarget(sectionId) {
  return { name: route.name, params: route.params, query: { ...route.query, section: sectionId } }
}

function handleSectionSelect(sectionId) {
  // Stepping back through sections is not useful history.
  router.replace(sectionTarget(sectionId))
}

async function saveAndClose() {
  if (await save()) emit('close')
}
</script>

<template>
  <div class="properties-view">
    <div class="properties-layout">
      <PropertiesSectionNav
        :sections="sections"
        :active-section="activeSection"
        :target-for="sectionTarget"
        @select="handleSectionSelect"
      />

      <div class="properties-form">
        <QueryErrorState
          v-if="isError"
          :error="error"
          class="properties-load-error"
          message="Failed to refresh object properties. Showing last known data."
          @retry="refetch"
        />

        <div class="properties-form-content">
          <Suspense>
            <template #default>
              <component
                :is="activeSectionComponent"
                v-if="activeSectionComponent"
                :draft="draft"
                :object="details"
                :section-id="activeSection"
                :section-label="currentSectionMeta?.label ?? ''"
              />
            </template>
            <template #fallback>
              <div class="section-loading">Loading section...</div>
            </template>
          </Suspense>
        </div>

        <div class="properties-footer" :class="{ dirty: isDirty }">
          <div class="footer-status">
            <span v-if="isDirty" class="dirty-indicator">Unsaved changes</span>
            <span v-if="saveError" class="save-error">{{ saveError }}</span>
          </div>
          <div class="footer-actions">
            <Button
              label="Discard"
              severity="secondary"
              text
              size="small"
              :disabled="!isDirty || isSaving"
              @click="cancel"
            />
            <template v-if="closable">
              <Button
                label="Apply"
                severity="secondary"
                outlined
                size="small"
                :disabled="!isDirty"
                :loading="isSaving"
                @click="save"
              />
              <Button
                label="Save & Close"
                size="small"
                :disabled="!isDirty"
                :loading="isSaving"
                @click="saveAndClose"
              />
            </template>
            <Button
              v-else
              label="Save"
              size="small"
              :disabled="!isDirty"
              :loading="isSaving"
              @click="save"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="@/assets/styles/properties.css" />

<style scoped>
.properties-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.properties-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.properties-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.properties-form-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.properties-form-content > :deep(*) {
  max-width: 1000px;
}

.properties-form-content > :deep(.responsible-users-section) {
  max-width: none;
}

.properties-form-content > :deep(.custom-attributes-section),
.properties-form-content > :deep(.external-resources-section) {
  max-width: 1200px;
}

.section-loading {
  padding: 2rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.properties-load-error {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.properties-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.properties-footer.dirty {
  border-top-color: var(--p-primary-200);
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.dirty-indicator {
  color: var(--p-primary-color);
  font-weight: 500;
}

.save-error {
  color: var(--p-red-500);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
