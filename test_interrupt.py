import os
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["GROQ_API_KEY"] = "gsk_lF0Mh12g9hJ014jH93lJ0lJ0" # dummy
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langgraph.checkpoint.memory import MemorySaver

class State(TypedDict):
    val: str

def node1(state: State):
    return {"val": "1"}

def node_interrupt(state: State):
    interrupt("Please approve")
    return {"val": "approved"}

builder = StateGraph(State)
builder.add_node("n1", node1)
builder.add_node("n2", node_interrupt)
builder.add_edge(START, "n1")
builder.add_edge("n1", "n2")
builder.add_edge("n2", END)

checkpointer = MemorySaver()
graph = builder.compile(checkpointer=checkpointer)

config = {"configurable": {"thread_id": "test_id"}}

for event in graph.stream({"val": "init"}, config):
    pass

state = graph.get_state(config)
print("After stream completes (interrupted):")
print(f"next: {state.next}")

print("Calling stream again with None...")
for event in graph.stream(None, config):
    print(event)

state = graph.get_state(config)
print("After second stream:")
print(f"next: {state.next}")

