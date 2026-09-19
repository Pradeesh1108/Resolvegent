/**
 * Resolvegent Operational Control Plane - Core TypeScript Definitions
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type IncidentStatus =
  | 'RECEIVED'
  | 'CORRELATING'
  | 'INVESTIGATING'
  | 'ASSESSING_IMPACT'
  | 'DECIDING'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'RESOLVED'
  | 'FAILED'
  | 'ESCALATED'

export type AgentStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED'

export type ActorType = 'AGENT' | 'HUMAN' | 'SYSTEM'

export interface Alert {
  id: string
  incidentId?: string
  title: string
  source: string // e.g. 'Datadog', 'Prometheus', 'CloudWatch', 'PagerDuty'
  severity: Severity
  status: 'OPEN' | 'CORRELATED' | 'RESOLVED' | 'SILENCED'
  service: string
  cluster: string
  metricName?: string
  metricValue?: number | string
  threshold?: number | string
  timestamp: string
  summary: string
  labels: Record<string, string>
}

export interface Evidence {
  id: string
  agentType: string
  title: string
  type: 'LOG_SNIPPET' | 'DEPLOYMENT' | 'TOPOLOGY_NODE' | 'METRIC_ANOMALY' | 'MEMORY_SIMILARITY'
  description: string
  data: Record<string, any>
  timestamp: string
  confidenceScore?: number
}

export interface InvestigationAgent {
  id: string
  name: string
  type: 'LOG_ANALYZER' | 'CHANGE_CORRELATOR' | 'TOPOLOGY_MAPPER' | 'MEMORY_RETRIEVER' | 'IMPACT_ASSESSOR'
  status: AgentStatus
  startTime: string
  endTime?: string
  durationMs?: number
  findingsCount: number
  summary: string
  evidence: Evidence[]
}

export interface Action {
  id: string
  name: string
  command: string
  targetService: string
  parameters: Record<string, any>
  approvalRequired: boolean
  estimatedDurationSec: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  rollbackPlan: string
}

export interface Decision {
  id: string
  incidentId: string
  rootCause: string
  confidenceScore: number // e.g. 0.91 (91%)
  summary: string
  recommendedAction: Action
  alternativeActions: Action[]
  riskAssessment: 'LOW' | 'MEDIUM' | 'HIGH'
  timestamp: string
  approval_status?: string
  proposed_remediation?: {
    action_type: string
    target_service: string
    rationale: string
  }
}

export interface ApprovalRequest {
  id: string
  incidentId: string
  actionId: string
  actionName: string
  status: ApprovalStatus
  requestedAt: string
  decidedAt?: string
  approver?: string
  approverRole?: string
  comments?: string
  executionStatus?: 'QUEUED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
}

export interface VerificationCheck {
  name: string
  target: string
  expected: string
  actual: string
  passed: boolean
}

export interface VerificationResult {
  id: string
  incidentId: string
  actionId: string
  passed: boolean
  verifiedAt: string
  checks: VerificationCheck[]
  summary: string
}

export interface MemoryRecord {
  id: string
  historicalIncidentId: string
  title: string
  rootCause: string
  resolutionAction: string
  mttrSeconds: number
  similarityScore: number // 0.0 - 1.0 (e.g. 0.96)
  tags: string[]
  resolvedAt: string
  postmortemSummary: string
}

export interface AuditEvent {
  id: string
  incidentId?: string
  eventType:
    | 'ALERT_INGESTED'
    | 'AGENT_STARTED'
    | 'AGENT_COMPLETED'
    | 'DECISION_PROPOSED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_GRANTED'
    | 'ACTION_EXECUTED'
    | 'VERIFICATION_PASSED'
    | 'INCIDENT_RESOLVED'
  actor: string
  actorType: ActorType
  timestamp: string
  details: Record<string, any>
  status: 'SUCCESS' | 'WARNING' | 'FAILURE' | 'INFO'
}

export interface BusinessImpact {
  affectedService: string
  droppedTransactions: number
  estimatedRevenueAtRisk: number
  impactDescription: string
}

export interface Incident {
  id: string
  title: string
  status: IncidentStatus
  severity: Severity
  service: string
  environment: string
  openedAt: string
  resolvedAt?: string
  mttrSeconds?: number
  correlatedAlertIds: string[]
  alerts: Alert[]
  agents: InvestigationAgent[]
  rootCause?: string
  rootCauseConfidence?: number
  businessImpact: BusinessImpact
  decision?: Decision
  approval?: ApprovalRequest
  verification?: VerificationResult
  memoryMatches?: MemoryRecord[]
  auditTrail?: AuditEvent[]
}
