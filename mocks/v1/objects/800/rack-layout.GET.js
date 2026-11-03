import fs from 'node:fs'
import path from 'node:path'
import { getObject, getOverriddenIds } from '../../_lib/objectStore.js'
import { listPassiveElements } from '../../_lib/passiveRackElements.js'

const RACK_ID = 800
const CLASS_NAME_TO_CODE = { Node: 2, Container: 5, Rack: 27, Chassis: 28 }
const NULL_GUID = '00000000-0000-0000-0000-000000000000'

export default function () {
  const filePath = path.resolve('mocks/v1/objects/800/rack-layout.json')
  const base = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const candidateIds = new Set([...base.objects.map((o) => o.id), ...getOverriddenIds()])
  const objects = []
  for (const id of candidateIds) {
    const obj = getObject(id)
    if (!obj) continue
    const baseEntry = base.objects.find((o) => o.id === id)
    const rackId = obj.rackId !== undefined ? obj.rackId : baseEntry ? RACK_ID : undefined
    if (rackId !== RACK_ID) continue

    objects.push({
      id,
      objectClass: CLASS_NAME_TO_CODE[obj.class] ?? baseEntry?.objectClass ?? 2,
      name: obj.name ?? baseEntry?.name ?? '',
      status: obj.status ?? baseEntry?.status ?? 0,
      rackPosition: obj.rackPosition ?? baseEntry?.rackPosition ?? 1,
      rackHeight: obj.rackHeight ?? baseEntry?.rackHeight ?? 1,
      rackOrientation: obj.rackOrientation ?? baseEntry?.rackOrientation ?? 0,
      rackImageFront: obj.rackImageFront ?? baseEntry?.rackImageFront ?? NULL_GUID,
      rackImageRear: obj.rackImageRear ?? baseEntry?.rackImageRear ?? NULL_GUID,
    })
  }

  return {
    rackId: base.rackId,
    name: base.name,
    height: base.height,
    topBottomNumbering: base.topBottomNumbering,
    passiveElements: listPassiveElements(),
    objects,
  }
}
