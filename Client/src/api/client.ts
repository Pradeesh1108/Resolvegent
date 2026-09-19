import type { Incident, Alert, AuditEvent, MemoryRecord } from '@/types'

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
export const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE

export interface AgentStatusResponse {
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED'
  phase: string
  current_incident_id?: string
  current_incident_title?: string
  last_updated?: string
}

export async function fetchAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${API_BASE}/alerts`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.map((a: any) => ({
      id: a.id,
      incidentId: a.incidentId,
      title: a.title,
      source: a.source || 'ecommerce-platform',
      severity: a.severity === 'P1' ? 'CRITICAL' : a.severity === 'P2' ? 'HIGH' : a.severity === 'P3' ? 'MEDIUM' : 'LOW',
      status: a.status === 'RESOLVED' ? 'RESOLVED' : a.status === 'CORRELATED' ? 'CORRELATED' : 'OPEN',
      service: a.service || 'ecommerce-service',
      cluster: 'production-us-east-1',
      metricName: a.metricName,
      metricValue: a.metricValue,
      threshold: a.threshold,
      timestamp: a.timestamp || new Date().toISOString(),
      summary: a.summary || '',
      labels: {}
    }))
  } catch (err) {
    console.error('Failed to fetch alerts:', err)
    return []
  }
}

export async function fetchIncidents(): Promise<Incident[]> {
  try {
    const res = await fetch(`${API_BASE}/incidents`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.map((inc: any) => ({
      id: inc.id,
      title: inc.title || `Incident ${inc.id}`,
      status: inc.status === 'RESOLVED' ? 'RESOLVED' : 'INVESTIGATING',
      severity: inc.severity === 'P1' ? 'CRITICAL' : inc.severity === 'P2' ? 'HIGH' : 'MEDIUM',
      service: inc.service || 'ecommerce-service',
      environment: inc.environment || 'production',
      openedAt: inc.openedAt || new Date().toISOString(),
      resolvedAt: inc.resolvedAt,
      mttrSeconds: inc.mttrSeconds,
      correlatedAlertIds: [],
      alerts: [],
      agents: [],
      rootCause: inc.rootCause,
      rootCauseConfidence: inc.rootCauseConfidence,
      businessImpact: inc.businessImpact || {
        affectedService: inc.service || 'checkout',
        droppedTransactions: inc.severity === 'P1' ? 840 : 120,
        estimatedRevenueAtRisk: inc.severity === 'P1' ? 42000 : 8500,
        impactDescription: `Autonomous SRE detected anomaly on ${inc.service || 'ecommerce-service'}`
      },
      decision: inc.decision
    }))
  } catch (err) {
    console.error('Failed to fetch incidents:', err)
    return []
  }
}

export async function fetchIncidentById(id: string): Promise<Incident | null> {
  try {
    const res = await fetch(`${API_BASE}/incidents/${id}`)
    if (!res.ok) return null
    const inc = await res.json()
    return {
      id: inc.id,
      title: inc.title || `Incident ${inc.id}`,
      status: inc.status === 'RESOLVED' ? 'RESOLVED' : 'INVESTIGATING',
      severity: inc.severity === 'P1' ? 'CRITICAL' : inc.severity === 'P2' ? 'HIGH' : 'MEDIUM',
      service: inc.service || 'ecommerce-service',
      environment: inc.environment || 'production',
      openedAt: inc.openedAt || new Date().toISOString(),
      resolvedAt: inc.resolvedAt,
      mttrSeconds: inc.mttrSeconds,
      correlatedAlertIds: [],
      alerts: [],
      agents: [],
      rootCause: inc.rootCause,
      rootCauseConfidence: inc.rootCauseConfidence,
      businessImpact: inc.businessImpact || {
        affectedService: inc.service || 'checkout',
        droppedTransactions: 420,
        estimatedRevenueAtRisk: 28000,
        impactDescription: `Autonomous SRE detected anomaly on ${inc.service || 'ecommerce-service'}`
      },
      decision: inc.decision
    }
  } catch (err) {
    console.error(`Failed to fetch incident ${id}:`, err)
    return null
  }
}

export async function fetchAuditEvents(incidentId?: string): Promise<AuditEvent[]> {
  try {
    const res = await fetch(`${API_BASE}/audit/events`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    let list = data
    if (incidentId) {
      list = list.filter((ev: any) => ev.incidentId === incidentId)
    }
    return list.map((ev: any) => ({
      id: ev.id,
      incidentId: ev.incidentId,
      eventType: ev.eventType || 'AGENT_ACTION',
      actor: ev.actor || 'agent',
      actorType: ev.actorType || 'AGENT',
      timestamp: ev.timestamp || new Date().toISOString(),
      details: ev.details || {},
      status: ev.status || 'SUCCESS'
    }))
  } catch (err) {
    console.error('Failed to fetch audit events:', err)
    return []
  }
}

export async function fetchMemoryRecords(): Promise<MemoryRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/memory/records`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.map((m: any, idx: number) => {
      const recId = m.id || m.doc_id || m.historicalIncidentId || `MEM-${idx + 1}`
      const incId = m.historicalIncidentId || m.doc_id || `KB-${idx + 1}`
      return {
        id: recId,
        historicalIncidentId: incId,
        title: m.category
          ? `${m.category.toUpperCase()}: ${m.service || 'Service'} Playbook`
          : m.content?.slice(0, 50) || 'Verified Runbook',
        rootCause: m.content || 'Historical cluster diagnostic profile',
        resolutionAction: 'Targeted service restart / configuration synchronization',
        mttrSeconds: 180,
        similarityScore: 0.94,
        tags: [m.category || 'runbook', m.service || 'ecommerce'],
        resolvedAt: new Date().toISOString(),
        postmortemSummary: m.content || '',
      }
    })
  } catch (err) {
    console.error('Failed to fetch memory records:', err)
    return []
  }
}

export async function deleteMemoryRecord(recordId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/memory/records/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch (err) {
    console.error(`Failed to delete memory record ${recordId}:`, err)
    return false
  }
}

export async function clearAllMemoryRecords(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/memory/records`, {
      method: 'DELETE',
    })
    return res.ok
  } catch (err) {
    console.error('Failed to clear all memory records:', err)
    return false
  }
}

export async function fetchAgentStatus(): Promise<AgentStatusResponse> {
  try {
    const res = await fetch(`${API_BASE}/agent/status`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return { status: 'IDLE', phase: 'IDLE' }
  }
}

export async function resetWholeSystem(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/simulation/reset`, {
      method: 'POST',
    })
    return res.ok
  } catch (err) {
    console.error('Failed to reset system data:', err)
    return false
  }
}

export async function submitApproval(
  incidentId: string,
  approvalStatus: 'APPROVED' | 'REJECTED',
  comments: string = ''
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/incidents/${incidentId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        approvalStatus,
        approver: 'pradeeshsivaprakasam@gmail.com',
        comments
      })
    })
    return res.ok
  } catch (err) {
    console.error('Failed to submit approval:', err)
    return false
  }
}
