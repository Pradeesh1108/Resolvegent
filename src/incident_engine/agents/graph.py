from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from incident_engine.core.state import AgentState
from incident_engine.core.config import config
from incident_engine.agents.nodes.ingestion import detect_trigger, correlate_alerts
from incident_engine.agents.nodes.investigation import retrieve_context, investigate, execute_investigation_tool
from incident_engine.agents.nodes.decision import decide_root_cause, decide_remediation
from incident_engine.agents.nodes.remediation import human_approval, execute_remediation, verify_remediation, update_knowledge_base, close_incident

def route_investigation(state: AgentState) -> str:
    """Determines whether to execute next investigation tool or conclude."""
    action = state.get("next_step_action")
    steps = state.get("investigation_steps", [])
    if action == "continue_investigation" and len(steps) < config.MAX_INVESTIGATION_STEPS:
        return "execute_investigation_tool"
    return "decide_root_cause"

def route_remediation_policy(state: AgentState) -> str:
    """Enforces policy: High-risk actions require human approval, regardless of auto_remediate flag."""
    if state.get("approval_required", True):
        return "human_approval"
    if state.get("auto_remediate", False):
        return "execute_remediation"
    return "human_approval"

def route_approval(state: AgentState) -> str:
    """Routes based on human reviewer sign-off."""
    if state.get("approval_status") == "APPROVED":
        return "execute_remediation"
    return "close_incident"

def route_verification(state: AgentState) -> str:
    """Routes based on post-fix verification."""
    ver = state.get("verification_result", {})
    if ver.get("recovered", False):
        return "update_knowledge_base"
    return "close_incident"

# Build the LangGraph State Machine
builder = StateGraph(AgentState)

# Add all nodes
builder.add_node("detect_trigger", detect_trigger)
builder.add_node("correlate_alerts", correlate_alerts)
builder.add_node("retrieve_context", retrieve_context)
builder.add_node("investigate", investigate)
builder.add_node("execute_investigation_tool", execute_investigation_tool)
builder.add_node("decide_root_cause", decide_root_cause)
builder.add_node("decide_remediation", decide_remediation)
builder.add_node("human_approval", human_approval)
builder.add_node("execute_remediation", execute_remediation)
builder.add_node("verify_remediation", verify_remediation)
builder.add_node("update_knowledge_base", update_knowledge_base)
builder.add_node("close_incident", close_incident)

# Edges: Ingestion & Correlation & Context
builder.add_edge(START, "detect_trigger")
builder.add_edge("detect_trigger", "correlate_alerts")
builder.add_edge("correlate_alerts", "retrieve_context")
builder.add_edge("retrieve_context", "investigate")

# Conditional Edge: Investigation Loop
builder.add_conditional_edges(
    "investigate",
    route_investigation,
    {
        "execute_investigation_tool": "execute_investigation_tool",
        "decide_root_cause": "decide_root_cause"
    }
)
# Loop back from tool execution to investigate node
builder.add_edge("execute_investigation_tool", "investigate")

# Edges: Root Cause & Remediation Decision
builder.add_edge("decide_root_cause", "decide_remediation")

# Conditional Edge: Policy & Risk Check
builder.add_conditional_edges(
    "decide_remediation",
    route_remediation_policy,
    {
        "human_approval": "human_approval",
        "execute_remediation": "execute_remediation"
    }
)

# Conditional Edge: Human Sign-Off
builder.add_conditional_edges(
    "human_approval",
    route_approval,
    {
        "execute_remediation": "execute_remediation",
        "close_incident": "close_incident"
    }
)

# Edges: Execution & Verification
builder.add_edge("execute_remediation", "verify_remediation")

# Conditional Edge: Verification Result
builder.add_conditional_edges(
    "verify_remediation",
    route_verification,
    {
        "update_knowledge_base": "update_knowledge_base",
        "close_incident": "close_incident"
    }
)

# Edges: Knowledge Update & Closure
builder.add_edge("update_knowledge_base", "close_incident")
builder.add_edge("close_incident", END)

# Compile graph with MemorySaver checkpointer
memory = MemorySaver()
graph = builder.compile(checkpointer=memory)
