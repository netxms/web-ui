import { useConfirm } from 'primevue/useconfirm'
import { usePropertyEditor } from '@/composables/usePropertyEditor'
import {
  useObject,
  useUpdateObjectProperties,
  useUpdateObjectStatusCalculation,
  useUpdateObjectCustomAttribute,
  useDeleteObjectCustomAttribute,
  useUpdateObjectResponsibleUser,
  useDeleteObjectResponsibleUser,
  useUpdateObjectTrustedObjects,
  useUpdateObjectAccessRights,
  useUpdateObjectAutoBind,
} from '@/queries/useObjectQueries'
import { objectToApiPayload, objectToStatusCalcPayload } from '@/api/objectAdapters'

/**
 * Editor for the generic object property sections (General, Access Control, Custom
 * Attributes, ...), so a NetworkMap object can get them too. A subset of PropertiesView's
 * save orchestration, calling the same per-domain mutations.
 *
 * @param {import('vue').MaybeRefOrGetter} objectId
 * @returns {{
 *   object: import('vue').Ref<object|undefined>,
 *   draft: import('vue').Ref<object>,
 *   isDirty: import('vue').ComputedRef<boolean>,
 *   isSaving: import('vue').Ref<boolean>,
 *   saveError: import('vue').Ref<string|null>,
 *   save: () => Promise<void>,
 *   cancel: () => void,
 * }}
 */
export function useObjectPropertiesEditor(objectId) {
  const { data: object } = useObject(objectId)

  const { mutateAsync: updateProperties } = useUpdateObjectProperties()
  const { mutateAsync: updateStatusCalculation } = useUpdateObjectStatusCalculation()
  const { mutateAsync: updateCustomAttr } = useUpdateObjectCustomAttribute()
  const { mutateAsync: deleteCustomAttr } = useDeleteObjectCustomAttribute()
  const { mutateAsync: updateResponsibleUser } = useUpdateObjectResponsibleUser()
  const { mutateAsync: deleteResponsibleUser } = useDeleteObjectResponsibleUser()
  const { mutateAsync: updateTrustedObjects } = useUpdateObjectTrustedObjects()
  const { mutateAsync: updateAccessRights } = useUpdateObjectAccessRights()
  const { mutateAsync: updateAutoBind } = useUpdateObjectAutoBind()

  const confirm = useConfirm()

  function pick(obj, keys) {
    return Object.fromEntries(keys.map((k) => [k, obj[k]]))
  }

  // Inheritance off and no ACL entries leaves only the system user with access.
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

  const editor = usePropertyEditor(object, {
    onSave: async (data) => {
      const orig = object.value

      // Confirm the empty-ACL case before any mutation runs, so a cancel saves nothing.
      const accessFields = ['inheritAccessRights', 'accessList']
      const accessDirty =
        JSON.stringify(pick(data, accessFields)) !== JSON.stringify(pick(orig ?? {}, accessFields))
      if (accessDirty && !data.inheritAccessRights && (data.accessList ?? []).length === 0) {
        if (!(await confirmEmptyAcl())) {
          throw Object.assign(new Error('Save cancelled'), { cancelled: true })
        }
      }

      await updateProperties({ id: data.id, payload: objectToApiPayload(data) })

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

      // Own attributes (sourceObject 0) and local overrides of inherited ones
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

      const origTrusted = orig?.trustedObjects ?? []
      const draftTrusted = data.trustedObjects ?? []
      if (JSON.stringify(origTrusted) !== JSON.stringify(draftTrusted)) {
        await updateTrustedObjects({ id: data.id, payload: draftTrusted })
      }

      // Full ACL replacement
      if (accessDirty) {
        await updateAccessRights({
          id: data.id,
          payload: {
            inheritAccessRights: data.inheritAccessRights,
            accessList: (data.accessList ?? []).map(({ userId, access }) => ({ userId, access })),
          },
        })
      }

      if (
        JSON.stringify(pick(data, ['autoBindFilters'])) !==
        JSON.stringify(pick(orig ?? {}, ['autoBindFilters']))
      ) {
        const filters = (data.autoBindFilters ?? []).map((f) => ({
          autoBind: f.autoBind,
          autoUnbind: f.autoUnbind,
          source: f.source || null,
        }))
        await updateAutoBind({ id: data.id, payload: { autoBindFilters: filters } })
      }
    },
  })

  return {
    object,
    draft: editor.draft,
    isDirty: editor.isDirty,
    isSaving: editor.isSaving,
    saveError: editor.saveError,
    save: editor.save,
    cancel: editor.cancel,
  }
}
