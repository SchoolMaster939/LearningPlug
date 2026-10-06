import sqlite3
import uuid
from pathlib import Path
from typing import List, Dict, Optional
from backend.tool.filePath import ensure_dir

DB_PATH = Path(ensure_dir()) / "knowledge_tree.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            node_type TEXT NOT NULL CHECK(node_type IN ('syllabus','qa')),
            parent_id TEXT,
            depth INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            conversation_id TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent ON nodes(parent_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_depth ON nodes(depth)")

    cursor.execute("""
           CREATE TABLE IF NOT EXISTS summaries (
               id TEXT PRIMARY KEY,
               node_id TEXT NOT NULL,              -- 所属父节点ID
               start_index INTEGER NOT NULL,       -- 起始子节点索引
               end_index INTEGER NOT NULL,         -- 结束子节点索引
               label TEXT,                         -- 概要文本
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
           )
       """)

    cursor.execute("""
           CREATE TABLE IF NOT EXISTS arrows (
               id TEXT PRIMARY KEY,
               label TEXT,                          -- 连线标签
               from_node_id TEXT NOT NULL,          -- 起点节点ID
               to_node_id TEXT NOT NULL,            -- 终点节点ID
               bidirectional INTEGER DEFAULT 0,     -- 是否双向
               delta1_x REAL DEFAULT 200,           -- 控制点1偏移
               delta1_y REAL DEFAULT 0,
               delta2_x REAL DEFAULT 200,           -- 控制点2偏移
               delta2_y REAL DEFAULT 0,
               relation_type TEXT DEFAULT 'related', -- 学习系统关联字段
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
               FOREIGN KEY (from_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
               FOREIGN KEY (to_node_id) REFERENCES nodes(id) ON DELETE CASCADE
           )
       """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_summaries_node ON summaries(node_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_arrows_from ON arrows(from_node_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_arrows_to ON arrows(to_node_id)")

    conn.commit()
    conn.close()


"""
CREATE TABLE IF NOT EXISTS nodes (
    -- 1. 主键：每个节点的唯一身份证
    id TEXT PRIMARY KEY,  
    
    -- 2. 展示名称：显示在树上的标题（如“线性回归”、“梯度下降”）
    title TEXT NOT NULL,
    
    -- 3. 节点类型：区分“大纲骨架”和“真实问答”
    --    'syllabus' = 系统预置的学习路线标题（无对话）
    --    'sy'      = 系统生成的节点
    --    'qa'      = 用户真实提问生成的节点（有对话）
    node_type TEXT NOT NULL CHECK(node_type IN ('syllabus', 'qa')),
    
    -- 4. 父节点 ID：这是实现树状结构的核心！
    --    指向本表另一行的 id。如果为 NULL，表示这是一个根节点（顶级目录）。
    parent_id TEXT,
    
    -- 5. 深度：根节点为 0，子节点 +1。
    --    用于前端控制缩进，避免每次递归计算。
    depth INTEGER DEFAULT 0,
    
    -- 6. 同级排序：便于用户调整顺序，比如让“线性代数”排在“微积分”前面。
    sort_order INTEGER DEFAULT 0,
    
    -- 7. 对应 conversations/{id}.json
    conversation_id TEXT UNIQUE,        
    
    -- 8. 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束：确保 parent_id 必须指向一个存在的节点
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- 创建索引：大幅提升“查询子节点”的速度
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
-- 创建索引：按深度筛选时提速
CREATE INDEX IF NOT EXISTS idx_nodes_depth ON nodes(depth);
"""
def create_node(
        title: str,
        node_type: str,
        parent_id: Optional[str] = None,
        conversation_id: Optional[str] = None
) -> str:
    node_id = f"node_{uuid.uuid4().hex[:8]}"
    depth = 0
    if parent_id is not None:
        parent = get_node(parent_id)
        if parent:
            depth = parent['depth'] + 1

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
            INSERT INTO nodes 
            (id, title, node_type, parent_id, depth, conversation_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (node_id, title, node_type, parent_id, depth, conversation_id))
    conn.commit()
    conn.close()

    return node_id

def get_node(node_id: str) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)

def get_children(parent_id: str) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = cursor.execute(
        "SELECT * FROM nodes WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC",
        (parent_id,)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# 获取从根到当前节点的节点
def get_ancestor_nodes(node_id: str) -> List[Dict]:
    query = """
    WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, title, 0 AS level
        FROM nodes
        WHERE id = ?
        UNION ALL
        SELECT n.id, n.parent_id, n.title, a.level + 1
        FROM nodes n
        INNER JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT id, parent_id, title, level 
    FROM ancestors 
    WHERE id != ?
    ORDER BY level DESC;
    """
    with sqlite3.connect(DB_PATH) as conn:

        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        rows = cursor.execute(query, (node_id, node_id)).fetchall()

    return [dict(row) for row in rows]

# 将节点与指定的会话ID绑定
def bind_conversation_to_node(node_id: str, conversation_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE nodes SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (conversation_id, node_id)
    )
    conn.commit()
    conn.close()

def get_conversation_id_by_node(node_id: str) -> Optional[str]:
    node = get_node(node_id)
    return node.get('conversation_id') if node else None

def update_children_depth(node_id: str, parent_new_depth: int):
    children = get_children(node_id)
    if not children:
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for child in children:
        child_id = child["id"]
        child_depth = parent_new_depth + 1
        cursor.execute(
            "UPDATE nodes SET depth = ? WHERE id = ?",
            (child_depth, child_id)
        )
        update_children_depth(child_id, child_depth)
    conn.commit()
    conn.close()

def update_node_title(node_id: str, new_title: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE nodes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (new_title, node_id)
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

# 判断check节点是否是target节点的后代
def is_descendant(target_node_id: str, check_parent_id: str) -> bool:
    if target_node_id == check_parent_id:
        return True
    children = get_children(target_node_id)
    for child in children:
        if is_descendant(child["id"], check_parent_id):
            return True
    return False

def move_node(node_id: str, new_parent_id: Optional[str]):
    if new_parent_id and is_descendant(node_id, new_parent_id):
        raise ValueError("不能将节点移动到自身后代节点下， 否转会形成树状循环")

    new_depth = 0
    if new_parent_id:
        parent = get_node(new_parent_id)
        if parent:
            new_depth = parent['depth'] + 1

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        "UPDATE nodes SET parent_id = ?, depth = ? WHERE id = ?",
        (new_parent_id, new_depth, node_id)
    )

    conn.commit()
    conn.close()

    update_children_depth(node_id, new_depth)

def delete_node(node_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
    conn.commit()
    conn.close()


""" 摘要(summary)管理 """
def create_summary(
        node_id: str,
        summary_id: str,
        start_index: int,
        end_index: int,
        label: str) -> str:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO summaries (id, node_id, start_index, end_index, label) VALUES (?, ?, ?, ?, ?)",
        (summary_id, node_id, start_index, end_index, label)
    )
    conn.commit()
    conn.close()
    return summary_id

def update_summary(
        summary_id: str,
        label: str = None,
        start_index: int = None,
        end_index: int = None):
    updates, params = [], []
    if label is not None:
        updates.append("label = ?")
        params.append(label)
    if start_index is not None:
        updates.append("start_index = ?")
        params.append(start_index)
    if end_index is not None:
        updates.append("end_index = ?")
        params.append(end_index)
    if not updates:
        return False
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(summary_id)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"UPDATE summaries SET {', '.join(updates)} WHERE id = ?", params)
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def delete_summary(summary_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM summaries WHERE id = ?", (summary_id,))
    conn.commit()
    conn.close()

def get_summaries_by_node_ids(node_ids: list[str]) -> list[dict]:
    if not node_ids:
        return []
    placeholders = ",".join(["?"] * len(node_ids))
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = cursor.execute(
        f"SELECT * FROM summaries WHERE node_id IN ({placeholders})",
        node_ids
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_summary_by_id(summary_id: str) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT * FROM summaries WHERE id = ?",
        (summary_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


""" 箭头(arrow)管理 """
def create_arrow(
        arrow_id: str,
        label: str,
        from_node_id: str,
        to_node_id: str,
        bidirectional: bool = False,
        delta1_x: float = 200, delta1_y: float = 0,
        delta2_x: float = 200, delta2_y: float = 0,
        relation_type: str = "related") -> str:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
            INSERT INTO arrows 
            (id, label, from_node_id, to_node_id, bidirectional, 
             delta1_x, delta1_y, delta2_x, delta2_y, relation_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (arrow_id, label, from_node_id, to_node_id, int(bidirectional),
              delta1_x, delta1_y, delta2_x, delta2_y, relation_type))
    conn.commit()
    conn.close()
    return arrow_id

def update_arrow(arrow_id: str, **kwargs):
    allowed = ["label",
               "bidirectional",
               "delta1_x", "delta1_y",
               "delta2_x", "delta2_y",
               "relation_type",
               "from_node_id",
               "to_node_id"]
    updates, params = [], []
    for k, v in kwargs.items():
        if k in allowed and v is not None:
            if k == "bidirectional":
                v = int(v)
            updates.append(f"{k} = ?")
            params.append(v)
    if not updates:
        return False
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(arrow_id)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(f"UPDATE arrows SET {', '.join(updates)} WHERE id = ?", params)
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def delete_arrow(arrow_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM arrows WHERE id = ?", (arrow_id,))
    conn.commit()
    conn.close()

def get_arrows_by_node_ids(node_ids: list[str]) -> list[dict]:
    if not node_ids:
        return []
    placeholders = ",".join(["?"] * len(node_ids))
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = cursor.execute(
        f"""SELECT * FROM arrows 
            WHERE from_node_id IN ({placeholders}) 
               OR to_node_id IN ({placeholders})""",
        node_ids + node_ids
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_arrow_by_id(arrow_id: str) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT * FROM arrows WHERE id = ?",
        (arrow_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


