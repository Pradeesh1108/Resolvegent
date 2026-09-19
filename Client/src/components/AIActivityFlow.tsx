import * as React from 'react'
import { fetchAuditEvents, fetchAgentStatus, type AgentStatusResponse } from '@/api/client'
import type { AuditEvent } from '@/types'

const ALERT_ENGINE_URL = import.meta.env.VITE_ALERT_ENGINE_URL || 'http://localhost:8001'

interface AIActivityFlowProps {
  onSimulationStatusChange?: (
    status: 'IDLE' | 'RUNNING' | 'COMPLETED',
    currentPhaseIndex: number,
    incidentId?: string
  ) => void
  activeIncidentId?: string
}

export const AIActivityFlow: React.FC<AIActivityFlowProps> = ({
  onSimulationStatusChange,
  activeIncidentId,
}) => {
  const [agentState, setAgentState] = React.useState<AgentStatusResponse>({
    status: 'IDLE',
    phase: 'IDLE',
  })
  const [auditEvents, setAuditEvents] = React.useState<AuditEvent[]>([])
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  // Poll agent status & audit events in real-time
  React.useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      try {
        const [statusRes, auditRes] = await Promise.all([
          fetchAgentStatus(),
          fetchAuditEvents(activeIncidentId),
        ])
        if (!isMounted) return

        setAgentState(statusRes)
        setAuditEvents(auditRes)

        // Compute phase index for parent overview component (0: Detect, 1: Correlate, 2: Investigate, 3: Remediate, 4: Verify)
        let phaseIdx = -1
        const p = statusRes.phase?.toLowerCase() || ''
        if (p.includes('detect')) phaseIdx = 0
        else if (p.includes('correlat')) phaseIdx = 1
        else if (p.includes('investigat') || p.includes('decid')) phaseIdx = 2
        else if (p.includes('remediat')) phaseIdx = 3
        else if (p.includes('verify') || p.includes('complet')) phaseIdx = 4

        const mappedStatus: 'IDLE' | 'RUNNING' | 'COMPLETED' =
          (statusRes.status === 'RUNNING' || statusRes.status === 'PAUSED')
            ? 'RUNNING'
            : (statusRes.status === 'COMPLETED' || auditRes.length > 0)
            ? 'COMPLETED'
            : 'IDLE'

        onSimulationStatusChange?.(mappedStatus, phaseIdx, statusRes.current_incident_id)
      } catch (err) {
        console.error('Failed to sync agent activity flow:', err)
      }
    }

    loadData()
    const interval = setInterval(loadData, 1500)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [activeIncidentId, onSimulationStatusChange])

  const isRunning = agentState.status === 'RUNNING'

  return (
    <div className="space-y-4">
      {/* Real-time Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-zinc-800/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
              Autonomous Agent Activity Stream
            </span>
            {isRunning && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-sky-950/60 text-sky-400 border border-sky-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                Live Agent Loop Active
              </span>
            )}
            {!isRunning && auditEvents.length > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Verified & In Sync
              </span>
            )}
            {!isRunning && auditEvents.length === 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
                Awaiting Telemetry
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {isRunning
              ? `Agent loop currently executing: Phase [${agentState.phase.toUpperCase()}] for ${
                  agentState.current_incident_id || 'active incident'
                }`
              : auditEvents.length > 0
              ? `Autonomous pipeline processed ${auditEvents.length} verifiable actions across telemetry, root cause analysis, and remediation.`
              : 'Agent loop will trigger automatically upon receiving incident alerts from Alert Engine (port 8001) or Storefront (port 3000).'}
          </p>
        </div>

        {/* Live connected status badge */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Backend Connected</span>
        </div>
      </div>

      {/* Audit Log / Agent Action Stream */}
      {auditEvents.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 text-center space-y-2">
          <div className="text-xs font-mono text-zinc-400">
            No agent actions recorded yet.
          </div>
          <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
            Trigger <span className="text-zinc-300 font-medium">Incident 1</span>,{' '}
            <span className="text-zinc-300 font-medium">Incident 2</span>, or{' '}
            <span className="text-zinc-300 font-medium">Incident 3</span> from the{' '}
            <a
              href={ALERT_ENGINE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-300 underline hover:text-white"
            >
              Alert Engine
            </a>{' '}
            or the Storefront. The autonomous agent will immediately ingest, correlate, and resolve.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {auditEvents.map((event, idx) => {
            const isExpanded = expandedId === event.id
            const node = event.details?.node || 'agent_action'
            const actionText = event.details?.action || event.eventType
            const resultText = event.details?.result || ''
            const reasoningText = event.details?.reasoning || ''

            // Visual badge color based on node type
            const isDecision = node.includes('decide') || node.includes('remediat')
            const isVerification = node.includes('verify') || node.includes('close')
            const isInvestigate = node.includes('investigat') || node.includes('context')

            return (
              <div
                key={event.id}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-2 hover:border-zinc-700/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      Step {idx + 1}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        isVerification
                          ? 'text-emerald-400'
                          : isDecision
                          ? 'text-amber-400'
                          : isInvestigate
                          ? 'text-sky-400'
                          : 'text-zinc-200'
                      }`}
                    >
                      {node.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      ({event.actor} · {event.actorType})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                    <span>{event.timestamp.slice(11, 19)} UTC</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {event.status}
                    </span>
                  </div>
                </div>

                {/* Primary Action Description */}
                <div className="text-xs text-zinc-300 font-medium">
                  {actionText}
                </div>

                {/* Result summary snippet */}
                {resultText && (
                  <div className="text-xs font-mono text-zinc-400 bg-black/60 rounded px-2.5 py-1.5 border border-zinc-900 leading-relaxed break-words">
                    {resultText}
                  </div>
                )}

                {/* Optional Expandable Reasoning & Details */}
                {reasoningText && (
                  <div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>{isExpanded ? 'Hide' : 'View'} Reasoning & Rationale</span>
                      <svg
                        className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 text-xs text-zinc-400 bg-zinc-900/50 p-2.5 rounded border border-zinc-800 leading-relaxed font-sans">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AIActivityFlow
