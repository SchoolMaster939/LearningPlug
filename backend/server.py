import asyncio
import json
import logging
import sqlite3
import traceback
import uuid
from typing import Optional

import db
import storage
from pathlib import Path
from pydantic import BaseModel
from datetime import datetime
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from starlette.responses import StreamingResponse
from models import ModelConfig, Conversation, ChatRequest, ConfirmJudgeRequest
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from llm import get_llm, get_agent
from graphs.topic_judge_workflow import graph, JudgeState, judge_topic
from tool.filePath import ensure_dir


logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NodeTitleBody(BaseModel):
    title: str


class CreateSummaryRequest(BaseModel):
    node_id: str
    summary_id: str
    start_index: int
    end_index: int
    label: str = ""

class UpdateSummaryRequest(BaseModel):
    label: Optional[str] = None
    start_index: Optional[int] = None
    end_index: Optional[int] = None

class CreateArrowRequest(BaseModel):
    arrow_id: str
    label: str = ""
    from_node_id: str
    to_node_id: str
    bidirectional: bool = False
    delta1_x: float = 200
    delta1_y: float = 0
    delta2_x: float = 200
    delta2_y: float = 0
    relation_type: str = "related"

class UpdateArrowRequest(BaseModel):
    label: Optional[str] = None
    bidirectional: Optional[bool] = None
    delta1_x: Optional[float] = None
    delta1_y: Optional[float] = None
    delta2_x: Optional[float] = None
    delta2_y: Optional[float] = None
    relation_type: Optional[str] = None


