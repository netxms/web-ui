<script setup>
/**
 * Dialogs behind the asset link actions of the object menu and the Hardware Inventory rows,
 * mounted once at app level. The actions only dispatch `asset:*` document events:
 * `asset:linkToAsset` and `asset:unlinkFromAsset` ({ object, component?, asset? }) from an
 * object, `asset:linkToObject` ({ object }) and `asset:unlink` ({ objects }) from assets.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Checkbox from 'primevue/checkbox'
import { useConfirm } from 'primevue/useconfirm'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import { useAssetLinkLookups, useAssetLinkMutations } from '@/queries/useAssetLinkQueries'
import { ASSET_LINK_TARGET_CLASSES, assetLinkPayload, replacedLinks } from '@/utils/assetLink'
import { notify } from '@/utils/notify'
import { createClassSelectionFilter, DEFAULT_NAVIGABLE_CLASSES } from '@/utils/objectSelection'

const confirm = useConfirm()
const { link, unlink } = useAssetLinkMutations()
const { fetchObject, fetchName, fetchObjectAsset, fetchComponentAsset } = useAssetLinkLookups()

const assetFilter = createClassSelectionFilter(['Asset'], {
  navigableClasses: ['AssetRoot', 'AssetGroup'],
})
const targetFilter = createClassSelectionFilter(ASSET_LINK_TARGET_CLASSES, {
  navigableClasses: [
    ...DEFAULT_NAVIGABLE_CLASSES,
    'Circuit',
    'Facility',
    'PowerDomain',
    'CoolingZone',
    'Room',
    'WirelessDomain',
  ],
})

/**
 * The link being made. `asset` is set when it starts from an asset, `target` (and for a
 * component `componentSerial`) when it starts from an object; the picker supplies the other.
 */
const pending = ref(null)
const pickerVisible = ref(false)
const updateIdentification = ref(true)

// Off: legacy always updates identification and offers no choice. With it off every object link
// sends updateIdentification true.
const IDENTIFICATION_OPTION_SHOWN = false

const pickingAsset = computed(() => !pending.value?.asset)

const pickerTitle = computed(() => {
  const request = pending.value
  if (!request) return ''
  if (request.asset) return `Link ${request.asset.name} to Object`
  if (request.componentSerial) return `Link Component ${request.componentSerial} to Asset`
  return `Link ${request.target.name} to Asset`
})

function describeLink(assetName, targetName, componentSerial) {
  const target = componentSerial ? `${targetName}, component ${componentSerial}` : targetName
  return `${assetName} - ${target}`
}

function confirmAsync(options) {
  return new Promise((resolve) => {
    confirm.require({
      icon: 'pi pi-exclamation-triangle',
      rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      ...options,
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    })
  })
}

function reportError(err, summary) {
  // 403 is already toasted by api/client.js.
  if (err?.status === 403) return
  notify({ severity: 'error', summary, detail: err?.message, life: 5000 })
}

function openPicker(request) {
  pending.value = request
  updateIdentification.value = true
  pickerVisible.value = true
}

function onLinkToAsset(event) {
  const { object, component } = event.detail ?? {}
  if (object) openPicker({ target: object, componentSerial: component?.serial ?? null })
}

function onLinkToObject(event) {
  const asset = event.detail?.object
  if (asset) openPicker({ asset })
}

async function onPicked(picked) {
  const request = pending.value
  if (!request || !picked) return
  const target = request.target ?? picked
  const componentSerial = request.componentSerial
  try {
    const [asset, currentAsset] = await Promise.all([
      fetchObject((request.asset ?? picked).id),
      componentSerial
        ? fetchComponentAsset(target.id, componentSerial)
        : fetchObjectAsset(target.id),
    ])
    const assetLinkName = asset.linkedObjectId ? await fetchName(asset.linkedObjectId) : null
    const notes = replacedLinks({ asset, assetLinkName, target, componentSerial, currentAsset })
    if (notes.length) {
      const proceed = await confirmAsync({
        header: 'Replace Asset Link',
        message: notes.join(' '),
        acceptProps: { label: 'Link' },
      })
      if (!proceed) return
    }
    await link.mutateAsync({
      assetId: asset.id,
      payload: assetLinkPayload({
        objectId: target.id,
        componentSerial,
        updateIdentification: updateIdentification.value,
      }),
      affectedIds: [asset.linkedObjectId, currentAsset?.id],
    })
    notify({ summary: 'Asset linked', detail: describeLink(asset.name, target.name, componentSerial) })
  } catch (err) {
    reportError(err, 'Could not link asset')
  }
}

