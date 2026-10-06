import json
from pathlib import Path
from typing import Optional
from backend.tool.filePath import ensure_dir
from backend.db import get_ancestor_nodes, get_node, get_conversation_id_by_node
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.tools import StructuredTool


def web_search_sync(query: str, max_results: Optional[int] = 5):
    """
    在互联网上搜索信息。
    Args:
        query: 搜索关键词
        max_results: 返回结果数量，默认5条
    Returns:
        搜索结果的摘要信息
    """
    try:
        search = DuckDuckGoSearchRun()
        result = search.invoke(query)
        return result
    except Exception as e:
        return f"搜索失败: {str(e)}"

async def web_search_async(query: str, max_results: Optional[int] = 5):
    """
    在互联网上搜索信息。
    Args:
        query: 搜索关键词
        max_results: 返回结果数量，默认5条
    Returns:
        搜索结果的摘要信息
    """
    try:
        search = DuckDuckGoSearchRun()
        result = await search.ainvoke(query)
        return result
    except Exception as e:
        return f"搜索失败: {str(e)}"

def get_path(node_id: str):
    """
    获取从根节点到该节点的路径列表
    Args:
        node_id: 当前节点的id

    Returns:
        从根节点到该节点的路径列表，包括名称和节点id
    """
    try:
        nodes = get_ancestor_nodes(node_id)
        path = []
        for node in nodes:
            res = {
                'title': node['title'],
                'id': node['id']
            }
            path.append(res)
        return path
    except Exception as e:
        return f"获取从根节点到该节点的路径列表失败: {str(e)}"

def get_node_content(node_id: str):
    """
    需要获取节点信息时优先调用该函数

    获取该节点的分层信息：
    - 元信息（标题、路径、深度）
    - 会话摘要（自动生成，1~2句话）
    - 最近 3 轮原文

    如需完整历史，请调用get_node_full_content(node_id)

    Args:
        node_id: 节点的id

    Returns:
        元信息（标题、路径、深度）
        会话摘要（自动生成，1~2句话）
        最近 3 轮原文
    """

    try:
        node_content = get_node(node_id)
        conv_id = get_conversation_id_by_node(node_id)
        res = ensure_dir()
        if res is None:
            return None
        file_path = Path(res) / "TreeModeConversations" / f"{conv_id}.json"
        with open(file_path, "r", encoding="utf-8") as f:
            conv_content = json.load(f)
        messages = conv_content.get("messages", [])
        total_turns = sum(1 for m in messages if m.get("role") == "user")

        summary = conv_content.get("summary", "")
        if not summary and total_turns > 5:
            # 注意：摘要应异步生成并缓存，不要在这里同步生成
            summary = "(摘要未生成)"
        return {
            "node": {
                "id": node_content["id"],
                "title": node_content["title"],
                "depth": node_content.get("depth"),
            },
            "total_turns": total_turns,
            "summary": summary,
            "recent_messages": messages[-6:] if total_turns > 3 else messages,
            "hint": "如需更多历史，请调用 get_node_full_history",
        }
    except Exception as e:
        return f"获取该节点的节点内容失败: {str(e)}"

def get_node_full_content(node_id: str):
    """
    如果get_node_content(node_id)返回信息不足，可以调用该函数

    获取该节点id下完整的节点会话内容
    Args:
        node_id: 节点的id

    Returns:
        该节点的全部节点会话内容

    """
    try:
        node_content = get_node(node_id)
        conv_id = get_conversation_id_by_node(node_id)
        res = ensure_dir()
        if res is None:
            return None
        file_path = Path(res) / "TreeModeConversations" / f"{conv_id}.json"
        with open(file_path, "r", encoding="utf-8") as f:
            conv_content = json.load(f)
        content = [node_content, conv_content]
        return content
    except Exception as e:
        return f"获取该节点的节点内容失败: {str(e)}"


web_search = StructuredTool.from_function(
    func=web_search_sync,
    coroutine=web_search_async,
    name="web_search",
    description="在互联网上搜索信息。"
)

tools = [web_search, get_path, get_node_content, get_node_full_content]

