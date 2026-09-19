import * as React from 'react'
import { Link } from 'react-router-dom'
import { AIActivityFlow } from '@/components/AIActivityFlow'
import { fetchIncidents, fetchAlerts, resetWholeSystem, submitApproval } from '@/api/client'
import type { Incident, Alert } from '@/types'

const ALERT_ENGINE_URL = import.meta.env.VITE_ALERT_ENGINE_URL || 'http://localhost:8001'
const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:3000'

export const OverviewPage: React.FC = () => {
  const [incidents, setIncidents] = React.useState<Incident[]>([])
  const [alerts, setAlerts] = React.useState<Alert[]>([])
  const [simulationPhaseIndex, setSimulationPhaseIndex] = React.useState<number>(-1)
  const [simulationStatus, setSimulationStatus] = React.useState<'IDLE' | 'RUNNING' | 'COMPLETED'>('IDLE')
  const [isEvidenceOpen, setIsEvidenceOpen] = React.useState(false)
  const [isResetting, setIsResetting] = React.useState(false)
  const [isSubmittingApproval, setIsSubmittingApproval] = React.useState(false)

  // Synchronize live incidents and alerts from backend
  const refreshData = React.useCallback(async () => {
    try {
      const [incList, altList] = await Promise.all([fetchIncidents(), fetchAlerts()])
      setIncidents(incList)
      setAlerts(altList)
    } catch (err) {
      console.error('Failed to refresh overview data:', err)
    }
  }, [])

  React.useEffect(() => {
    refreshData()
    const interval = setInterval(refreshData, 2000)
    return () => clearInterval(interval)
  }, [refreshData])

  const handleSimulationStatusChange = (
    status: 'IDLE' | 'RUNNING' | 'COMPLETED',
    phaseIndex: number
  ) => {
    setSimulationStatus(status)
    setSimulationPhaseIndex(phaseIndex)
  }

  const handleResetSystem = async () => {
    if (
      !window.confirm(
        'Reset and clear all data across the platform? This will wipe all alerts, incidents, audit events, and memory records, leaving the port completely empty with zero data stored.'
      )
    ) {
      return
    }

    setIsResetting(true)
    // Optimistic UI wipe
    setIncidents([])
    setAlerts([])
    setSimulationPhaseIndex(-1)
    setSimulationStatus('IDLE')

    try {
      await resetWholeSystem()
      await refreshData()
    } catch (err) {
      console.error('Failed to reset system data:', err)
      await refreshData()
    } finally {
      setIsResetting(false)
    }
  }

  const handleApproval = async (status: 'APPROVED' | 'REJECTED', activeIncId: string) => {
    setIsSubmittingApproval(true)
    await submitApproval(activeIncId, status, `Human ${status} via Command Center`)
    setIsSubmittingApproval(false)
    refreshData()
  }

  // Active or latest incident
  const activeIncident: Incident | undefined =
    incidents.find((inc) => inc.status !== 'RESOLVED') || incidents[0]

  const isResolved = activeIncident?.status === 'RESOLVED'
  const isCritical = activeIncident?.severity === 'CRITICAL'

  // Incident status badge
  const incidentStatusLabel = !activeIncident
    ? 'Monitoring'
    : isResolved
    ? 'Resolved'
    : simulationPhaseIndex >= 4
    ? 'Verifying'
    : simulationPhaseIndex >= 3
    ? 'Remediating'
    : simulationPhaseIndex >= 2
    ? 'Investigating'
    : simulationPhaseIndex >= 1
    ? 'Correlating'
    : 'Detecting'

  return (
    <div className="min-h-full w-full py-10 px-6 max-w-4xl mx-auto space-y-10">
      {/* Top Toolbar: Status & System Wipe / Refresh Option */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
            Control Plane (Port 5173)
          </span>
          <span className="text-zinc-700 text-xs">|</span>
          <span className="text-xs font-mono text-zinc-500">
            {incidents.length} incidents · {alerts.length} alerts
          </span>
        </div>

        <button
          onClick={handleResetSystem}
          disabled={isResetting}
          className="px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-red-950/40 border border-zinc-800 hover:border-red-900/50 text-xs font-mono text-zinc-400 hover:text-red-400 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Reset and clear all data across the platform"
        >
          <svg
            className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>{isResetting ? 'Clearing System...' : 'Reset & Clear System'}</span>
        </button>
      </div>
      {/* 1. Active Incident Hero Block */}
      {activeIncident ? (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
              Active Incident
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                isCritical
                  ? 'bg-red-950/50 text-red-400 border-red-800/40'
                  : 'bg-amber-950/50 text-amber-400 border-amber-800/40'
              }`}
            >
              {activeIncident.severity}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                isResolved
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40'
                  : simulationStatus === 'RUNNING'
                  ? 'bg-sky-950/50 text-sky-400 border-sky-800/40'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              {incidentStatusLabel}
            </span>
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-normal tracking-tight text-white mb-2">
              {activeIncident.title}
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Autonomous resolution pipeline actively correlates signals for{' '}
              <span className="text-zinc-200">{activeIncident.service}</span> in{' '}
              <span className="text-zinc-200">{activeIncident.environment}</span>.
              {activeIncident.rootCause && (
                <span className="block mt-1 text-zinc-300">
                  Confirmed Root Cause: {activeIncident.rootCause}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-zinc-500">
            <div>
              Incident ID: <span className="text-zinc-300 font-mono">{activeIncident.id}</span>
            </div>
            <div>
              Service: <span className="text-zinc-300">{activeIncident.service}</span>
            </div>
            <div>
              Correlated Alerts:{' '}
              <span className="text-zinc-300 font-mono">
                {alerts.filter((a) => a.incidentId === activeIncident.id).length || alerts.length}
              </span>
            </div>
            <Link
              to={`/incidents/${activeIncident.id}`}
              className="text-zinc-300 hover:text-white underline underline-offset-4 transition-colors"
            >
              Open detail view →
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-4 p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
              Autonomous Sentinel Active
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-normal tracking-tight text-white mb-1">
              All Systems Operational
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Autonomous Incident Engine is actively listening for anomalous telemetry from the
              e-commerce platform. When an incident is triggered, the agent will automatically detect,
              correlate, investigate, and remediate.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 pt-2 text-xs">
            <a
              href={ALERT_ENGINE_URL}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg bg-zinc-100 text-black font-medium hover:bg-white transition-colors cursor-pointer"
            >
              Trigger Incident on Alert Engine →
            </a>
            <a
              href={STOREFRONT_URL}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white transition-colors cursor-pointer"
            >
              Open Storefront →
            </a>
          </div>
        </section>
      )}

      {/* Human Approval Required Card */}
      {activeIncident && activeIncident.decision?.approval_status === 'PENDING' && !isResolved && (
        <section className="space-y-4 p-6 rounded-xl border border-amber-800/80 bg-amber-950/20">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-amber-400">
              Human Review Required
            </span>
          </div>
          <div>
            <h2 className="text-xl font-normal tracking-tight text-white mb-2">
              Proposed Remediation Pending Approval
            </h2>
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg space-y-3 mb-4">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-zinc-300">Action:</span>
                <span className="text-sm text-zinc-100 font-mono bg-zinc-900 px-2 py-1 rounded">
                  {activeIncident.decision.proposed_remediation?.action_type || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-zinc-300">Target Service:</span>
                <span className="text-sm text-zinc-100">
                  {activeIncident.decision.proposed_remediation?.target_service || 'Unknown'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-300">Rationale:</span>
                <span className="text-sm text-zinc-400">
                  {activeIncident.decision.proposed_remediation?.rationale || 'No rationale provided'}
                </span>
              </div>
            </div>
            
            <div className="flex gap-4 mt-4">
              <button
                onClick={() => handleApproval('APPROVED', activeIncident.id)}
                disabled={isSubmittingApproval}
                className="px-6 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingApproval ? 'Submitting...' : 'Approve Action'}
              </button>
              <button
                onClick={() => handleApproval('REJECTED', activeIncident.id)}
                disabled={isSubmittingApproval}
                className="px-6 py-2 rounded-lg bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject Action
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2. Visual Resolution Flow */}
      <section className="space-y-3">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Autonomous Resolution Pipeline
        </div>
        <div className="p-5 rounded-xl border border-zinc-800/70 bg-zinc-950/40">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {/* Step 1: Detect */}
            <div className="flex flex-col space-y-1">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  activeIncident || simulationPhaseIndex >= 0
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeIncident || simulationPhaseIndex >= 0
                      ? 'bg-emerald-400'
                      : 'bg-zinc-700'
                  }`}
                />
                1. Detect
              </div>
              <span className="text-[11px] text-zinc-500">
                {alerts.length > 0 ? `${alerts.length} alerts ingested` : 'Standby'}
              </span>
            </div>

            {/* Step 2: Correlate */}
            <div className="flex flex-col space-y-1">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  activeIncident || simulationPhaseIndex >= 1
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeIncident || simulationPhaseIndex >= 1
                      ? 'bg-emerald-400'
                      : 'bg-zinc-700'
                  }`}
                />
                2. Correlate
              </div>
              <span className="text-[11px] text-zinc-500">
                {activeIncident ? `${activeIncident.id} grouped` : 'Waiting'}
              </span>
            </div>

            {/* Step 3: Investigate */}
            <div className="flex flex-col space-y-1">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isResolved || simulationPhaseIndex >= 2
                    ? 'text-emerald-400'
                    : simulationStatus === 'RUNNING'
                    ? 'text-sky-400'
                    : 'text-zinc-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isResolved || simulationPhaseIndex >= 2
                      ? 'bg-emerald-400'
                      : simulationStatus === 'RUNNING'
                      ? 'bg-sky-400 animate-pulse'
                      : 'bg-zinc-700'
                  }`}
                />
                3. Investigate
              </div>
              <span className="text-[11px] text-zinc-500">
                {activeIncident?.rootCause ? 'Root cause confirmed' : 'Diagnostic probes'}
              </span>
            </div>

            {/* Step 4: Remediate */}
            <div className="flex flex-col space-y-1">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isResolved
                    ? 'text-emerald-400'
                    : simulationPhaseIndex >= 3
                    ? 'text-sky-400'
                    : 'text-zinc-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isResolved
                      ? 'bg-emerald-400'
                      : simulationPhaseIndex >= 3
                      ? 'bg-sky-400 animate-pulse'
                      : 'bg-zinc-700'
                  }`}
                />
                4. Remediate
              </div>
              <span className="text-[11px] text-zinc-400">
                {isResolved
                  ? 'Remediation applied'
                  : simulationPhaseIndex >= 3
                  ? 'Targeted execution'
                  : 'Awaiting diagnosis'}
              </span>
            </div>

            {/* Step 5: Verify */}
            <div className="flex flex-col space-y-1">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isResolved ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isResolved ? 'bg-emerald-400' : 'bg-zinc-700'
                  }`}
                />
                5. Verify
              </div>
              <span className="text-[11px] text-zinc-500">
                {isResolved ? 'Health verified' : 'Queued'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Real Autonomous Agent Activity Feed */}
      <section>
        <AIActivityFlow
          onSimulationStatusChange={handleSimulationStatusChange}
          activeIncidentId={activeIncident?.id}
        />
      </section>

      {/* 4. Expandable Diagnostics / Evidence */}
      {activeIncident && (
        <section className="pt-2">
          <button
            onClick={() => setIsEvidenceOpen(!isEvidenceOpen)}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                isEvidenceOpen ? 'rotate-90' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{isEvidenceOpen ? 'Hide' : 'View'} Technical Diagnostics & Root Cause</span>
          </button>

          {isEvidenceOpen && (
            <div className="mt-4 p-5 rounded-xl border border-zinc-800/70 bg-zinc-950/40 space-y-4 animate-in fade-in duration-150">
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                Correlated Root Cause Analysis
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-black/60 border border-zinc-800/50">
                  <div className="text-zinc-300 font-medium mb-1">
                    Definitive Root Cause Synthesis
                  </div>
                  <div className="font-mono text-zinc-400 text-[11px] leading-relaxed">
                    {activeIncident.rootCause ||
                      'Automated investigation synthesized anomalies from ingested metrics and logs.'}
                  </div>
                  {activeIncident.rootCauseConfidence && (
                    <div className="mt-2 text-[10px] font-mono text-emerald-400">
                      Calibrated Confidence Score: {Math.round(activeIncident.rootCauseConfidence * 100)}%
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-1">
                  <Link
                    to="/alerts"
                    className="text-zinc-400 hover:text-white underline underline-offset-4"
                  >
                    View raw alerts ({alerts.length}) →
                  </Link>
                  <Link
                    to="/memory"
                    className="text-zinc-400 hover:text-white underline underline-offset-4"
                  >
                    View historical memory & playbooks →
                  </Link>
                  <Link
                    to="/audit"
                    className="text-zinc-400 hover:text-white underline underline-offset-4"
                  >
                    View full immutable audit ledger →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default OverviewPage
