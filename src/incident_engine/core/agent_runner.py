import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from incident_engine.core.database import SessionLocal
from incident_engine.core.models_db import IncidentDB, AlertDB, AuditEventDB
from incident_engine.agents.graph import graph

_agent_lock = asyncio.Lock()
_active_agent_state: Dict[str, Any] = {
    "status": "IDLE",
    "phase": "IDLE",
    "current_incident_id": None,
    "current_incident_title": None,
    "last_updated": None
}

def get_active_agent_state() -> Dict[str, Any]:
    return dict(_active_agent_state)

async def run_autonomous_agent(auto_remediate: bool = True, preferred_incident_id: Optional[str] = None):
    """Headless autonomous incident agent runner triggered automatically on alert arrival."""
    async with _agent_lock:
        db = SessionLocal()
        try:
            # Query pending alerts
            query = db.query(AlertDB).filter(AlertDB.status == "RECEIVED")
            if preferred_incident_id:
                query = query.filter(AlertDB.incidentId == preferred_incident_id)
            pending_alerts = query.order_by(AlertDB.timestamp.asc()).all()

            if not pending_alerts:
                pending_alerts = db.query(AlertDB).filter(AlertDB.status == "RECEIVED").order_by(AlertDB.timestamp.asc()).all()
                if not pending_alerts:
                    return {"status": "NOOP", "message": "No pending alerts"}

            alert_dicts = []
            cand_inc_id = preferred_incident_id
            for al in pending_alerts:
                al.status = "PROCESSING"
                if not cand_inc_id and al.incidentId:
                    cand_inc_id = al.incidentId

                metric_val = None
                if al.metricValue is not None:
                    try:
                        metric_val = float(al.metricValue)
                    except (ValueError, TypeError):
                        metric_val = None

                alert_dicts.append({
                    "id": al.id,
                    "incidentId": al.incidentId,
                    "timestamp": al.timestamp,
                    "service": al.service,
                    "severity": al.severity,
                    "title": al.title,
                    "message": al.summary,
                    "source": al.source,
                    "metric_name": al.metricName,
                    "metric_value": metric_val
                })
            db.commit()

            session_id = cand_inc_id or f"INC-{uuid.uuid4().hex[:4].upper()}"

            _active_agent_state["status"] = "RUNNING"
            _active_agent_state["phase"] = "detecting"
            _active_agent_state["current_incident_id"] = session_id
            _active_agent_state["last_updated"] = datetime.now(timezone.utc).isoformat()

            initial_state = {
                "incoming_alerts": alert_dicts,
                "normalized_alerts": [],
                "retrieved_context": [],
                "hypotheses": [],
                "evidence": [],
                "investigation_steps": [],
                "audit_log": [],
                "current_status": "TRIGGERED",
                "auto_remediate": auto_remediate
            }

            config = {"configurable": {"thread_id": session_id}}
            graph.update_state(config, initial_state)

            current_incident_id = session_id

            # Stream LangGraph state machine execution
            async for event in graph.astream(None, config, stream_mode="updates"):
                for node_name, state_update in event.items():
                    phase_map = {
                        "detecting": ["detect_trigger"],
                        "correlating": ["correlate_alerts"],
                        "investigating": ["retrieve_context", "investigate", "execute_investigation_tool"],
                        "deciding": ["decide_root_cause", "decide_remediation"],
                        "remediating": ["human_approval", "execute_remediation"],
                        "verifying": ["verify_remediation", "update_knowledge_base", "close_incident"]
                    }
                    for p_name, nodes in phase_map.items():
                        if node_name in nodes:
                            _active_agent_state["phase"] = p_name
                            break

                    _active_agent_state["last_updated"] = datetime.now(timezone.utc).isoformat()

                    # Handle incident created or updated
                    if "incident" in state_update and state_update["incident"]:
                        inc = state_update["incident"]
                        if not isinstance(inc, dict):
                            inc = inc.model_dump()
                        current_incident_id = inc.get("id") or current_incident_id
                        _active_agent_state["current_incident_id"] = current_incident_id
                        _active_agent_state["current_incident_title"] = inc.get("title")

                        db_inc = db.query(IncidentDB).filter(IncidentDB.id == current_incident_id).first()
                        if not db_inc:
                            db_inc = IncidentDB(id=current_incident_id)
                            db.add(db_inc)

                        db_inc.title = inc.get("title")
                        db_inc.status = inc.get("status", "ACTIVE")
                        db_inc.severity = inc.get("severity", "P1")
                        services = inc.get("affected_services", [])
                        db_inc.service = services[0] if services else "ecommerce-service"
                        db_inc.openedAt = inc.get("created_at") or datetime.now(timezone.utc).isoformat()
                        db_inc.correlatedAlertCount = len(inc.get("correlated_alert_ids", [])) or len(alert_dicts)
                        db.commit()

                        # Link alerts to this incident
                        corr_ids = inc.get("correlated_alert_ids", [])
                        for al_dict in alert_dicts:
                            al_id = al_dict.get("id")
                            if not corr_ids or al_id in corr_ids:
                                db_al = db.query(AlertDB).filter(AlertDB.id == al_id).first()
                                if db_al:
                                    db_al.incidentId = current_incident_id
                                    db_al.status = "CORRELATED"
                        db.commit()

                    # Handle Root Cause & Remediation Decision
                    if "root_cause" in state_update and current_incident_id:
                        db_inc = db.query(IncidentDB).filter(IncidentDB.id == current_incident_id).first()
                        if db_inc:
                            db_inc.rootCause = state_update.get("root_cause")
                            db_inc.rootCauseConfidence = state_update.get("confidence")
                            db.commit()

                    if "proposed_remediation" in state_update and current_incident_id:
                        db_inc = db.query(IncidentDB).filter(IncidentDB.id == current_incident_id).first()
                        if db_inc:
                            rem = state_update.get("proposed_remediation")
                            if not isinstance(rem, dict) and hasattr(rem, "model_dump"):
                                rem = rem.model_dump()
                            db_inc.decision = {
                                "approval_status": state_update.get("approval_status", "PENDING"),
                                "proposed_remediation": rem,
                                "riskAssessment": state_update.get("risk_level", "HIGH")
                            }
                            db.commit()

                    # Handle verification & closure
                    if node_name == "close_incident" or state_update.get("current_status") == "RESOLVED":
                        db_inc = db.query(IncidentDB).filter(IncidentDB.id == current_incident_id).first()
                        if db_inc:
                            db_inc.status = "RESOLVED"
                            db_inc.resolvedAt = datetime.now(timezone.utc).isoformat()
                            db.commit()

                        # Mark alerts resolved
                        for al_dict in alert_dicts:
                            al_id = al_dict.get("id")
                            db_al = db.query(AlertDB).filter(AlertDB.id == al_id).first()
                            if db_al:
                                db_al.status = "RESOLVED"
                        db.commit()

                    # Persist Audit Log
                    if "audit_log" in state_update:
                        for audit in state_update["audit_log"]:
                            if not isinstance(audit, dict):
                                audit = audit.model_dump()
                            db_audit = AuditEventDB(
                                id=f"AUD-{datetime.now().strftime('%H%M%S%f')}",
                                incidentId=audit.get("incident_id", current_incident_id),
                                eventType="AGENT_ACTION",
                                actor=audit.get("actor", "agent"),
                                actorType="AGENT" if audit.get("actor") != "system" else "SYSTEM",
                                timestamp=audit.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                                status="SUCCESS",
                                details={
                                    "node": audit.get("node_name"),
                                    "action": audit.get("action"),
                                    "result": audit.get("result"),
                                    "reasoning": audit.get("decision_reasoning")
                                }
                            )
                            db.add(db_audit)
                        db.commit()

                    # Pacing pause so UI can observe live transition
                    await asyncio.sleep(0.4)

            current_state = graph.get_state(config)
            if current_state.next:
                # Graph is paused
                _active_agent_state["status"] = "PAUSED"
                _active_agent_state["phase"] = "awaiting_approval"
                _active_agent_state["last_updated"] = datetime.now(timezone.utc).isoformat()
                return {
                    "status": "PAUSED",
                    "incident_id": current_incident_id
                }
            else:
                # Mark completion
                _active_agent_state["status"] = "COMPLETED"
                _active_agent_state["phase"] = "completed"
                _active_agent_state["last_updated"] = datetime.now(timezone.utc).isoformat()

                # Ensure incident status marked RESOLVED
                db_inc = db.query(IncidentDB).filter(IncidentDB.id == current_incident_id).first()
                if db_inc and db_inc.status != "RESOLVED":
                    db_inc.status = "RESOLVED"
                    db_inc.resolvedAt = datetime.now(timezone.utc).isoformat()
                    db.commit()

                return {
                    "status": "COMPLETED",
                    "incident_id": current_incident_id
                }

        except Exception as e:
            _active_agent_state["status"] = "FAILED"
            _active_agent_state["last_updated"] = datetime.now(timezone.utc).isoformat()
            return {"status": "ERROR", "message": str(e)}
        finally:
            db.close()
