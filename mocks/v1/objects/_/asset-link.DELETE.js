import { unlinkAsset } from '../../_lib/assets.js'
import { nodeIdOf } from '../../_lib/nodeInventory.js'

export default function (req, res) {
  return unlinkAsset(nodeIdOf(req), res)
}
