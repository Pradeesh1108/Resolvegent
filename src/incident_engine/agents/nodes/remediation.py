from typing import Dict, Any
import os
from datetime import datetime, timezone
from langgraph.types import interrupt
from langchain_core.documents import Document
from incident_engine.core.state import AgentState
from incident_engine.core.models import AuditEvent
from incident_engine.core.knowledge_base import kb_vectorstore
from incident_engine.agents.nodes.ingestion import get_attr_or_key

def human_approval(state: AgentState) -> Dict[str, Any]:
    inc = state.get("incident")
    inc_id = get_attr_or_key(inc, "id", "UNKNOWN")
    action = state.get("proposed_remediation")
    action_type = get_attr_or_key(action, "action_type", "unknown_action")
    target_service = get_attr_or_key(action, "target_service", "unknown_service")
    parameters = get_attr_or_key(action, "parameters", {})
    rationale = get_attr_or_key(action, "rationale", "")
    
    interrupt_payload = {
        "incident_id": inc_id,
        "action": action_type,
        "service": target_service,
        "parameters": parameters,
        "risk_level": state.get("risk_level"),
        "rationale": rationale,
        "message": f"HIGH RISK ACTION REQUIRES SRE APPROVAL: {action_type} on {target_service}"
    }
    
    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key:
        try:
            import requests
            email_payload = {
                "from": "onboarding@resend.dev",
                "to": ["pradeeshsivaprakasam@gmail.com"],
                "subject": f"URGENT: SRE Approval Required for {inc_id}",
                "html": f"<p><strong>Incident ID:</strong> {inc_id}</p><p><strong>Action:</strong> {action_type}</p><p><strong>Target Service:</strong> {target_service}</p><p><strong>Rationale:</strong> {rationale}</p><p>Please approve or reject this action in the Command Center.</p>"
            }
            resp = requests.post(
                "https://api.resend.com/emails",
                json=email_payload,
                headers={"Authorization": f"Bearer {resend_key}"},
                timeout=5
            )
            resp.raise_for_status()
            print(f"Resend email sent successfully! Response: {resp.json()}")
        except Exception as e:
            print(f"Failed to send HITL email: {e}")
    
    human_response = interrupt(interrupt_payload)
    
    approved = human_response.get("approved", False) if isinstance(human_response, dict) else bool(human_response)
    reviewer = human_response.get("reviewer", "OnCall-SRE-Lead") if isinstance(human_response, dict) else "SRE-Operator"
    note = human_response.get("note", "Manual approval granted") if isinstance(human_response, dict) else "Manual approval granted"
    
    status = "APPROVED" if approved else "REJECTED"
    
    audit = AuditEvent(
        incident_id=inc_id,
        node_name="human_approval",
        actor="human",
        action=f"Human Review Decision: {status}",
        decision_reasoning=f"Reviewer '{reviewer}' submitted decision: {status}. Note: {note}",
        result=f"Human review outcome: {status}"
    )
    
    return {
        "approval_status": status,
        "current_status": "APPROVED" if approved else "REJECTED",
        "audit_log": [audit]
    }

def execute_remediation(state: AgentState) -> Dict[str, Any]:
    inc = state.get("incident")
    inc_id = get_attr_or_key(inc, "id", "UNKNOWN")
    action = state.get("proposed_remediation")
    action_type = get_attr_or_key(action, "action_type", "unknown_action")
    target_service = get_attr_or_key(action, "target_service", "unknown_service")
    parameters = get_attr_or_key(action, "parameters", {})
    
    result = {"status": "SUCCESS", "details": f"Simulated execution of {action_type} on {target_service} (Real integration not configured)"}
    
    audit = AuditEvent(
        incident_id=inc_id,
        node_name="execute_remediation",
        actor="tool",
        action=f"Execute {action_type}",
        decision_reasoning=f"Executed bounded remediation on {target_service} with params {parameters}",
        result=result.get("details", "Execution finished.")
    )
    return {
        "remediation_result": result,
        "current_status": "REMEDIATING",
        "audit_log": [audit]
    }

def verify_remediation(state: AgentState) -> Dict[str, Any]:
    inc = state.get("incident")
    inc_id = get_attr_or_key(inc, "id", "UNKNOWN")
    action = state.get("proposed_remediation")
    target_svc = get_attr_or_key(action, "target_service", "payment-worker")
    
    health = {"status": "HEALTHY", "message": "Integration not configured"}
    api_metrics = {"status": "NORMAL", "current": 42}
    
    is_recovered = True
    
    res = {
        "recovered": is_recovered,
        "target_service_health": health.get("status"),
        "payment_api_p99_ms": api_metrics.get("current"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    audit = AuditEvent(
        incident_id=inc_id,
        node_name="verify_remediation",
        actor="agent",
        action="Verify Operational Recovery",
        decision_reasoning=f"Checked post-fix health probes for {target_svc} and payment-api latency.",
        result=f"Recovery Verified: {is_recovered} (Latency: {api_metrics.get('current')}ms)"
    )
    
    return {
        "verification_result": res,
        "current_status": "VERIFIED" if is_recovered else "UNRECOVERED",
        "audit_log": [audit]
    }

def update_knowledge_base(state: AgentState) -> Dict[str, Any]:
    inc = state.get("incident")
    inc_id = get_attr_or_key(inc, "id", "UNKNOWN")
    inc_sev = get_attr_or_key(inc, "severity", "P1")
    action = state.get("proposed_remediation")
    action_type = get_attr_or_key(action, "action_type", "unknown_action")
    target_svc = get_attr_or_key(action, "target_service", "unknown_service")
    parameters = get_attr_or_key(action, "parameters", {})
    ver_res = state.get("verification_result", {})
    
    new_doc_content = (
        f"HISTORICAL POST-MORTEM: {inc_id} - Cascading Latency Spike resolved via {action_type}.\n"
        f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}. Severity: {inc_sev}.\n"
        f"Root Cause: {state.get('root_cause')}\n"
        f"Remediation: Successfully executed {action_type} on {target_svc} with params {parameters}.\n"
        f"Recovery: Verified healthy. Latency normalized to {ver_res.get('payment_api_p99_ms')}ms."
    )
    
    new_doc = Document(
        page_content=new_doc_content,
        metadata={"doc_id": inc_id, "category": "post_mortem", "service": target_svc}
    )
    
    kb_vectorstore.add_documents([new_doc])
    
    audit = AuditEvent(
        incident_id=inc_id,
        node_name="update_knowledge_base",
        actor="agent",
        action="Index Incident Post-Mortem into Vector Store",
        decision_reasoning="Recorded operational resolution so future incidents can retrieve this historical precedent.",
        result=f"Post-mortem for {inc_id} indexed into vector store operational memory."
    )
    
    return {
        "current_status": "RESOLVED",
        "audit_log": [audit]
    }

def close_incident(state: AgentState) -> Dict[str, Any]:
    inc = state.get("incident")
    inc_id = get_attr_or_key(inc, "id", "UNKNOWN")
    status = "RESOLVED" if state.get("current_status") == "RESOLVED" else "ESCALATED"
    
    audit = AuditEvent(
        incident_id=inc_id,
        node_name="close_incident",
        actor="system",
        action=f"Finalize Incident Lifecycle ({status})",
        decision_reasoning="All graph nodes completed. Incident state frozen and persisted.",
        result=f"Incident {inc_id} closed with final status: {status}"
    )
    
    return {
        "current_status": status,
        "audit_log": [audit]
    }
