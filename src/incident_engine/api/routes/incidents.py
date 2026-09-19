from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from incident_engine.core.database import get_db
from incident_engine.core.models_db import IncidentDB
from incident_engine.agents.graph import graph

router = APIRouter()

@router.get("/incidents")
async def get_incidents(severity: Optional[str] = None, status: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(IncidentDB)
    if severity:
        query = query.filter(IncidentDB.severity == severity)
    if status:
        query = query.filter(IncidentDB.status == status)
        
    return query.limit(limit).all()

@router.get("/incidents/{id}")
async def get_incident(id: str, db: Session = Depends(get_db)):
    incident = db.query(IncidentDB).filter(IncidentDB.id == id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident

class RemediateRequest(BaseModel):
    action: str
    targetService: str
    parameters: dict

@router.post("/incidents/{id}/remediate")
async def remediate_incident(id: str, request: RemediateRequest, db: Session = Depends(get_db)):
    incident = db.query(IncidentDB).filter(IncidentDB.id == id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    return {
        "success": True,
        "incidentId": id,
        "status": "EXECUTING",
        "executedCommand": f"Mock execute {request.action} on {request.targetService}",
        "timestamp": "2026-09-18T11:40:02Z"
    }

class ApproveRequest(BaseModel):
    approvalStatus: str
    approver: str = "sre-lead@company.com"
    comments: str = ""

@router.post("/incidents/{id}/approve")
async def approve_incident(id: str, request: ApproveRequest, db: Session = Depends(get_db)):
    # Using incident id directly as the thread_id for LangGraph MemorySaver
    config = {"configurable": {"thread_id": id}}
    
    state = graph.get_state(config)
    if not state.next:
        raise HTTPException(status_code=400, detail="Graph is not awaiting approval.")
        
    graph.update_state(config, {"approved": request.approvalStatus == "APPROVED", "reviewer": request.approver, "note": request.comments}, as_node="human_approval")
    
    incident = db.query(IncidentDB).filter(IncidentDB.id == id).first()
    if incident and incident.decision:
        new_dec = dict(incident.decision)
        new_dec["approval_status"] = request.approvalStatus
        incident.decision = new_dec
        db.commit()
    
    return {
        "resumed": True,
        "incidentId": id,
        "nextStage": "EXECUTING" if request.approvalStatus == "APPROVED" else "ESCALATED",
    }
