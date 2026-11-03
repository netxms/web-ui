import router from '@/router'
import { setObjectManagedStateFor } from './objectStateCommands'
import { getCreatableClasses } from '@/utils/objectCreationRules'
import { getClassIcon, getClassLabel } from '@/utils/objectUtils'

/**
 * The tree range when there is one, otherwise the right-clicked row. Multi-capable actions must
 * use this: `ctx.object` alone drops the rest of the selection.
 */
function selectionOf(ctx) {
  return ctx.selection ?? [ctx.object]
}

const templateActions = [
  {
    id: 'template.create',
    label: 'Create',
    icon: 'pi pi-plus',
    group: 'create',
    priority: 4,
    requiredObjectRight: 'CREATE',
    isApplicable: (ctx) => getCreatableClasses(ctx.object.class).length > 0,
    items: [
      {
        id: 'template.create.Template',
        label: getClassLabel('Template'),
        icon: getClassIcon('Template'),
        priority: 5,
        isApplicable: (ctx) => getCreatableClasses(ctx.object.class).includes('Template'),
        command: ({ actionContext }) => {
          document.dispatchEvent(
            new CustomEvent('object:create', {
              detail: { parent: actionContext.object, objectClass: 'Template' },
            }),
          )
        },
      },
      {
        id: 'template.create.TemplateGroup',
        label: getClassLabel('TemplateGroup'),
        icon: getClassIcon('TemplateGroup'),
        priority: 6,
        isApplicable: (ctx) => getCreatableClasses(ctx.object.class).includes('TemplateGroup'),
        command: ({ actionContext }) => {
          document.dispatchEvent(
            new CustomEvent('object:create', {
              detail: { parent: actionContext.object, objectClass: 'TemplateGroup' },
            }),
          )
        },
      },
    ],
  },

  {
    id: 'template.applyTo',
    label: 'Apply to...',
    icon: 'pi pi-arrow-right',
    group: 'templateAssign',
    priority: 5,
    objectClasses: ['Template'],
    requiredObjectRight: 'MODIFY',
    command: ({ actionContext }) => {
      router.push({
        name: 'templates',
        params: { objectId: actionContext.object.id, viewId: 'targets' },
        query: { action: 'apply' },
      })
    },
  },
  {
    id: 'template.removeFrom',
    label: 'Remove from...',
    icon: 'pi pi-arrow-left',
    group: 'templateAssign',
    priority: 6,
    objectClasses: ['Template'],
    requiredObjectRight: 'MODIFY',
    command: ({ actionContext }) => {
      router.push({
        name: 'templates',
        params: { objectId: actionContext.object.id, viewId: 'targets' },
      })
    },
  },
  {
    // A move is a bind to the new group plus an unbind from the old one; there is no
    // dedicated endpoint. TemplatesView owns the picker and does both.
    id: 'template.moveToGroup',
    multiSelect: true,
    label: 'Move to another group...',
    icon: 'pi pi-folder-open',
    group: 'templateAssign',
    priority: 7,
    requiredObjectRight: 'MODIFY',
    isApplicable: (ctx) => !selectionOf(ctx).some((o) => o.class === 'TemplateRoot'),
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('template:moveToGroup', {
          detail: { objects: selectionOf(actionContext) },
        }),
      )
    },
  },

  {
    id: 'template.expandAll',
    label: 'Expand all children',
    icon: 'pi pi-angle-double-down',
    group: 'expand',
    priority: 8,
    objectClasses: ['TemplateGroup', 'TemplateRoot'],
    // Disabled rather than hidden on an empty group. TemplatesView backfills the root row's
    // children, which the object endpoint does not return.
    isDisabled: (ctx) => (ctx.object.children ?? []).length === 0,
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('template:expandAllChildren', { detail: { object: actionContext.object } }),
      )
    },
  },

  {
    id: 'template.manage',
    multiSelect: true,
    label: 'Manage',
    icon: 'pi pi-check-circle',
    group: 'manage',
    priority: 31,
    requiredObjectRight: 'MODIFY',
    isApplicable: (ctx) => selectionOf(ctx).some((o) => o.status === 6),
    command: ({ actionContext }) => setObjectManagedStateFor(selectionOf(actionContext), true),
  },
  {
    id: 'template.unmanage',
    multiSelect: true,
    label: 'Unmanage',
    icon: 'pi pi-ban',
    group: 'manage',
    priority: 32,
    requiredObjectRight: 'MODIFY',
    isApplicable: (ctx) => selectionOf(ctx).some((o) => o.status !== 6),
    command: ({ actionContext }) => setObjectManagedStateFor(selectionOf(actionContext), false),
  },

  {
    id: 'template.rename',
    label: 'Rename',
    icon: 'pi pi-pencil',
    group: 'edit',
    priority: 15,
    shortcut: 'F2',
    requiredObjectRight: 'MODIFY',
    isApplicable: (ctx) => ctx.object.class !== 'TemplateRoot',
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('object:rename', { detail: { object: actionContext.object } }),
      )
    },
  },
  {
    id: 'template.delete',
    multiSelect: true,
    label: 'Delete',
    icon: 'pi pi-trash',
    group: 'edit',
    priority: 16,
    shortcut: 'Del',
    danger: true,
    requiredObjectRight: 'DELETE',
    isApplicable: (ctx) => !selectionOf(ctx).some((o) => o.class === 'TemplateRoot'),
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('object:delete', {
          detail: { object: actionContext.object, selection: actionContext.selection },
        }),
      )
    },
  },

  {
    id: 'template.executeScript',
    label: 'Execute script',
    icon: 'pi pi-code',
    group: 'operations',
    priority: 41,
    objectClasses: ['Template'],
    requiredObjectRight: 'EXECUTE_SCRIPT',
    command: ({ actionContext }) => {
      router.push({
        name: 'templates',
        params: { objectId: actionContext.object.id, viewId: 'script' },
      })
    },
  },

  {
    // One entry, not legacy's Syslog/SNMP-traps pair: a template is neither source, so only the
    // logs recorded against it (audit) apply.
    id: 'template.logs',
    label: 'Logs',
    icon: 'pi pi-list',
    group: 'views',
    priority: 50,
    objectClasses: ['Template'],
    command: ({ actionContext }) => {
      router.push({
        name: 'templates',
        params: { objectId: actionContext.object.id, viewId: 'logs' },
      })
    },
  },
  {
    id: 'template.poll',
    label: 'Poll',
    icon: 'pi pi-sync',
    group: 'views',
    priority: 55,
    objectClasses: ['TemplateGroup', 'TemplateRoot'],
    items: [
      {
        id: 'template.poll.automaticBinding',
        label: 'Automatic Binding',
        priority: 55,
        command: ({ actionContext }) => {
          router.push({
            name: 'templates',
            params: {
              objectId: actionContext.object.id,
              viewId: 'polls',
              entityId: 'automaticBinding',
            },
            query: { autorun: '1' },
          })
        },
      },
    ],
  },
  {
    id: 'template.explainStatus',
    label: 'Explain Status',
    icon: 'pi pi-question-circle',
    group: 'views',
    priority: 60,
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('object:explainStatus', { detail: { object: actionContext.object } }),
      )
    },
  },
  {
    id: 'template.effectiveRights',
    label: 'Show effective rights',
    icon: 'pi pi-shield',
    group: 'views',
    priority: 65,
    command: ({ actionContext }) => {
      document.dispatchEvent(
        new CustomEvent('object:effectiveRights', { detail: { object: actionContext.object } }),
      )
    },
  },

  {
    id: 'template.properties',
    label: 'Properties',
    icon: 'pi pi-cog',
    group: 'properties',
    priority: 90,
    shortcut: 'Enter',
    isApplicable: (ctx) => ctx.object.class !== 'TemplateRoot',
    command: ({ actionContext }) => {
      router.push({
        name: 'templates',
        params: {
          objectId: actionContext.object.id,
          viewId: 'properties',
        },
      })
    },
  },
]

export default templateActions
