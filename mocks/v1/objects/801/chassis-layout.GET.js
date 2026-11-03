import fs from 'node:fs'
import path from 'node:path'
import { getObject, getOverriddenIds } from '../../_lib/objectStore.js'

const CHASSIS_ID = 801
const CLASS_NAME_TO_CODE = { Node: 2, Chassis: 28 }
const NULL_GUID = '00000000-0000-0000-0000-000000000000'

export default function () {
  const filePath = path.resolve('mocks/v1/objects/801/chassis-layout.json')
  const base = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const candidateIds = new Set([...base.objects.map((o) => o.id), ...getOverriddenIds()])
  const objects = []
  for (const id of candidateIds) {
    const obj = getObject(id)
    if (!obj) continue
    const baseEntry = base.objects.find((o) => o.id === id)
    const chassisId = obj.chassisId !== undefined ? obj.chassisId : baseEntry ? CHASSIS_ID : undefined
    if (chassisId !== CHASSIS_ID) continue

    const p = obj.chassisPlacementConfig ?? baseEntry?.placement ?? {}
    objects.push({
      id,
      objectClass: CLASS_NAME_TO_CODE[obj.class] ?? baseEntry?.objectClass ?? 2,
      name: obj.name ?? baseEntry?.name ?? '',
      status: obj.status ?? baseEntry?.status ?? 0,
      placement: {
        image: p.image ?? NULL_GUID,
        width: p.width ?? 1,
        widthUnits: p.widthUnits ?? 0,
        height: p.height ?? 1,
        heightUnits: p.heightUnits ?? 0,
        positionWidth: p.positionWidth ?? 0,
        positionWidthUnits: p.positionWidthUnits ?? 0,
        positionHeight: p.positionHeight ?? 0,
        positionHeightUnits: p.positionHeightUnits ?? 0,
        orientation: p.orientation ?? 0,
      },
    })
  }

  return {
    chassisId: base.chassisId,
    name: base.name,
    controllerId: base.controllerId,
    status: base.status,
    objects,
  }
}