""" 全部初始化 """
@app.on_event("startup")
def init_all():
    res = ensure_dir()
    if not res:
        logger.error("根目录初始化失败")
        return

    conversationPath = Path(res) / "conversations"
    conversationPath.mkdir(exist_ok=True, parents=True)

    TreeModeConversationPath = Path(res) / "TreeModeConversations"
    TreeModeConversationPath.mkdir(exist_ok=True, parents=True)

    configPath = Path(res) / "configs.json"
    DBPath = db.DB_PATH
    db.init_db()
    init_data = {"configs": [], "active_id": None, "Turns": 10, "ConfigAvailableDetection": True, "TreeModeAutoTopicRelevance": True, "SummaryTriggerThreshold": 10, "RecentKeepTurns": 3}
    if not configPath.exists():
        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(init_data, f, indent=2, ensure_ascii=False)
    else:
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
            for key in init_data:
                if key not in data:
                    data[key] = init_data[key]
            with open(configPath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            with open(configPath, "w", encoding="utf-8") as f:
                json.dump(init_data, f, indent=2, ensure_ascii=False)
    if not DBPath.exists():
        db.init_db()


""" 配置文件相关 """
@app.get("/configs")
def list_configs():
    datas = storage.load_all_configs()
    if datas is None:
        return
    for dict in datas:
        config = ModelConfig(**dict)
        try:
            res, msg = asyncio.run(storage.test_modelConfig(config))
            print(res, msg)
        except Exception as e:
            print(e)
    return storage.load_all_configs()

@app.post("/configs")
def create_config(config: ModelConfig):
    configs = storage.load_all_configs()
    if configs is not None:
        new_id = str(uuid.uuid4())

        new_config = config.model_dump()
        new_config["id"] = new_id
        configs.append(new_config)
        storage.save_all_configs(configs)

        return {"id": new_id, "config": new_config}

@app.delete("/configs/{config_id}")
def delete_config(config_id: str):
    configs = storage.load_all_configs()
    new_configs = [c for c in configs if c["id"] != config_id]
    if len(new_configs) == len(configs):
        raise HTTPException(status_code=404, detail="配置未找到")
    storage.save_all_configs(new_configs)

    active = storage.get_active_id()
    if active == config_id:
        storage.set_active_id("")
    return {"status": "deleted"}

@app.put("/configs/{config_id}")
def update_config(config_id: str, config: ModelConfig):
    configs = storage.load_all_configs()
    for idx, c in enumerate(configs):
        if c["id"] == config_id:
            updated = config.model_dump()
            updated["id"] = config_id
            configs[idx] = updated
            storage.save_all_configs(configs)
            return {"status": "updated"}
    raise HTTPException(status_code=404, detail="配置未找到")

@app.post("/configs/active/{config_id}")
def set_active_config(config_id: str):
    configs = storage.load_all_configs()
    if not any(c["id"] == config_id for c in configs):
        raise HTTPException(status_code=404, detail="配置未找到")
    storage.set_active_id(config_id)
    return {"status": "activated"}

@app.get("/configs/activeID")
def get_active_config():
    active_id = storage.get_active_id()
    return active_id


""" 单个会话管理相关 """
@app.get("/conversations")
def list_conversations():
    return storage.load_all_conversations()

@app.post("/conversations")
def create_conversation():
    conv = Conversation()
    storage.save_conversation(conv)
    return conv.model_dump()

@app.get("/conversations/{conv_id}")
def get_conversation(conv_id: str):
    conv = storage.get_conversations(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="该会话不存在")
    return conv

@app.delete("/conversations/{conv_id}")
def delete_conversation_api(conv_id: str):
    conv = storage.get_conversations(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="该会话不存在")
    storage.delete_conversation(conv_id)
    return


""" 对话相关 """
def run_topic_judge(active_config: ModelConfig, thread_id: str, user_input: str, current_node_id: str, assistant_msg: str):
    config = {"configurable": {"thread_id": thread_id}}
    initial_state: JudgeState = {
        "active_config": active_config,
        "user_input": user_input,
        "current_node_id": current_node_id,
        "parent_id": current_node_id,
        "suggested_title": None,
        "reason": None,
        "user_decision": "pending",
        "result_node_id": None,

        "assistant_msg": assistant_msg,

        "error": None
    }
    graph.invoke(initial_state, config)

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    try:
        if request.TreeMode:
            conv_data = await asyncio.to_thread(storage.get_conversations, request.conversation_id, True)
        else:
            conv_data = await asyncio.to_thread(storage.get_conversations, request.conversation_id)
        if not conv_data:
            raise HTTPException(status_code=404, detail="会话不存在")

        active_id = storage.get_active_id()
        if not active_id:
            raise HTTPException(status_code=400, detail="未选择配置模型")

        raw_messages = conv_data.get("messages", [])
        conversation_turns = storage.load_Turns()
        if conversation_turns == -1:
            selected_messages = raw_messages
        else:
            turns = max(1, request.conversation_turns)
            selected_messages = raw_messages[-(turns * 2):]

        configs = storage.load_all_configs()
        active_config = None

        for c in configs:
            if c["id"] == active_id:
                active_config = c
                break

        if not active_config:
            raise HTTPException(status_code=404, detail="激活的配置未找到，可能已经不存在")

        messages = []
        for msg in selected_messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                messages.append(SystemMessage(content=content))
            elif role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        messages.append(HumanMessage(content=request.prompt))

        try:
            llm = get_llm(ModelConfig(**active_config))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"未能初始化模型：{str(e)}")

        try:
            agent = get_agent(ModelConfig(**active_config), request.current_node_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"未能初始化智能体：{str(e)}")

        user_msg = {
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": request.prompt,
            "timestamp": datetime.now().isoformat()
        }
        conv_data["messages"].append(user_msg)
        conv_data["updated_at"] = datetime.now().isoformat()
        title_task = None
        if conv_data["title"] == "新对话":
            async def get_title():
                try:
                    title_messages = [
                        SystemMessage(content="返回的名字，名称，主题，title不超过10个字"),
                        HumanMessage(content=json.dumps(conv_data["messages"]) + "\n根据以上文本内容生成相关名称,返回一个结果的纯文本就行")
                    ]
                    title_resp = await asyncio.to_thread(llm.invoke, title_messages)
                    title = title_resp.content.strip()
                    if request.TreeMode:
                        latest_conv = await asyncio.to_thread(storage.get_conversations, request.conversation_id, True)
                    else:
                        latest_conv = await asyncio.to_thread(storage.get_conversations, request.conversation_id)
                    if latest_conv:
                        latest_conv["title"] = title
                        latest_conv["updated_at"] = datetime.now().isoformat()
                        if request.TreeMode:
                            await asyncio.to_thread(storage.update_conversation, request.conversation_id,
                                                    Conversation(**latest_conv), True)
                        else:
                            await asyncio.to_thread(storage.update_conversation, request.conversation_id, Conversation(**latest_conv))
                except Exception as err:
                    print("标题生成任务异常：", err)
            title_task = asyncio.create_task(get_title())
        if request.TreeMode:
            await asyncio.to_thread(storage.update_conversation, request.conversation_id, Conversation(**conv_data), True)
        else:
            await asyncio.to_thread(storage.update_conversation, request.conversation_id, Conversation(**conv_data))

        async def generate():
            full_response = ""
            try:

                judge_thread_id = None

                stream = agent.stream_events(
                    {"messages": messages},
                    version="v3"
                )
                for message in stream.messages:

                    msg_type = getattr(message, 'type', '')
                    print(msg_type)

                    if msg_type == 'tool':
                        tool_name = getattr(message, 'name', 'unknown')
                        tool_content = getattr(message, 'content', '')
                        if tool_name == 'generate_mermaid_diagram':
                            yield f"data: {json.dumps({'type': 'tool_result', 'tool_name': tool_name, 'result': tool_content, 'status': 'done'})}\n\n"
                        else:
                            yield f"data: {json.dumps({'type': 'tool_result', 'tool_name': tool_name, 'status': 'done'})}\n\n"
                        continue

                    if msg_type == 'ai':
                        tool_calls = getattr(message, 'tool_calls', None)
                        if tool_calls:
                            for tc in tool_calls:
                                if isinstance(tc, dict):
                                    name = tc.get('name', 'unknown')
                                    args = tc.get('args', {})
                                else:
                                    name = getattr(tc, 'name', 'unknown')
                                    args = getattr(tc, 'args', {})

                                yield f"data: {json.dumps({'type': 'tool_call', 'tool_name': name, 'args': args, 'status': 'running'})}\n\n"

                    for delta in message.text:
                        full_response += delta
                        yield f"data: {json.dumps({'content': delta, 'finish': False})}\n\n"""
                        await asyncio.sleep(0)

                if full_response:
                    assistant_msg = {
                        "id": str(uuid.uuid4()),
                        "role": "assistant",
                        "content": full_response,
                        "timestamp": datetime.now().isoformat()
                    }
                    if request.TreeMode:
                        latest_conv = await asyncio.to_thread(storage.get_conversations, request.conversation_id, True)
                    else:
                        latest_conv = await asyncio.to_thread(storage.get_conversations, request.conversation_id)
                    if latest_conv:
                        latest_conv["messages"].append(assistant_msg)
                        latest_conv["updated_at"] = datetime.now().isoformat()
                        if request.TreeMode:
                            await asyncio.to_thread(storage.update_conversation, request.conversation_id,
                                                    Conversation(**latest_conv), True)
                        else:
                            await asyncio.to_thread(storage.update_conversation, request.conversation_id, Conversation(**latest_conv))

                        unsummarized = len(latest_conv["messages"]) - latest_conv.get("summarized_until", 0)
                        if unsummarized >= storage.load_SummaryTriggerThreshold():
                            asyncio.create_task(storage.update_conversation_summary(request.conversation_id, request.TreeMode))

                TreeModeAutoTopicRelevance = storage.load_TreeModeAutoTopicRelevance()
                if request.current_node_id and TreeModeAutoTopicRelevance:
                    judge_thread_id = str(uuid.uuid4())
                    await asyncio.to_thread(
                        run_topic_judge,
                        active_config=active_config,
                        thread_id=judge_thread_id,
                        user_input=request.prompt,
                        current_node_id=request.current_node_id,
                        assistant_msg=full_response,
                    )
                    yield f"data: {json.dumps({'judge_thread_id': judge_thread_id, 'finish': False})}\n\n"

                yield f"data: {json.dumps({'content': '', 'finish': True})}\n\n"
            except Exception as e:
                error_msg = f"AI 服务错误: {str(e)}"
                yield f"data: {json.dumps({'content': error_msg, 'error': True})}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{e}")