async function onUnlinkFromAsset(event) {
  const { object, component, asset: known } = event.detail ?? {}
  if (!object) return
  try {
    const asset = known ?? (await fetchObjectAsset(object.id))
    if (!asset) {
      notify({
        severity: 'info',
        summary: 'Not linked',
        detail: `"${object.name}" is not linked to an asset.`,
      })
      return
    }
    const where = component
      ? `component ${component.serial} of "${object.name}"`
      : `"${object.name}"`
    const proceed = await confirmAsync({
      header: 'Unlink Asset',
      message: `Unlink asset "${asset.name}" from ${where}?`,
      acceptProps: { label: 'Unlink', severity: 'danger' },
    })
    if (!proceed) return
    await unlink.mutateAsync({ assetId: asset.id, affectedIds: [object.id] })
    notify({
      summary: 'Asset unlinked',
      detail: describeLink(asset.name, object.name, component?.serial),
    })
  } catch (err) {
    reportError(err, 'Could not unlink asset')
  }
}

async function onUnlinkAssets(event) {
  const assets = event.detail?.objects ?? []
  if (!assets.length) return
  try {
    const linked = (await Promise.all(assets.map((a) => fetchObject(a.id)))).filter(
      (a) => a.linkedObjectId,
    )
    if (!linked.length) {
      notify({
        severity: 'info',
        summary: 'Not linked',
        detail:
          assets.length === 1
            ? `Asset "${assets[0].name}" is not linked to an object.`
            : 'None of the selected assets is linked to an object.',
      })
      return
    }
    let message = `Unlink ${linked.length} assets from the objects they are linked to?`
    if (linked.length === 1) {
      const [asset] = linked
      const name = await fetchName(asset.linkedObjectId)
      const where = asset.componentSerial
        ? `component ${asset.componentSerial} of "${name}"`
        : `"${name}"`
      message = `Unlink asset "${asset.name}" from ${where}?`
    }
    const proceed = await confirmAsync({
      header: 'Unlink Asset',
      message,
      acceptProps: { label: 'Unlink', severity: 'danger' },
    })
    if (!proceed) return
    let failed = 0
    let lastError = null
    for (const asset of linked) {
      try {
        await unlink.mutateAsync({ assetId: asset.id, affectedIds: [asset.linkedObjectId] })
      } catch (err) {
        failed++
        lastError = err
      }
    }
    if (failed) {
      reportError(lastError, failed === 1 ? 'Could not unlink asset' : `Could not unlink ${failed} assets`)
    } else {
      notify({
        summary: linked.length === 1 ? 'Asset unlinked' : `${linked.length} assets unlinked`,
      })
    }
  } catch (err) {
    reportError(err, 'Could not unlink asset')
  }
}

onMounted(() => {
  document.addEventListener('asset:linkToAsset', onLinkToAsset)
  document.addEventListener('asset:linkToObject', onLinkToObject)
  document.addEventListener('asset:unlinkFromAsset', onUnlinkFromAsset)
  document.addEventListener('asset:unlink', onUnlinkAssets)
})

onUnmounted(() => {
  document.removeEventListener('asset:linkToAsset', onLinkToAsset)
  document.removeEventListener('asset:linkToObject', onLinkToObject)
  document.removeEventListener('asset:unlinkFromAsset', onUnlinkFromAsset)
  document.removeEventListener('asset:unlink', onUnlinkAssets)
})
</script>

<!-- Mounted only while open: the picker loads the whole object tree. -->
<template>
  <AllObjectsPickerDialog
    v-if="pickerVisible"
    v-model:visible="pickerVisible"
    :title="pickerTitle"
    :perspective-classes="pickingAsset ? ['AssetRoot'] : ['ServiceRoot', 'Network']"
    :selectable="pickingAsset ? assetFilter.selectable : targetFilter.selectable"
    :display-filter="pickingAsset ? assetFilter.displayFilter : targetFilter.displayFilter"
    @select="onPicked"
  >
    <!-- The picker draws its intro band whenever a slot is passed, so the slot itself is conditional. -->
    <template v-if="IDENTIFICATION_OPTION_SHOWN && !pending?.componentSerial" #default>
      <div class="link-option">
        <div class="link-option-row">
          <Checkbox v-model="updateIdentification" input-id="asset-link-identification" binary />
          <label for="asset-link-identification"
            >Update asset identification from the object</label
          >
        </div>
        <small class="link-hint">
          Writes the object's serial number, or its MAC address when it has none, into the asset
          and runs the asset's property auto-fill scripts.
        </small>
      </div>
    </template>
    <template v-if="pending?.componentSerial" #footer-hint>
      The component's serial number is written into the asset.
    </template>
  </AllObjectsPickerDialog>
</template>

<style scoped>
.link-option {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.link-option-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.link-option-row label {
  cursor: pointer;
}

.link-hint {
  padding-inline-start: 1.75rem;
  color: var(--p-text-muted-color);
}
</style>
