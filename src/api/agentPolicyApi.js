import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'

/**
 * Client-only, in-memory stand-in: the WebAPI has no agent policy endpoints yet, so nothing here
 * is persisted. Remove once /v1/objects/{id}/policies exists.
 */

const POLICIES_BY_TEMPLATE = new Map()
let nextId = 1

function seed(templateId, policies) {
  POLICIES_BY_TEMPLATE.set(
    templateId,
    policies.map((p) => ({ ...p, id: nextId++, templateId })),
  )
}

if (DEMO_CONTENT_ENABLED) {
  seed(901, [
    {
      name: 'Base Agent Configuration',
      type: 'AGENT_CONFIG',
      content: 'MasterServers = 127.0.0.1\nLogFile = { syslog }',
      lastModified: '2026-06-20T09:00:00Z',
    },
    {
      name: 'Deploy monitoring script',
      type: 'FILE_DELIVERY',
      content: '# deployed to /opt/netxms/scripts/monitor.sh',
      lastModified: '2026-06-22T14:30:00Z',
    },
  ])
}

export function listAgentPolicies(templateId) {
  if (!DEMO_CONTENT_ENABLED) return Promise.resolve([])
  return Promise.resolve(POLICIES_BY_TEMPLATE.get(Number(templateId)) ?? [])
}

export function createAgentPolicy(templateId, data) {
  if (!DEMO_CONTENT_ENABLED) return Promise.resolve(null)
  const id = Number(templateId)
  const policy = { ...data, id: nextId++, templateId: id, lastModified: new Date().toISOString() }
  const list = POLICIES_BY_TEMPLATE.get(id) ?? []
  POLICIES_BY_TEMPLATE.set(id, [...list, policy])
  return Promise.resolve(policy)
}

export function updateAgentPolicy(templateId, policyId, data) {
  if (!DEMO_CONTENT_ENABLED) return Promise.resolve(null)
  const id = Number(templateId)
  const list = POLICIES_BY_TEMPLATE.get(id) ?? []
  const updated = list.map((p) =>
    p.id === Number(policyId) ? { ...p, ...data, lastModified: new Date().toISOString() } : p,
  )
  POLICIES_BY_TEMPLATE.set(id, updated)
  return Promise.resolve(updated.find((p) => p.id === Number(policyId)) ?? null)
}

export function deleteAgentPolicy(templateId, policyId) {
  if (!DEMO_CONTENT_ENABLED) return Promise.resolve()
  const id = Number(templateId)
  const list = POLICIES_BY_TEMPLATE.get(id) ?? []
  POLICIES_BY_TEMPLATE.set(
    id,
    list.filter((p) => p.id !== Number(policyId)),
  )
  return Promise.resolve()
}
