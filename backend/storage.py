import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
from langchain_core.messages import HumanMessage
from backend.llm import get_llm
from backend.models import ModelConfig, Conversation, Message
from backend.tool.filePath import ensure_dir

logger = logging.getLogger(__name__)

async def test_modelConfig(config: ModelConfig):
    ConfigAvailableDetect = load_ConfigAvailableDetect()
    if ConfigAvailableDetect is None:
        return
    if ConfigAvailableDetect is False:
        return
    if config.usability is True:
        return True, "已经测试成功"
    else:
        try:
            llm = get_llm(config)
            response = await asyncio.wait_for(
                llm.ainvoke([HumanMessage(content="This is just a link test, please reply briefly if received")]),
                timeout=10.0
            )
            set_usability(config.id)
            return True, "测试成功"
        except Exception as e:
            error_msg = str(e)
            if "AuthenticationError" in error_msg or "Incorrect API key" in error_msg:
                set_usability(config.id, False)
                return False, "API Key 无效，请检查"
            elif "APIConnectionError" in error_msg:
                set_usability(config.id, False)
                return False, "无法连接到 Base URL，请检查地址"
            elif "NotFoundError" in error_msg:
                set_usability(config.id, False)
                return False, "模型名称不存在，请检查"
            set_usability(config.id, False)
            return False, f"连接失败: {error_msg[:50]}"

def set_usability(config_id: str, usability=True):
    configs = load_all_configs()
    if configs is None:
        logger.warning("无法加载配置列表，无法更新 usability")
        return

    updated = False
    for c in configs:
        if c.get("id") == config_id:
            c["usability"] = usability
            updated = True
            break

    if updated:
        save_all_configs(configs)
        logger.info(f"配置 {config_id} 的 usability 已设为 True")
    else:
        logger.warning(f"未找到 id 为 {config_id} 的配置，usability 更新失败")

# ConfigAvailableDetect 测试配置文件
def load_ConfigAvailableDetect() -> bool | None:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("ConfigAvailableDetection")
        except Exception as e:
            logger.exception("读取配置文件失败，json文件要么不存在要么损坏")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def ConfigAvailableDetect_switch(switch: bool):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["ConfigAvailableDetection"] = switch
        else:
            data = {"configs": []}

        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# TreeModeAutoTopicRelevance 话题推断
def load_TreeModeAutoTopicRelevance() -> bool | None:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("TreeModeAutoTopicRelevance")
        except Exception as e:
            logger.exception("读取配置文件失败，json文件要么不存在要么损坏")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def TreeModeAutoTopicRelevance_switch(switch: bool):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["TreeModeAutoTopicRelevance"] = switch
        else:
            data = {"configs": []}

        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# Turns 对话轮数
def load_Turns() -> Optional[int]:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("Turns")
        except Exception as e:
            logger.exception(f"读取配置文件失败，json文件要么不存在要么损坏{e}")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def updateTurns(turns: int):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["Turns"] = turns
        else:
            data = {"configs": []}

        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# SummaryTriggerThreshold 摘要触发数
def load_SummaryTriggerThreshold() -> Optional[int]:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("SummaryTriggerThreshold")
        except Exception as e:
            logger.exception(f"读取配置文件失败，json文件要么不存在要么损坏{e}")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def updateSummaryTriggerThreshold(value: int):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["SummaryTriggerThreshold"] = value
        else:
            data = {"configs": []}

        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# RecentKeepTurns 保留该数不摘要
def load_RecentKeepTurns() -> Optional[int]:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("RecentKeepTurns")
        except Exception as e:
            logger.exception(f"读取配置文件失败，json文件要么不存在要么损坏{e}")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def updateRecentKeepTurns(value: int):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["RecentKeepTurns"] = value
        else:
            data = {"configs": []}

        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# 配置文件
def load_all_configs() -> List[dict] | None:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        try:
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("configs", [])
        except Exception as e:
            logger.exception("读取配置文件失败，json文件要么不存在要么损坏")
            return None
    else:
        logger.error("无法读取到保存路径")
        return None

def save_all_configs(configs: List[dict]):
    res = ensure_dir()
    current = {}
    if res is not None:
        configPath = Path(res) / "configs.json"
        with open(configPath, "r", encoding="utf-8") as f:
            current = json.load(f)
    active_id = current.get("active_id")
    ConfigAvailableDetection = current.get("ConfigAvailableDetection")

    with open(configPath, "w", encoding="utf-8") as f:
        json.dump({"configs": configs, "active_id": active_id, "ConfigAvailableDetection": ConfigAvailableDetection}, f, indent=2, ensure_ascii=False)

def get_active_id() -> Optional[str]:
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("active_id")
        return None
    return None

