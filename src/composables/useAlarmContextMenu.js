import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { ALARM_ACTIONS } from '@/composables/useAlarmActions'
import { useAiChat } from '@/composables/useAiChat'
import { useLayout } from '@/composables/useLayout'
import { useObjectActionMenu } from '@/composables/useObjectActionMenu'
import { useObjectIcons } from '@/composables/useObjectIcons'
import { useServerComponents } from '@/composables/useServerComponents'
import { useToolExecution } from '@/composables/useToolExecution'
import { useAlarmDci } from '@/queries/useAlarmQueries'
import { useObjectToolIcons, useObjectToolsForObject } from '@/queries/useObjectToolQueries'
import { alarmAssistantPrompt, alarmMessagesAsText, alarmsAsText } from '@/utils/alarmExport'
import { resolveHref } from '@/utils/navigation'
import { notifyNotImplemented } from '@/utils/notImplemented'
import { notify, notifyAction } from '@/utils/notify'
import { alarmTarget, configTarget, objectTarget } from '@/utils/routeTargets'
import { buildToolMenuTree, buildToolsContent, injectToolsIntoMenu } from '@/utils/toolMenuUtils'

/**
 * What an alarm's Object submenu keeps of the object menu. Creating, organizing and deleting are
 * not triage, and most of their dialogs are hosted by the object perspectives alone.
 */
const OBJECT_SUBMENU_SLOTS = new Set([
  'object.open',
  'object.poll',
  'object.tools',
  'object.manage',
  'object.unmanage',
])

/** Under those slots, the items whose dialog only the object perspectives host. */
const OBJECT_SUBMENU_DROPPED = new Set([
  'object.open.explainStatus',
  'object.tools.createInterfaceDcis',
])

const STICKY_PERIODS = ['1 hour', '4 hours', '1 day', '2 days']

function withoutStraySeparators(items) {
  const result = []
  for (const item of items) {
    if (item.separator && (result.length === 0 || result.at(-1).separator)) continue
    result.push(item)
  }
  if (result.at(-1)?.separator) result.pop()
  return result
}

function objectSubmenu(items) {
  return withoutStraySeparators(
    items
      .filter((item) => item.separator || OBJECT_SUBMENU_SLOTS.has(item.id))
      .map((item) =>
        item.items
          ? {
              ...item,
              items: withoutStraySeparators(
                item.items.filter((child) => !OBJECT_SUBMENU_DROPPED.has(child.id)),
              ),
            }
          : item,
      ),
  )
}

/** Non-empty groups, with a separator between each. */
function sections(...groups) {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? group : [{ separator: true }, ...group]))
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text)
    notifyAction(message, 'pi pi-copy')
  } catch {
    notify({ severity: 'error', summary: 'Could not copy to the clipboard' })
  }
}

/**
 * The alarm table's right-click menu, modelled on the legacy alarm list. It has Tools twice, as
 * legacy does: the top-level one passes the alarm for the tool's macros, the one under Object
 * runs on the object alone. Server-defined tools belong to one object, so a selection gets
 * neither.
 *
 * @param {object} options
 * @param {(row: object) => object[]} options.targetsFor - the alarms a menu opened on `row` acts on
 * @param {{ sourceName: (alarm: object) => string }} options.names
 * @param {ReturnType<import('./useAlarmActions').useAlarmActions>} options.actions
 * @param {() => number|null} options.ownerObjectId - the object whose alarms these are, if any
 * @param {(alarm: object) => object} options.objectTargetFor - route of the alarm's source
 * @param {(alarm: object) => void} options.onOpenDetails
 * @param {(alarm: object) => void} options.onCreateIncident
 * @param {(alarms: object[]) => void} options.onExport
 */
