
let baseUrlPromise: Promise<string>;

export interface Config {
  id: string;               
  name: string;
  provider: string;
  api_key: string | null;  
  base_url: string | null;
  model_name: string | null;
  temperature: number;      
}

export interface TreeNode {
  title: string;
  id: string;
  node_type: 'syllabus' | 'qa';
  parent_id: string | null;
  depth: number;
  sort_order: number;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SummaryData {
    id: string;
    node_id: string;
    start_index: number;
    end_index: number;
    label: string;
    created_at: string;
    updated_at: string;
}

export interface ArrowData {
    id: string;
    label: string;
    from_node_id: string;
    to_node_id: string;
    bidirectional: boolean;
    delta1_x: number;
    delta1_y: number;
    delta2_x: number;
    delta2_y: number;
    relation_type: string;
    created_at: string;
    updated_at: string;
}

if ((window as any).pywebview?.api) {
  baseUrlPromise = window.pywebview.api.get_base_url();
} else {
  baseUrlPromise = new Promise((resolve) => {
    window.addEventListener("pywebviewready", async () => {
      const url = await window.pywebview.api.get_base_url();
      resolve(url);
    }, { once: true });
  });
}


// 配置相关
export async function getConfigs() {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/configs`);
  return res.json();
}

export async function createConfig(config: Config) {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/configs`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    })
    if (!res.ok) {
      let errorData = `请求失败(${res.status})`
        throw new Error(errorData);
    }
    return res.json();
}

export async function deleteConfig(id: string) {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/configs/${id}`, {
    method: 'DELETE'
  })
  return res.json();
}

export async function updateConfig(id: string, config: Config) {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/configs/${id}`, {
    method: "PUT",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!res.ok) {
      let errorData = `请求失败(${res.status})`
        throw new Error(errorData);
    }
    return res.json();
}

export async function setActiveConfig(id: string) {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/configs/active/${id}`, {
        method: 'POST'
    });
    return res.json();
}

export async function getActiveConfig(): Promise<string> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/configs/activeID`);
    return res.json();
}

// （单个）会话相关
export async function getConversations() {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/conversations`)
  if (!res.ok) throw new Error('获取会话列表失败');
  return res.json()
}

export async function getConversation(conv_id: string) {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/conversations/${conv_id}`)
  if (!res.ok) throw new Error('获取会话详情失败');
  return res.json()
}

export async function createConversation() {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/conversations`,{
      method: "POST"
  })
  if (!res.ok) throw new Error('创建会话失败');
  return res.json()
}

export async function deleteConversation(conv_id: string) {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/conversations/${conv_id}`, {
    method: "DELETE"
  })
  if (!res.ok) throw new Error('删除会话失败');
  return res.json()
}


// 对话
export async function streamChat(prompt: string, conversationId: string, TreeMode: boolean = false, currentNodeId: string | null = null): Promise<Response> {
  const BASE_URL = await baseUrlPromise;  
  const res = await fetch(`${BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt, 
          conversation_id: conversationId, 
          TreeMode: TreeMode,
          current_node_id: currentNodeId
        }),
    });
  return res
}

export async function confirmJudge(threadId: string, decision: 'confirm' | 'reject') {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/judge/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, decision }),
    });
    if (!res.ok) throw new Error(`确认失败 (${res.status})`);
    return res.json();
}

export async function getJudgeStatus(threadId: string) {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/judge/${threadId}`);
    if (!res.ok) throw new Error(`查询判断失败 (${res.status})`);
    return res.json();
}

// 树状图会话相关
export async function getRoots(): Promise<TreeNode[]> {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/TreeMode/roots`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`获取根节点失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function getChildren(parentId: string): Promise<TreeNode[]> {
  const BASE_URL = await baseUrlPromise;
  const params = new URLSearchParams({ parent_id: parentId });
  const res = await fetch(`${BASE_URL}/TreeMode/children?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`获取子节点失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function createParentNode(title: string = "新节点"): Promise<string> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/parent`;
  const params = new URLSearchParams({ title });
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`创建父节点失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function createChildNode(parentId: string, title: string = "新节点"): Promise<string> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/child`;
  const params = new URLSearchParams({ parent_id: parentId, title });
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`创建子节点失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function deleteNode(nodeId: string): Promise<void> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/DeleteNode`;
  const params = new URLSearchParams({ NodeID: nodeId });
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`删除节点失败 (${res.status}): ${errorText}`);
  }
  // 无返回内容，直接成功
}

export async function moveNode(nodeId: string, newParentId: string): Promise<void> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/MoveNode`;
  const params = new URLSearchParams({ NodeID: nodeId, new_parent_id: newParentId });
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`移动节点失败 (${res.status}): ${errorText}`);
  }
}