""" 树状模式相关 """
@app.get("/TreeMode/judge/{thread_id}")
def get_judge_status(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    try:
        state = graph.get_state(config)
    except Exception:
        raise HTTPException(404, "判断任务不存在")

    if not state or not state.values:
        return {"status": "pending"}

    values = state.values

    if values.get("user_decision") == "pending":
        if not values.get("suggested_title"):
            return {"status": "no_new_topic"}
        return {
            "status": "waiting_confirmation",
            "thread_id": thread_id,
            "suggested_title": values.get("suggested_title", ""),
            "parent_id": values.get("parent_id"),
            "reason": values.get("reason", ""),
        }
    elif values.get("user_decision") == "confirm":
        return {
            "status": "finished",
            "node_id": values.get("result_node_id"),
            "error": values.get("error"),
        }
    else:
        return {"status": "rejected"}

@app.post("/TreeMode/judge/confirm")
def confirm_judge(req: ConfirmJudgeRequest):
    config = {"configurable": {"thread_id": req.thread_id}}
    state = graph.get_state(config)
    if not state or not state.values:
        raise HTTPException(404, "判断任务不存在")

    if state.values.get("user_decision") != "pending":
        raise HTTPException(400, "该任务已经处理过了")

    # 更新状态继续执行
    graph.update_state(
        config,
        {"user_decision": req.decision},
        as_node="judge",
    )
    # 触发执行
    final_state = graph.invoke(None, config)

    if req.decision == "confirm":
        if final_state.get("error"):
            return {"success": False, "error": final_state["error"]}
        return {"success": True, "node_id": final_state["result_node_id"]}
    else:
        return {"success": True, "message": "已忽略"}

@app.get("/TreeMode/roots")
def get_roots():
    try:
        conn = sqlite3.connect(db.DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        rows = cursor.execute("SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY sort_order").fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        logging.error(f"获取根节点失败: {e}")
        raise HTTPException(status_code=500, detail=f"数据库错误: {str(e)}")

@app.get("/TreeMode/children")
def get_children(parent_id: str):
    return db.get_children(parent_id)

@app.post("/TreeMode/parent")
def create_parent_node(title: str = "新节点"):
    conv = Conversation()
    storage.save_conversation(conv, TreeMode=True)
    node_id = db.create_node(
        title=title,
        node_type="qa",
        parent_id=None,
        conversation_id=conv.id
    )
    return node_id

@app.put("/TreeMode/node/{node_id}/title")
def update_node_title(node_id: str, body: NodeTitleBody):
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(404, "节点不存在")

    success = db.update_node_title(node_id, body.title)
    if not success:
        raise HTTPException(500, "更新失败，请重试")

    node_title = db.get_node(node_id)
    return

@app.post("/TreeMode/child")
def create_child_node(parent_id: str, title: str = "新节点"):
    conv = Conversation()
    storage.save_conversation(conv, TreeMode=True)
    node_id = db.create_node(
        title=title,
        node_type="qa",
        parent_id=parent_id,
        conversation_id=conv.id
    )
    return node_id

@app.delete("/TreeMode/DeleteNode")
def delete_node(NodeID: str):
    conv_id = db.get_conversation_id_by_node(NodeID)
    delete_all_node_conv(NodeID)
    if conv_id is not None:
        storage.delete_conversation(conv_id, TreeMode=True)
    db.delete_node(NodeID)

def delete_all_node_conv(NodeID: str):
    children = get_children(NodeID)
    if not children:
        return
    for child in children:
        child_id = child["id"]
        conv_id = db.get_conversation_id_by_node(child_id)
        if conv_id is not None:
            storage.delete_conversation(conv_id, TreeMode=True)
        delete_all_node_conv(child_id)

@app.post("/TreeMode/MoveNode")
def move_node(NodeID: str, new_parent_id: str):
    db.move_node(NodeID, new_parent_id)

@app.post("/TreeMode/SetRoot")
def set_root(NodeID: str):
    db.move_node(NodeID, None)

@app.get("/TreeMode/GetNodeData")
def get_node_data(NodeID: str):
    data = db.get_node(NodeID)
    return data

@app.post("/TreeMode/GetConversationId")
def get_conversationId_by_node(NodeID: str):
    conversationId = db.get_conversation_id_by_node(NodeID)
    return conversationId

@app.get("/TreeMode/GetConversation")
def get_conversation(NodeID: str):
    conversationId = db.get_conversation_id_by_node(NodeID)
    conversation = storage.get_conversations(conversationId, TreeMode=True)
    return conversation


# 摘要和箭头总加载
@app.get("/TreeMode/extras")
def get_tree_extras(root_id: str):
    conn = sqlite3.connect(db.DB_PATH)
    cursor = conn.cursor()
    rows = cursor.execute("""
        WITH RECURSIVE descendants AS (
            SELECT id FROM nodes WHERE id = ?
            UNION ALL
            SELECT n.id FROM nodes n
            INNER JOIN descendants d ON n.parent_id = d.id
        )
        SELECT id FROM descendants
    """, (root_id,)).fetchall()
    conn.close()
    node_ids = [r[0] for r in rows]

    summaries = db.get_summaries_by_node_ids(node_ids)
    arrows = db.get_arrows_by_node_ids(node_ids)
    return {"summaries": summaries, "arrows": arrows}


""" 摘要(summary)管理 """
@app.post("/TreeMode/summaries")
def create_nodes_summary(req: CreateSummaryRequest):
    summary_id = db.create_summary(req.node_id, req.summary_id, req.start_index, req.end_index, req.label)
    return {"id": summary_id}

@app.put("/TreeMode/summaries/{summary_id}")
def api_update_summary(summary_id: str, req: UpdateSummaryRequest):
    ok = db.update_summary(summary_id, req.label, req.start_index, req.end_index)
    if not ok:
        raise HTTPException(404, "摘要不存在或无更新字段")
    return {"success": True}

@app.delete("/TreeMode/summaries/{summary_id}")
def api_delete_summary(summary_id: str):
    db.delete_summary(summary_id)
    return {"success": True}

@app.get("/TreeMode/summaries/{summary_id}")
def api_get_summary(summary_id: str):
    """根据摘要ID获取完整摘要数据"""
    summary = db.get_summary_by_id(summary_id)
    if not summary:
        raise HTTPException(404, "摘要不存在")
    return summary


""" 箭头(arrow)管理 """
@app.post("/TreeMode/arrows")
def api_create_arrow(req: CreateArrowRequest):
    arrow_id = db.create_arrow(
        arrow_id=req.arrow_id,
        label=req.label, from_node_id=req.from_node_id, to_node_id=req.to_node_id,
        bidirectional=req.bidirectional, delta1_x=req.delta1_x, delta1_y=req.delta1_y,
        delta2_x=req.delta2_x, delta2_y=req.delta2_y, relation_type=req.relation_type,
    )
    return {"id": arrow_id}

@app.put("/TreeMode/arrows/{arrow_id}")
def api_update_arrow(arrow_id: str, req: UpdateArrowRequest):
    ok = db.update_arrow(arrow_id, **req.dict(exclude_unset=True))
    if not ok:
        raise HTTPException(404, "箭头不存在或无更新字段")
    return {"success": True}

@app.delete("/TreeMode/arrows/{arrow_id}")
def api_delete_arrow(arrow_id: str):
    db.delete_arrow(arrow_id)
    return {"success": True}

@app.get("/TreeMode/arrows/{arrow_id}")
def api_get_arrow(arrow_id: str):
    """根据箭头ID获取完整箭头数据"""
    arrow = db.get_arrow_by_id(arrow_id)
    if not arrow:
        raise HTTPException(404, "箭头不存在")
    return arrow


""" 消息管理 """
@app.delete("/Messages/delete")
def delete_message(conv_id: str, message_id: str, TreeMode: bool = False):
    try:
        storage.delete_message(conv_id, message_id, TreeMode)
        return message_id
    except Exception as e:
        return e


config0 = ModelConfig(
    id="0",
    name="test",
    provider="deepseek",
    api_key="sk-5bb97d50e8904bed9d26092da167bdf0",
    base_url="https://api.deepseek.com",
    model_name="deepseek-v4-pro",
    temperature=0.7,
    usability=None
)