export function useAlarmContextMenu({
  targetsFor,
  names,
  actions,
  ownerObjectId,
  objectTargetFor,
  onOpenDetails,
  onCreateIncident,
  onExport,
}) {
  const router = useRouter()
  const { has } = useServerComponents()
  const chat = useAiChat()
  const { isAiChatOpen } = useLayout()
  const { executeTool } = useToolExecution()

  const menuRow = ref(null)
  // Set when the menu opens, so a selection loads nothing it cannot show.
  const menuAlarmId = ref(null)

  const {
    objectId,
    isLoading: objectLoading,
    menuItems: objectMenuItems,
  } = useObjectActionMenu('alarms')
  const { data: tools, isLoading: toolsLoading } = useObjectToolsForObject(objectId)
  const { iconByToolId } = useObjectToolIcons(tools)
  const { data: dciId } = useAlarmDci(menuAlarmId)

  // Preloaded with the tool list, so menu icons do not change under the pointer.
  useObjectIcons()?.want(() => [...iconByToolId.value.values()])

  function open(row) {
    menuRow.value = row
    const single = targetsFor(row).length === 1
    objectId.value = single ? row.source : null
    menuAlarmId.value = single ? row.id : null
  }

  /** Waits here for the input dialog `AlarmTable` hosts. */
  const pendingTool = ref(null)
  const toolInputVisible = ref(false)

  function runTool(alarm, tool, context) {
    const object = { id: alarm.source, name: names.sourceName(alarm) }
    if (tool.inputFields?.length > 0) {
      pendingTool.value = { object, tool, context }
      toolInputVisible.value = true
      return
    }
    executeTool(object, tool, {}, context)
  }

  function submitToolInput(inputValues) {
    const pending = pendingTool.value
    pendingTool.value = null
    if (pending) executeTool(pending.object, pending.tool, inputValues, pending.context)
  }

  function cancelToolInput() {
    pendingTool.value = null
  }

  function openToolConfiguration() {
    router.push(configTarget('object-tools'))
  }

  function stateItem(action, targets) {
    const { label, icon, danger } = ALARM_ACTIONS[action]
    const fits = actions.allowing(action, targets)
    if (!fits.length) return null
    return {
      id: `alarm.${action}`,
      label: targets.length > 1 ? `${label} (${fits.length})` : label,
      icon,
      danger,
      disabled: actions.isRunning.value,
      command: () => actions.run(action, targets),
    }
  }

  // The WebAPI acknowledges without the sticky flag or a timeout, so these wait for it.
  function stickyItems(targets) {
    if (!actions.allowing('acknowledge', targets).length) return []
    const items = [
      {
        id: 'alarm.stickyAcknowledge',
        label: 'Sticky acknowledge',
        icon: 'pi pi-flag-fill',
        command: () => notifyNotImplemented('Sticky acknowledge'),
      },
    ]
    if (actions.timedAckEnabled.value) {
      items.push({
        id: 'alarm.stickyAcknowledgeFor',
        label: 'Sticky acknowledge for',
        icon: 'pi pi-clock',
        items: [
          ...STICKY_PERIODS.map((period) => ({
            label: period,
            command: () => notifyNotImplemented(`Sticky acknowledge for ${period}`),
          })),
          { separator: true },
          {
            label: 'Other...',
            command: () => notifyNotImplemented('Sticky acknowledge for a custom time'),
          },
        ],
      })
    }
    return items
  }

  function stateItems(targets) {
    return [
      stateItem('acknowledge', targets),
      ...stickyItems(targets),
      stateItem('resolve', targets),
      stateItem('terminate', targets),
    ].filter(Boolean)
  }

  function navigationItems(alarm) {
    const items = []
    if (alarm.source !== ownerObjectId()) {
      const target = objectTargetFor(alarm)
      items.push({
        id: 'alarm.goToObject',
        label: 'Go to Object',
        icon: 'pi pi-external-link',
        disabled: !alarm.source,
        url: alarm.source ? resolveHref(target) : undefined,
        command: () => router.push(target),
      })
    }
    if (dciId.value) {
      const target = objectTarget({ id: alarm.source }, 'dcis', {
        entityId: String(dciId.value),
        perspective: 'infrastructure',
      })
      items.push({
        id: 'alarm.goToDci',
        label: 'Go to DCI',
        icon: 'pi pi-chart-line',
        url: resolveHref(target),
        command: () => router.push(target),
      })
    }
    return items
  }

  function copyItems(targets) {
    const copied = targets.length === 1 ? 'Alarm copied' : `${targets.length} alarms copied`
    return [
      {
        id: 'alarm.copy',
        label: 'Copy to clipboard',
        icon: 'pi pi-copy',
        command: () => copyText(alarmsAsText(targets, names), copied),
      },
      {
        id: 'alarm.copyMessage',
        label: 'Copy message to clipboard',
        icon: 'pi pi-copy',
        command: () => copyText(alarmMessagesAsText(targets), copied),
      },
      {
        id: 'alarm.export',
        label: 'Export to CSV',
        icon: 'pi pi-download',
        command: () => onExport(targets),
      },
    ]
  }

  function askAssistant(alarm) {
    const name = names.sourceName(alarm)
    isAiChatOpen.value = true
    chat.sendMessage(alarmAssistantPrompt(alarm, name), {
      type: 'object',
      object_id: alarm.source,
      object_name: name,
    })
  }

  function followUpItems(alarm) {
    const items = [
      {
        id: 'alarm.createIncident',
        label: 'Create incident',
        icon: 'pi pi-flag',
        disabled: !alarm.source,
        command: () => onCreateIncident(alarm),
      },
    ]
    if (has(SERVER_COMPONENTS.AI_ASSISTANT)) {
      items.push({
        id: 'alarm.askAi',
        label: 'Ask AI assistant...',
        icon: 'pi pi-sparkles',
        disabled: chat.isThinking.value,
        command: () => askAssistant(alarm),
      })
    }
    return items
  }

  function objectItem(alarm) {
    let items
    if (objectLoading.value) {
      items = [{ label: 'Loading...', icon: 'pi pi-spin pi-spinner', disabled: true }]
    } else {
      items = objectSubmenu(objectMenuItems.value)
      if (items.some((item) => item.id === 'object.tools')) {
        items = injectToolsIntoMenu(
          items,
          buildToolsContent(tools.value, {
            loading: toolsLoading.value,
            onExecute: (tool) => runTool(alarm, tool, {}),
            iconByToolId: iconByToolId.value,
            onCreateTool: openToolConfiguration,
          }),
        )
      }
    }
    return { id: 'alarm.object', label: 'Object', icon: 'pi pi-box', items }
  }

  /** Left out when the source has no tools, as in legacy. */
  function toolItems(alarm) {
    if (toolsLoading.value) {
      return [
        {
          id: 'alarm.tools',
          label: 'Tools',
          icon: 'pi pi-wrench',
          items: [{ label: 'Loading...', icon: 'pi pi-spin pi-spinner', disabled: true }],
        },
      ]
    }
    const items = buildToolMenuTree(
      tools.value,
      (tool) => runTool(alarm, tool, { alarmId: alarm.id }),
      { iconFor: (tool) => iconByToolId.value.get(tool.id) ?? null },
    )
    return items.length ? [{ id: 'alarm.tools', label: 'Tools', icon: 'pi pi-wrench', items }] : []
  }

  const items = computed(() => {
    const row = menuRow.value
    if (!row) return []
    const targets = targetsFor(row)
    if (targets.length > 1) return sections(stateItems(targets), copyItems(targets))

    return sections(
      stateItems(targets),
      navigationItems(row),
      copyItems(targets),
      [
        {
          id: 'alarm.details',
          label: 'Details',
          icon: 'pi pi-search-plus',
          url: resolveHref(alarmTarget(row.id)),
          command: () => onOpenDetails(row),
        },
      ],
      followUpItems(row),
      [objectItem(row)],
      toolItems(row),
    )
  })

  return { items, open, pendingTool, toolInputVisible, submitToolInput, cancelToolInput }
}