export async function updateNodeTitle(nodeId: string, title: string): Promise<void> {
  const BASE_URL = await baseUrlPromise;
  const res = await fetch(`${BASE_URL}/TreeMode/node/${nodeId}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`更新标题失败 (${res.status}): ${errorText}`);
  }
}

export async function setRootNode(nodeId: string): Promise<void> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/SetRoot`;
  const params = new URLSearchParams({ NodeID: nodeId })
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`设为根节点失败 (${res.status}): ${errorText}`);
  }
}

export async function getNodeData(nodeId: string): Promise<TreeNode> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/GetNodeData`;
  const params = new URLSearchParams({ NodeID: nodeId })
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`获取子节点数据失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function getConversationIdByNode(nodeId: string): Promise<string> {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/GetConversationId`;
  const params = new URLSearchParams({ NodeID: nodeId })
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`通过节点获取会话ID失败 (${res.status}): ${errorText}`);
  }
  return res.json();
}

export async function TreeModeGetConversation(nodeId: string) {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/TreeMode/GetConversation`;
  const params = new URLSearchParams({ NodeID: nodeId })
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`获取节点会话失败 (${res.status}): ${errorText}`);
  }
  return res.json()
}

// 获取摘要(summary)箭头(arrow)
export async function getTreeExtras(rootId: string): Promise<{
    summaries: any[]; arrows: any[];
}> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/extras?root_id=${rootId}`);
    if (!res.ok) throw new Error(`获取扩展数据失败 (${res.status})`);
    return res.json();
}

// 摘要(summary)管理
export async function createSummary(data: {
    node_id: string;
    summary_id: string;
    start_index: number;
    end_index: number;
    label: string;
}): Promise<string> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/summaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`创建概要失败 (${res.status})`);
    return (await res.json()).id;
}

export async function updateSummary(id: string, data: {
    label?: string; start_index?: number; end_index?: number;
}): Promise<void> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/summaries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`更新概要失败 (${res.status})`);
}

export async function deleteSummary(id: string): Promise<void> {
    const BASE_URL = await baseUrlPromise;
    await fetch(`${BASE_URL}/TreeMode/summaries/${id}`, { method: 'DELETE' });
}

export async function getSummaryById(summaryId: string): Promise<SummaryData> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/summaries/${summaryId}`);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`获取摘要失败 (${res.status}): ${errorText}`);
    }
    return res.json();
}

// 箭头(arrow)管理
export async function createArrow(data: {
    arrow_id: string; 
    label: string; 
    from_node_id: string; to_node_id: string;
    bidirectional: boolean;
    delta1_x?: number; delta1_y?: number;
    delta2_x?: number; delta2_y?: number;
    relation_type?: string;
}): Promise<string> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/arrows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`创建连线失败 (${res.status})`);
    return (await res.json()).id;
}

export async function updateArrow(id: string, data: any): Promise<void> {
    const BASE_URL = await baseUrlPromise;
    await fetch(`${BASE_URL}/TreeMode/arrows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

export async function deleteArrow(id: string): Promise<void> {
    const BASE_URL = await baseUrlPromise;
    await fetch(`${BASE_URL}/TreeMode/arrows/${id}`, { method: 'DELETE' });
}

export async function getArrowById(arrowId: string): Promise<ArrowData> {
    const BASE_URL = await baseUrlPromise;
    const res = await fetch(`${BASE_URL}/TreeMode/arrows/${arrowId}`);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`获取箭头失败 (${res.status}): ${errorText}`);
    }
    return res.json();
}


// 消息管理
export async function deleteMessage(convId: string, msgId: string, TreeMode: string = "false") {
  const BASE_URL = await baseUrlPromise;
  const url = `${BASE_URL}/Messages/delete`
  const params = new URLSearchParams({conv_id: convId, message_id: msgId, TreeMode: TreeMode})
  const res = await fetch(`${url}?${params.toString()}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`删除消息失败 (${res.status}): ${errorText}`);
  }
}