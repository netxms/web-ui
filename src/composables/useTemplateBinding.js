import { useConfirm } from 'primevue/useconfirm'
import { useBindObjectChild, useUnbindObjectChild } from '@/queries/useObjectQueries'

/**
 * Template apply/remove as parent/child binds. The server answers 409 when a template from the
 * same exclusion group is already applied; the user is asked whether to replace it.
 */
export function useTemplateBinding() {
  const confirm = useConfirm()
  const { mutateAsync: bindAsync } = useBindObjectChild()
  const { mutateAsync: unbindAsync } = useUnbindObjectChild()

  function confirmReplaceConflict(target) {
    return new Promise((resolve) => {
      confirm.require({
        header: 'Template Exclusion Conflict',
        message: `A template from the same exclusion group is already applied to "${target.name}". Replace it?`,
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Replace',
        rejectLabel: 'Skip',
        accept: () => resolve(true),
        reject: () => resolve(false),
        // Escape / close icon fire neither accept nor reject.
        onHide: () => resolve(false),
      })
    })
  }

  /**
   * @param {number} templateId
   * @param {Array<object>} targets - full objects; `name` is shown in the conflict prompt
   * @returns {Promise<{ applied: number, failed: number }>} a declined conflict counts as neither
   */
  async function applyTemplate(templateId, targets) {
    let applied = 0
    let failed = 0
    for (const target of targets) {
      try {
        await bindAsync({ parentId: templateId, childId: target.id })
        applied++
      } catch (err) {
        if (err?.status !== 409) {
          failed++
          continue
        }
        if (!(await confirmReplaceConflict(target))) continue
        try {
          await bindAsync({ parentId: templateId, childId: target.id, force: true })
          applied++
        } catch {
          failed++
        }
      }
    }
    return { applied, failed }
  }

  /**
   * @param {Array<number>} templateIds
   * @param {Array<object>} targets
   * @param {{ removeDci?: boolean }} [options]
   * @returns {Promise<{ removed: number, failed: number }>}
   */
  async function removeTemplate(templateIds, targets, options = {}) {
    const removeDci = options.removeDci ?? false
    let removed = 0
    let failed = 0
    for (const templateId of templateIds) {
      for (const target of targets) {
        try {
          await unbindAsync({ parentId: templateId, childId: target.id, removeDci })
          removed++
        } catch {
          failed++
        }
      }
    }
    return { removed, failed }
  }

  return { applyTemplate, removeTemplate }
}
