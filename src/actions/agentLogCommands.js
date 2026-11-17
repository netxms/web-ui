import { getAgentLog } from '@/api/objectsApi'
import { agentLogFilename, describeAgentLogError } from '@/utils/agentLog'
import { downloadBlob } from '@/utils/fileDownload'
import { notify, notifyAction } from '@/utils/notify'

/**
 * The whole log file, saved as `<node>-nxagentd.log`. The bytes are saved as received, so the
 * file keeps the agent's encoding.
 *
 * @param {{ id: number, name?: string }} object - node
 * @returns {Promise<boolean>} whether the file was handed to the browser
 */
export async function downloadAgentLog(object) {
  notifyAction('Downloading agent log...', 'pi pi-download')
  try {
    const blob = await getAgentLog(object.id)
    downloadBlob(agentLogFilename(object.name), blob)
    return true
  } catch (err) {
    notify({
      severity: 'error',
      summary: 'Could not download agent log',
      detail: describeAgentLogError(err),
      life: 8000,
    })
    return false
  }
}