def set_active_id(config_id: str):
    res = ensure_dir()
    if res:
        configPath = Path(res) / "configs.json"
        if configPath.exists():
            with open(configPath, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {"configs": []}
        data["active_id"] = config_id
        with open(configPath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

# 会话
def load_all_conversations() -> Optional[List[Dict]]:
    res = ensure_dir()
    convs = []
    if res is not None:
        conversationPath = Path(res) / "conversations"
        for file_path in conversationPath.glob("*.json"):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    convs.append(json.load(f))
            except (json.JSONDecodeError, IOError):
                continue
        convs.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return convs
    else:
        logger.error("无法读取到保存路径")
        return None

def get_conversations(conv_id: str, TreeMode: bool = False) -> Optional[Dict]:
    res = ensure_dir()
    if res is None:
        return None
    if TreeMode:
        file_path = Path(res) / "TreeModeConversations" / f"{conv_id}.json"
    else:
        file_path = Path(res) / "conversations" / f"{conv_id}.json"
    if not file_path.exists():
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_conversation(conv: Conversation, TreeMode: bool = False):
    res = ensure_dir()
    if res is None:
        return
    if TreeMode:
        conversationsPath = Path(res) / "TreeModeConversations"
    else:
        conversationsPath = Path(res) / "conversations"

    file_path = conversationsPath / f"{conv.id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(conv.model_dump(), f, indent=2, ensure_ascii=False)

def delete_conversation(conv_id: str, TreeMode: bool = False):
    res = ensure_dir()
    if res is None:
        return
    if TreeMode:
        conversationsPath = Path(res) / "TreeModeConversations" / f"{conv_id}.json"
    else:
        conversationsPath = Path(res) / "conversations" / f"{conv_id}.json"
    conversationsPath.unlink()

def update_conversation(conv_id: str, update_data: Conversation, TreeMode: bool = False):
    update_data.id = conv_id
    save_conversation(update_data, TreeMode)

async def update_conversation_summary(conv_id: str, TreeMode: bool = False):
    RECENT_KEEP_TURNS = load_RecentKeepTurns()

    try:
        conv_data = await asyncio.to_thread(get_conversations, conv_id, TreeMode)
        if not conv_data:
            return None

        messages = conv_data.get("messages", [])
        summarized_until = conv_data.get("summarized_until", 0)
        old_summary = conv_data.get("summary", "")

        safe_limit = max(0, len(messages) - RECENT_KEEP_TURNS * 2)

        if summarized_until >= safe_limit:
            return None

        new_messages = messages[summarized_until:safe_limit]
        if not new_messages:
            return None

        new_text = "\n".join([
            f"{m['role']}: {m['content'][:300]}"
            for m in new_messages
        ])

        configs = load_all_configs()
        active_id = get_active_id()

        for c in configs:
            if c["id"] == active_id:
                active_config = c
                break

        if not active_config:
            return None

        llm = get_llm(ModelConfig(**active_config))

        if not llm:
            return None

        if old_summary:
            prompt = f"""以下是之前的对话摘要：              
            {old_summary}       
            以下是新增的对话内容：
            {new_text}        
            请将以上内容合并生成一个新的摘要，要求：
            1. 保留用户的核心问题和关键理解
            2. 保留 AI 给出的重要结论
            3. 保留用户表现出的困惑或偏好
            4. 不超过 200 字
            5. 只返回摘要文本，不要其他解释"""
        else:
            prompt = f"""请将以下对话压缩成简洁的摘要：
            {new_text}
            要求：
            1. 提炼用户的核心问题和关键理解
            2. 保留 AI 给出的重要结论
            3. 不超过 200 字
            4. 只返回摘要文本，不要其他解释"""
        from langchain_core.messages import HumanMessage
        resp = await asyncio.to_thread(llm.invoke, [HumanMessage(content=prompt)])
        new_summary = resp.content.strip()

        conv_data["summary"] = new_summary
        conv_data["summarized_until"] = safe_limit
        conv_data["summary_updated_at"] = datetime.now().isoformat()

        await asyncio.to_thread(
            update_conversation, conv_id, Conversation(**conv_data), TreeMode
        )

        print(f"[Summary] {conv_id} 摘要已更新，覆盖至消息 {safe_limit}")

    except Exception as e:
        print(f"[Summary] 生成失败: {e}")


# 消息
def delete_message(conv_id: str, message_id: str, TreeMode: bool = False):
    res = ensure_dir()
    update_messages = []
    if res is None:
        return None
    conversation = get_conversations(conv_id, TreeMode)
    messages = conversation['messages']
    for message in messages:
        if message['id'] == message_id:
            continue
        update_messages.append(message)

    conversation['messages'] = update_messages
    update_conversation(conv_id, Conversation(**conversation), TreeMode)

def get_message(conv_id: str, message_id: str, TreeMode: bool = False) -> Optional[dict]:
    res = ensure_dir()
    if res is None:
        return None
    conversation = get_conversations(conv_id, TreeMode)
    messages = conversation['messages']
    for message in messages:
        if message['id'] == message_id:
            return message
    return None

def insert_message(conv_id: str, content: str, role: str, TreeMode: bool = False):
    res = ensure_dir()
    if res is None:
        return None
    conversation = get_conversations(conv_id, TreeMode)
    if conversation is None:
        print("conversation is None")
        return None
    msg = {
        "id": str(uuid.uuid4()),
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat()
    }
    conversation["messages"].append(msg)
    update_conversation(conv_id, Conversation(**conversation), TreeMode)

