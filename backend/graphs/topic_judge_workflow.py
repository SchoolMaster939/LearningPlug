import json
from typing import TypedDict, Literal, Optional
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage
from backend.redis_checkpointer import checkpointer
from backend.db import create_node, get_node, get_conversation_id_by_node, get_ancestor_nodes
from backend.llm import get_llm
from backend.storage import save_conversation, insert_message, get_conversations
from backend.models import ModelConfig, Conversation

class JudgeState(TypedDict):
    active_config: ModelConfig
    user_input: str
    current_node_id: str
    parent_id: str
    suggested_title: Optional[str]
    reason: Optional[str]
    user_decision: Literal["pending", "confirm", "reject", "ignored"]
    result_node_id: Optional[str]

    assistant_msg: Optional[str]

    error: Optional[str]

def judge_topic(state: JudgeState) -> JudgeState:
    ancestors_nodes = get_ancestor_nodes(state['current_node_id'])
    ancestors = []

    for ancestor in ancestors_nodes:
        ancestors.append(ancestor['title'])

    node = get_node(state['current_node_id'])
    print(node)
    if ancestors:
        path_str = ">".join(ancestors + [node['title']])
    else:
        conv_id = get_conversation_id_by_node(node['id'])
        conv = get_conversations(conv_id, True)
        if conv['title'] == '新对话':
            path_str = '根节点'
        else:
            path_str = conv['title']
    print(path_str)
    prompt = f"""
    你是学习助手，用户在路径 {path_str} 下提问：
    {state["user_input"]}
    
    请判断该问题是否属于一个新主题（与当前知识点关联度低）。
    如果是，返回建议标题和理由；否则 suggested_title 留空。
    如果该问题与上一话题（父节点的话题）相关高，则relationship输出parent，如果与目前话题（子节点话题）相关高，则relationship输出son, 如果没有与任何相关则输出new
    输出 JSON：{{"suggested_title": "...", "relationship": "...", "reason": "..."}}
    
    注意，如果路径直接显示根节点，说明用户只是在一个自己创建的新跟节点下提问，当作关联度高处理
    """
    config = ModelConfig(**state['active_config'])
    llm = get_llm(config)
    resp = llm.invoke([SystemMessage(content=prompt)])

    try:
        data = json.loads(resp.content)
        print(data)
        state["suggested_title"] = data.get("suggested_title", "")
        if data.get("relationship", "") == "parent":
            state["parent_id"] = node['parent_id']
        elif data.get("relationship", "") == "son":
            state["parent_id"] = node["id"]
        elif data.get("relationship", "") == "new":
            state["parent_id"] = None
        state["reason"] = data.get("reason", "")
    except:
        state["suggested_title"] = ""
        state["reason"] = "解析失败"
    state["user_decision"] = "pending"
    return state

def execute_node(state: JudgeState) -> JudgeState:
    if state['user_decision'] != "confirm":
        state['error'] = '未确认'
        return state

    try:
        conv = Conversation()
        node_id = create_node(
            title=state['suggested_title'],
            node_type='syllabus',
            parent_id=state['parent_id'],
            conversation_id=conv.id
        )
        save_conversation(conv, True)
        insert_message(conv.id, content=state['user_input'], role="user", TreeMode=True)
        insert_message(conv.id, content=state['assistant_msg'], role="assistant", TreeMode=True)
        state['result_node_id'] = node_id
    except Exception as e:
        state['error'] = str(e)

    return state

def reject_node(state: JudgeState) -> JudgeState:
    state['result_node_id'] = None
    return state


builder = StateGraph(JudgeState)
builder.add_node("judge", judge_topic)
builder.add_node("execute", execute_node)
builder.add_node("reject", reject_node)
builder.set_entry_point("judge")

def route_after_judge(state: JudgeState) -> Literal["execute", "reject", END]:
    if state["user_decision"] == "confirm":
        return "execute"
    elif state["user_decision"] == "reject":
        return "reject"
    else:
        return END


builder.add_conditional_edges("judge", route_after_judge)
builder.add_edge("execute", END)
builder.add_edge("reject", END)


graph = builder.compile(checkpointer=checkpointer)