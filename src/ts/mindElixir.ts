import * as api from './api'
import * as mermaid from './render/mermaid-utils'
import * as code from './render/code-utils'
import * as notif from './tool/notification'
import { initTurnsSelector } from './tool/turnsSelector'

import DOMPurify from 'dompurify';
import MindElixir, { type MindElixirData, type NodeObj} from "mind-elixir";
import'mind-elixir/style.css'
type OperationHandler = (target: any) => Promise<any>;

const operationHandlers: Map<string, OperationHandler> = new Map([
  ['beginEdit', async (target) => {
    const Node = target as NodeObj
    console.log(Node);
  }],
  ['addChild', async (target) => {
    const Node = target as NodeObj
    const realId = await api.createChildNode(Node.parent!.id, Node.topic)
    Node.id = realId
    console.log(`子节点 "${Node.id}" 已创建，真实 ID: ${realId}`);
  }],
  ['insertSibling', async (target) => {
    const Node = target as NodeObj
    await api.createChildNode(Node.parent!.id, Node.topic)
    console.log(`兄弟节点 "${target.topic}" 已创建`);
  }],
  ['removeNodes', async (target) => {
    const Nodes = target as NodeObj[]
    Promise.all(Nodes.map(async (Node) => {

      await api.deleteNode(Node.id);
      const right = document.querySelector('.TreeModeRight') as HTMLElement;
      right.innerHTML = `
      <div class="RightContainer">
          <div class="mind-content">
            <div class="mind-placeholder">请选择节点展示会话</div>
          </div>
      </div>
      `
      console.log(`节点 "${Node.id}" 已删除`);
    }))
  }],
  ['moveNodesIn', async (target) => {
    const Nodes = target as NodeObj[]  
    Promise.all(Nodes.map(async (Node) => {
      await api.moveNode(Node.id, Node.parent!.id)
      console.log(`将${Node.id}节点移到${Node.parent?.id}`);
    }))
  }],
  ['finishEdit', async (target) => {
    const Node = target as NodeObj
    await api.updateNodeTitle(Node.id, Node.topic)
    console.log(`将${Node.id}节点更名为${Node.topic}`);
  }],
  ['createSummary', async (target) => {
    const summary = target as any
    const summary_id = await api.createSummary({
      node_id: summary.parent, 
      summary_id: summary.id,
      start_index: summary.start,
      end_index: summary.end,
      label: summary.label || '',
    })
    console.log(`创建摘要${summary_id}`);
  }],
  ['finishEditSummary', async (target) => {
    const summary = target as any
    await api.updateSummary(summary.id, {
      label: summary.label,
      start_index: summary.start,
      end_index: summary.end,
    })
  }],
  ['createArrow', async (target) => {
    const arrow = target as any
    console.log(arrow);
    const arrow_id = await api.createArrow({
      arrow_id: arrow.id,
      label: arrow.label,
      from_node_id: arrow.from,
      to_node_id: arrow.to,
      bidirectional: arrow.bidirectional || false,
      delta1_x: arrow.delta1.x, delta1_y: arrow.delta1.y,
      delta2_x: arrow.delta2.x, delta2_y: arrow.delta2.y,
      relation_type: '',
    })
    console.log(`创建箭头${arrow_id}`);
  }],
  ['reshapeArrow', async (target) => {
    const arrow = target as any
    await api.updateArrow(arrow.id, {
      delta1_x: arrow.delta1.x, delta1_y: arrow.delta1.y,
      delta2_x: arrow.delta2.x, delta2_y: arrow.delta2.y,
    })
  }],
  ['finishEditArrowLabel', async (target) => {
    const arrow = target as any
    await api.updateArrow(arrow.id, {
      label: arrow.label
    })
  }]
])


async function convertToMindElixirData(treeData: api.TreeNode){
    const NodeObj = await convertNode(treeData)
    const mindData: MindElixirData = {
        nodeData: NodeObj
    }
    return mindData
}

async function convertNode(node: api.TreeNode) {
    const children = await api.getChildren(node.id)
    const childNodes = await Promise.all(children.map(child => convertNode(child)))
    const NodeObj: NodeObj = {
        topic: node.title,
        id: node.id,
        children: childNodes,
    }
    return NodeObj
}

class TextOperation {
  private selection: Selection
  private range: Range

  constructor (se: Selection) {
    this.selection = se
    this.range = this.selection.getRangeAt(0);
  }

  public underline () {
    const fragment = this.range.extractContents();

    const mark = document.createElement('span')
    mark.classList.add("text-operation-underline")

    mark.appendChild(fragment)

    this.range.insertNode(mark);

    this.selection.removeAllRanges();
  }

  public highlight () {
    const fragment = this.range.extractContents();

    const mark = document.createElement('span')
    mark.classList.add("text-operation-highlight")

    mark.appendChild(fragment)

    this.range.insertNode(mark);

    this.selection.removeAllRanges();
  }
}

class TreeMode {
  private mind: MindElixir<any> | null = null;

  private container: HTMLElement;
  private sidebar: HTMLElement;
  private mindContainer: HTMLElement;
  private rootList!: HTMLElement;
  private roots: api.TreeNode[] = [];
  private activeRootId: string | null = null;
  
  private hoverElements: Map<string, HTMLElement> = new Map();
  private pinnedHovers: Map<string, HTMLElement> = new Map();
  private hoverTimers: Map<string, number> = new Map();

  private extraHoverTimers: Map<string, number> = new Map();
  private extraHovers: Map<string, HTMLElement> = new Map();
  private pinnedExtraHovers: Map<string, HTMLElement> = new Map();

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error('TreeMode 容器不存在');

    // 获取子元素
    const left = this.container.querySelector('.TreeModeLeft') as HTMLElement;
    if (!left) throw new Error('.TreeModeLeft 不存在');
    this.sidebar = left.querySelector('.TreeModeSidebar') as HTMLElement;
    this.mindContainer = left.querySelector('.TreeModeMindElixir') as HTMLElement;
    if (!this.sidebar || !this.mindContainer) throw new Error('侧边栏或思维导图容器不存在');

    // 构建侧边栏内部结构
    this.buildSidebar();

    // 加载根节点
    this.loadRoots();
  }

  private async refreshMindElixir() {
    if (this.activeRootId && this.mind) {
      const root = await api.getNodeData(this.activeRootId)
      const mindData = await convertToMindElixirData(root);
      const extras = await api.getTreeExtras(root.id)

      mindData.summaries = extras.summaries.map((s: any) => ({
          id: s.id,
          parent: s.node_id,
          start: s.start_index,
          end: s.end_index,
          label: s.label,
      }));
      
      mindData.arrows = extras.arrows.map((a: any) => ({
          id: a.id,
          label: a.label,
          from: a.from_node_id,
          to: a.to_node_id,
          bidirectional: !!a.bidirectional,
          delta1: { x: a.delta1_x, y: a.delta1_y },
          delta2: { x: a.delta2_x, y: a.delta2_y },
      }));
      
      this.mind.refresh(mindData);
    }
  }

  private buildNodeMap(node: NodeObj) {
    if(!node) return;
    if (node.children) {
        for (const child of node.children) {
            this.buildNodeMap(child);
        }
    }
  }

  private buildSidebar() {
    // 清空侧边栏并重建
    this.sidebar.innerHTML = '';

    // 标题
    const title = document.createElement('div');
    title.className = 'sidebar-title';
    title.textContent = '根节点';
    this.sidebar.appendChild(title);

    // 列表容器
    this.rootList = document.createElement('div');
    this.rootList.className = 'root-list';
    this.sidebar.appendChild(this.rootList);

    // 创建根节点按钮
    const createBtn = document.createElement('button');
    createBtn.className = 'create-root-btn';
    createBtn.textContent = '+ 创建根节点';
    createBtn.addEventListener('click', () => this.createRoot());
    this.sidebar.appendChild(createBtn);
  }

  async loadRoots() {
    this.removeAllHovers();
    try {
      this.roots = await api.getRoots();
      this.renderRoots();

      if (this.roots.length > 0 && !this.activeRootId) {
        this.mindContainer.innerHTML = '<div class="mind-content"><div class="mind-placeholder">请选择对应的根节点</div></div>';
      } else if (this.roots.length === 0) {
        this.mindContainer.innerHTML = '<div class="mind-content"><div class="mind-placeholder">暂无根节点，请创建</div></div>';
      } else {
        const stillExists = this.roots.some(r => r.id === this.activeRootId);
        if (!stillExists) {
          this.activeRootId = this.roots.length > 0 ? this.roots[0].id : null;
          if (this.activeRootId) {
            const activeRoot = this.roots.find(r => r.id === this.activeRootId);
            if (activeRoot) this.renderMind(activeRoot);
            console.log(activeRoot);
            
          } else {
            this.mindContainer.innerHTML = '<div class="mind-content"><div class="mind-placeholder">暂无根节点，请创建</div></div>';
          }
        }
      }
    } catch (e) {
      console.error('加载根节点失败', e);
    }
  }

  private renderRoots() {
  this.rootList.innerHTML = '';
  if (this.roots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'root-empty';
    empty.textContent = '暂无根节点，请创建';
    this.rootList.appendChild(empty);
    return;
  }
  this.roots.forEach(root => {
    const item = document.createElement('div');
    item.className = 'root-item';
    if (root.id === this.activeRootId) {
      item.classList.add('active');
    }

    // 标题（可点击切换）
    const titleSpan = document.createElement('span');
    titleSpan.className = 'root-item-title';
    titleSpan.textContent = root.title;
    item.appendChild(titleSpan);

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'root-item-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止触发选中
      this.deleteRoot(root.id);
    });
    item.appendChild(deleteBtn);

    // 点击整项切换
    item.addEventListener('click', () => {
      this.selectRoot(root);
    });

    this.rootList.appendChild(item);
  });
  }

  private selectRoot(root: api.TreeNode) {
    if (this.activeRootId === root.id) return;
    this.activeRootId = root.id;
    // 更新侧边栏高亮
    this.rootList.querySelectorAll('.root-item').forEach(el => el.classList.remove('active'));
    const items = this.rootList.querySelectorAll('.root-item');
    const index = this.roots.findIndex(r => r.id === root.id);
    if (index !== -1 && items[index]) {
      items[index].classList.add('active');
    }
    // 渲染思维导图
    this.renderMind(root);
  }

  private async renderMind(root: api.TreeNode) {

    this.mindContainer.innerHTML = `
      <div class="mind-content" id="${root.id}"></div>
    `
    const treeModeMindElixir = document.getElementById(root.id) as HTMLDivElement

    const options = {
        el: treeModeMindElixir,
        draggable: true,
        locale: 'zh-CN',
        storage: false,
    }

    const mindData = await convertToMindElixirData(root)
    const extras = await api.getTreeExtras(root.id)

    mindData.summaries = extras.summaries.map((s: any) => ({
        id: s.id,
        parent: s.node_id,
        start: s.start_index,
        end: s.end_index,
        label: s.label,
    }));
    
    mindData.arrows = extras.arrows.map((a: any) => ({
        id: a.id,
        label: a.label,
        from: a.from_node_id,
        to: a.to_node_id,
        bidirectional: !!a.bidirectional,
        delta1: { x: a.delta1_x, y: a.delta1_y },
        delta2: { x: a.delta2_x, y: a.delta2_y },
    }));

    this.buildNodeMap(mindData.nodeData)

    const regex = /node_.*/
    //const mind = this.mind
    this.mind = new MindElixir(options)
    const container = this.mind.container
    let target

    if(!mindData) return;

    this.mind.init(mindData)
    
    this.mind.bus.addListener('operation', async (operation) => {
      const name = operation.name
      target = operation.target
      const handler = operationHandlers.get(name)
      
      console.log(operation);
      
      if (handler) {
        try {
          await handler(target)
          if (this.mind) this.mind.refresh(); 
        } catch (error) {
          notif.showToast(`操作${name}失败，报错${error}`, '#ff6b6b')
          console.error(`操作 ${name} 同步失败:`, error);
        }
      } else {
        notif.showToast(`非数据库操作${name},目标${target},该操作不保存`, '#ff6b6b')
        console.warn(name);
        console.warn(target);
      }
    })

    container.addEventListener("mouseover", async (e) => {
      const target = e.target as HTMLElement;
      const nodeEl = target.closest('[data-nodeid]');

      const clientX = e.clientX;
      const clientY = e.clientY;

      if (!nodeEl) {
        const extra = target.closest('[data-type]');
        if (!extra) return;

        const extraType = extra.getAttribute('data-type');
        const regex = /label-[as]-([a-z0-9]+)/;

        const idMatch = extra.getAttribute('id')?.match(regex);
        if (!idMatch) return;
        const extraId = idMatch[1];

        const existingTimer = this.extraHoverTimers.get(extraId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.extraHoverTimers.delete(extraId);
        }

        if (this.extraHovers.has(extraId)) {
            return;
        }

        if (extraType === 'summary') {
            const summary = await api.getSummaryById(extraId);
            await this.showExtraHover(summary, { clientX, clientY } as MouseEvent);
        } else if (extraType === 'arrow') {
            const arrow = await api.getArrowById(extraId);
            await this.showExtraHover(arrow, { clientX, clientY } as MouseEvent);
        }
        return;
    }

      const related = e.relatedTarget as HTMLElement;
      if (related && nodeEl.contains(related)) return;

      const res = nodeEl.getAttribute('data-nodeid')?.match(regex);
      if (!res) return;
      const nodeId = res[0];

      nodeEl.addEventListener("click", async () => {
        const conversation = await api.TreeModeGetConversation(nodeId)
        this.renderChat(conversation, nodeId);
      })

      const oldTimer = this.hoverTimers.get(nodeId);
      if (oldTimer) {
        clearTimeout(oldTimer);
        this.hoverTimers.delete(nodeId);
      }

      if (this.pinnedHovers.has(nodeId)) {
        const el = this.pinnedHovers.get(nodeId)
        if (!el) return;
        el.style.borderColor = "#888"
        return;
      }

      const timer = window.setTimeout(async () => {
        this.hoverTimers.delete(nodeId);

        if (this.pinnedHovers.has(nodeId)) return;
        if (this.hoverElements.has(nodeId)) return;

        const node = await api.getNodeData(nodeId);
        if (!node) return;

        await this.showNodeHover(node, { clientX, clientY } as MouseEvent);
      }, 500);

      this.hoverTimers.set(nodeId, timer);
    });

    container.addEventListener("mouseout", async (e) => {
      const target = e.target as HTMLElement;

      const extra = target.closest('[data-type]');
      if (extra && !target.closest('[data-nodeid]')) {
          const regex = /label-[as]-([a-z0-9]+)/;
          const idMatch = extra.getAttribute('id')?.match(regex);
          if (idMatch) {
              const extraId = idMatch[1];

              if (this.pinnedExtraHovers.has(extraId)) return;

              const related = e.relatedTarget as HTMLElement;
              if (related && extra.contains(related)) return;

              const hoverEl = this.extraHovers.get(extraId);
              if (hoverEl && related && hoverEl.contains(related)) return;

              const oldTimer = this.extraHoverTimers.get(extraId);
              if (oldTimer) clearTimeout(oldTimer);

              const timer = window.setTimeout(() => {
                  this.removeExtraHover(extraId, false);
              }, 200);
              this.extraHoverTimers.set(extraId, timer);
          }
          return;
      }

      const nodeEl = target.closest('[data-nodeid]');
      if (!nodeEl) return;
      const related = e.relatedTarget as HTMLElement;
      if (related && nodeEl.contains(related)) return;
      const res = nodeEl.getAttribute('data-nodeid')?.match(/node_.*/);
      if (!res) return;
      const nodeId = res[0];

      if (this.pinnedHovers.has(nodeId)) {
          const el = this.pinnedHovers.get(nodeId);
          if (!el) return;
          el.style.borderColor = "#444";
          return;
      }

      const oldTimer = this.hoverTimers.get(nodeId);
      if (oldTimer) clearTimeout(oldTimer);

      const timer = window.setTimeout(() => {
          this.removeNodeHover(nodeId, false);
      }, 200);
      this.hoverTimers.set(nodeId, timer);
    });  

  }

  private async createRoot() {
    const title = prompt('请输入根节点标题', '新根节点');
    if (!title) return;
    try {
      await api.createParentNode(title);
      await this.loadRoots();
    } catch (e) {
      alert('创建失败');
      console.error(e);
    }
  }

  private async deleteRoot(nodeId: string) {
  const root = this.roots.find(r => r.id === nodeId);
  if (!root) return;
  if (!confirm(`确认删除根节点 "${root.title}" 及其所有子节点吗？`)) return;

  try {
    await api.deleteNode(nodeId);
    const right = document.querySelector('.TreeModeRight') as HTMLElement;
    right.innerHTML = `
    <div class="RightContainer">
      <div class="mind-content">
        <div class="mind-placeholder">请选择节点展示会话</div>
      </div>
    </div>
    `;
    await this.loadRoots();
    if (this.activeRootId === nodeId) {
      this.activeRootId = null;
      this.mindContainer.innerHTML = '<div class="mind-content"><div class="mind-placeholder">请选择一个根节点</div></div>';
    }
  } catch (e) {
    console.error('删除根节点失败', e);
    alert('删除失败，请重试');
  }
  }

  //悬浮窗
  private async showNodeHover(node: api.TreeNode, event: MouseEvent) {


    if (this.pinnedHovers.has(node.id)) {
      console.log(this.pinnedHovers.has(node.id));
      return
    };

    if (this.hoverElements.has(node.id)) {
      const old = this.hoverElements.get(node.id)!;
      old.remove();
      this.hoverElements.delete(node.id);
    }

    let conversation: any = null;
    let messages: any[] = [];

    if (node.conversation_id) {
      try{
         conversation = await api.TreeModeGetConversation(node.id)
         messages = conversation.messages || [];  
      } catch (e) {
        console.warn('获取会话信息失败', e);
      }
    }

    const hover = document.createElement('div');
    hover.className = 'node-hover';
    hover.dataset.nodeId = node.id; 
  
    hover.innerHTML = `
    <div class="node-hover-header">
      <span class="node-hover-title">${node.title}</span>
      <div class="node-hover-actions">
        <button class="hover-btn hover-btn-pin" data-action="pin" title="钉住">📌</button>
        <button class="hover-btn hover-btn-close" data-action="close" title="关闭">✕</button>
      </div>
    </div>
    <div class="node-hover-body">
      <div class="node-hover-content">ID: ${node.id}</div>
      <div class="node-hover-content">会话ID: ${node.conversation_id}</div>
      <div class="node-hover-content hover-conversation-title" data-node-id="${node.id}" title="点击将会话标题设为节点名称">会话标题: ${conversation.title}</div>
      <div class="node-hover-content">节点类型: ${node.node_type}</div>
      <div class="node-hover-content">深度: ${node.depth}</div>
      <div class="node-hover-content">创建时间: ${node.created_at}</div>
      <div class="node-hover-content">更新时间: ${node.updated_at}</div>
    </div>
    <div class="node-hover-footer">
      <button class="hover-btn hover-btn-toggle-conv" data-node-id="${node.id}">展示该节点会话记录</button>
    </div>
    <div class="node-hover-conv-list" style="display:none; max-height:200px; overflow-y:auto; margin-top:8px; border-top:1px solid #333; padding-top:8px;">
      <!-- 会话消息列表将动态渲染 -->
    </div>
    `;

    const offsetX = 15, offsetY = 15;

    const panelWidth = 280;
    const panelHeight = 80;

    let left = event.clientX - offsetX - panelWidth;
    let top = event.clientY + offsetY;

    if (left < 0) {
      left = event.clientX + offsetX;
    }
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth;
    }
    if (top + panelHeight > window.innerHeight) {
      top = event.clientY - offsetY - panelHeight;
    }
    if (top < 0) {
      top = 0;
    }

    hover.style.left = left + 'px';
    hover.style.top = top + 'px';


    this.bindHoverEvents(hover, node);
    this.enableDrag(hover);

    const titleEl = hover.querySelector('.hover-conversation-title') as HTMLElement;
    if (titleEl) {
      titleEl.addEventListener("click", async () => {
        if (!conversation) return;
        try {
          await api.updateNodeTitle(node.id, conversation.title);
          if (this.activeRootId && this.mind) {
            const root = await api.getNodeData(this.activeRootId)
            const mindData = await convertToMindElixirData(root);
            this.mind.refresh(mindData);
          }
          const titleSpan = hover.querySelector('.node-hover-title') as HTMLElement;
          if (titleSpan) titleSpan.textContent = conversation.title;
          
          if (this.mind) {
            console.log(this.mind);
            this.mind.refresh()
          }
        } catch (e) {
          console.error('更新节点标题失败', e);
          alert('更新失败，请重试');
        }
      })
    }

    const toggleBtn = hover.querySelector('.hover-btn-toggle-conv') as HTMLButtonElement;
    const convListContainer = hover.querySelector('.node-hover-conv-list') as HTMLDivElement;
    if (toggleBtn && convListContainer) {
      toggleBtn.addEventListener("click", async () => {
        const isHidden = convListContainer.style.display === 'none';
        if (isHidden) {
          
          if (convListContainer.children.length === 0 && messages.length > 0) {
            messages.forEach(msg => {
              const msgDiv = document.createElement('div');
              msgDiv.className = 'conv-message-item';

              const markdown = msg.content || '';
              const rawHtml = code.marked.parse(markdown) as string;
              msgDiv.innerHTML =  DOMPurify.sanitize(rawHtml);
              mermaid.renderMermaidBlocks(msgDiv, markdown)
              convListContainer.appendChild(msgDiv);
            });} 
            else if (messages.length === 0) {
              const emptyMsg = document.createElement('div');
              emptyMsg.className = 'conv-message-empty';
              emptyMsg.textContent = '该会话暂无消息';
              convListContainer.appendChild(emptyMsg);
            }
            convListContainer.style.display = 'block';
            toggleBtn.textContent = '关闭查看聊天记录';

            hover.style.maxHeight = 'none';
        } else {
          convListContainer.style.display = 'none';
          toggleBtn.textContent = '展示该节点会话记录';

          hover.style.maxHeight = '';
        }
      })
    }

    hover.addEventListener('mouseenter', () => {
    const timer = this.hoverTimers.get(node.id);
    if (timer) {
      clearTimeout(timer);
      this.hoverTimers.delete(node.id);
    }
    });

    hover.addEventListener('mouseleave', () => {
    const timer = window.setTimeout(() => {
      this.removeNodeHover(node.id, false);
    }, 200);
    this.hoverTimers.set(node.id, timer);
    });

    this.hoverElements.set(node.id, hover);

    document.body.appendChild(hover);

  }
  private async showExtraHover(extraData: api.SummaryData | api.ArrowData, event: MouseEvent) {


    const extraId = extraData.id;

    const oldTimer = this.extraHoverTimers.get(extraId);
    if (oldTimer) {
        clearTimeout(oldTimer);
        this.extraHoverTimers.delete(extraId);
    }
    const oldHover = this.extraHovers.get(extraId);
    if (oldHover) {
        oldHover.remove();
        this.extraHovers.delete(extraId);
    }

    const oldPinned = this.pinnedExtraHovers.get(extraId);
    if (oldPinned) {
        oldPinned.remove();
        this.pinnedExtraHovers.delete(extraId);
    }

    console.log(extraData);
    
    const hover = document.createElement('div');
    hover.className = 'node-hover';
    hover.dataset.extraId = extraId;   

    hover.innerHTML = `
        <div class="node-hover-header">
            <span class="node-hover-title">${extraData.label || '(无标题)'}</span>
            <div class="node-hover-actions">
                <button class="hover-btn hover-btn-delete" data-action="delete" title="删除">🗑</button>
                <button class="hover-btn hover-btn-pin" data-action="pin" title="钉住">📌</button>
                <button class="hover-btn hover-btn-close" data-action="close" title="关闭">✕</button>
            </div>
        </div>
        <div class="node-hover-body">
            <div class="node-hover-content">ID: ${extraData.id}</div>
            <div class="node-hover-content">创建时间: ${extraData.created_at}</div>
            <div class="node-hover-content">更新时间: ${extraData.updated_at}</div>
        </div>
    `;

    const offsetX = 15, offsetY = 15;
    const panelWidth = 280;
    const panelHeight = 80;

    let left = event.clientX - offsetX - panelWidth;
    let top = event.clientY + offsetY;

    if (left < 0) left = event.clientX + offsetX;
    if (left + panelWidth > window.innerWidth) left = window.innerWidth - panelWidth;
    if (top + panelHeight > window.innerHeight) top = event.clientY - offsetY - panelHeight;
    if (top < 0) top = 0;

    hover.style.left = left + 'px';
    hover.style.top = top + 'px';

    this.enableDrag(hover);


    const closeBtn = hover.querySelector('[data-action="close"]') as HTMLButtonElement;
    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();

        this.pinnedExtraHovers.delete(extraId);
        this.removeExtraHover(extraId, true);
    });


    const pinBtn = hover.querySelector('[data-action="pin"]') as HTMLButtonElement;
    pinBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.pinnedExtraHovers.has(extraId)) {

            this.pinnedExtraHovers.delete(extraId);
            pinBtn.textContent = '📌';
            pinBtn.title = '钉住';
            hover.style.borderColor = '';   
        } else {
  
            this.pinnedExtraHovers.set(extraId, hover);
            pinBtn.textContent = '📍';
            pinBtn.title = '已钉住';
            hover.style.borderColor = '#0078d4';   
            const t = this.extraHoverTimers.get(extraId);
            if (t) {
                clearTimeout(t);
                this.extraHoverTimers.delete(extraId);
            }
        }
    });

    hover.addEventListener('mouseenter', () => {
        const t = this.extraHoverTimers.get(extraId);
        if (t) {
            clearTimeout(t);
            this.extraHoverTimers.delete(extraId);
        }
    });

    hover.addEventListener('mouseleave', () => {
        if (this.pinnedExtraHovers.has(extraId)) return;  
        const t = window.setTimeout(() => {
            this.removeExtraHover(extraId, false);
        }, 200);
        this.extraHoverTimers.set(extraId, t);
    });


    const deleteBtn = hover.querySelector('.hover-btn-delete') as HTMLButtonElement;
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const label = extraData.label || '(无标题)';
        if (!confirm(`确认删除 "${label}" 吗？`)) return;

        deleteBtn.disabled = true;
        deleteBtn.classList.add('deleting');

        try {
          if ('node_id' in extraData) {
            await api.deleteSummary(extraData.id);
          } else if ('from_node_id' in extraData) {
            await api.deleteArrow(extraData.id);
          } else {
            console.warn('未知的数据类型:', extraData);
            alert('无法识别该元素类型');
            deleteBtn.disabled = false;
            deleteBtn.classList.remove('deleting');
            return;
          }

          hover.classList.add('removing');

          setTimeout(() => {
            this.removeNodeHover(extraData.id, true); 
          }, 800);

          await this.refreshMindElixir();

        } catch (err) {
          console.error('删除失败:', err);
          alert('删除失败，请重试');
          deleteBtn.disabled = false;
          deleteBtn.classList.remove('deleting');
        }
      });
    }

    document.body.appendChild(hover);
    this.extraHovers.set(extraId, hover);
  }

  private removeNodeHover(nodeId?: string, force: boolean = false) {

    if (nodeId) {
      const timer = this.hoverTimers.get(nodeId);
      if (timer) {
        clearTimeout(timer);
        this.hoverTimers.delete(nodeId);
      }
      const el = this.hoverElements.get(nodeId);
      if (!el) return;
      if (this.pinnedHovers.has(nodeId) && !force) return;
      el.remove();
      this.hoverElements.delete(nodeId);
      if (this.pinnedHovers.has(nodeId)) {
        this.pinnedHovers.delete(nodeId);
      }
      return;
    }
    const toRemove: string[] = [];
    this.hoverElements.forEach((el, id) => {
      if (!this.pinnedHovers.has(id)) {
        el.remove();
        toRemove.push(id);
        const timer = this.hoverTimers.get(id);
        if (timer) clearTimeout(timer);
        this.hoverTimers.delete(id);
      }
    });
    toRemove.forEach(id => this.hoverElements.delete(id));
  }
  private removeExtraHover(extraId: string, immediate: boolean = false) {
    if (!immediate && this.pinnedExtraHovers.has(extraId)) {
        return;
    }

    const t = this.extraHoverTimers.get(extraId);
    if (t) {
        clearTimeout(t);
        this.extraHoverTimers.delete(extraId);
    }

    const hover = this.extraHovers.get(extraId);
    if (!hover) return;

    const doRemove = () => {
        hover.remove();
        this.extraHovers.delete(extraId);
        this.pinnedExtraHovers.delete(extraId);   
    };

    if (immediate) {
        doRemove();
        return;
    }

    const timer = window.setTimeout(doRemove, 200);
    this.extraHoverTimers.set(extraId, timer);
  }

  private removeAllHovers() {
    this.hoverTimers.forEach(timer => clearTimeout(timer));
    this.hoverTimers.clear();
    this.hoverElements.forEach(el => el.remove());
    this.hoverElements.clear();
    this.pinnedHovers.clear();
  }
  
  private bindHoverEvents(hover: HTMLElement, node: api.TreeNode) {
  const closeBtn = hover.querySelector('.hover-btn-close') as HTMLButtonElement;
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeNodeHover(node.id, true); // 强制移除当前节点
    });}

  const pinBtn = hover.querySelector('.hover-btn-pin') as HTMLButtonElement;
  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.NailHover(hover, node);
    });}
  }

  private NailHover(hover: HTMLElement, node: api.TreeNode) {
    const nodeId = node.id;
    if (this.pinnedHovers.has(nodeId)) {
      this.pinnedHovers.delete(nodeId);
      this.removeNodeHover(nodeId, true);
    } else {
      this.pinnedHovers.set(nodeId, hover);
      const timer = this.hoverTimers.get(nodeId);
      if (timer) {
        clearTimeout(timer);
        this.hoverTimers.delete(nodeId);
      }
      const pinBtn = hover.querySelector('.hover-btn-pin') as HTMLButtonElement;
      if (pinBtn) pinBtn.classList.add('active');
    }
  }

  private enableDrag(element: HTMLElement) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  // 鼠标按下：记录初始位置
  const onMouseDown = (e: MouseEvent) => {
    // 如果点击的是按钮或可交互元素，不启动拖拽
    const target = e.target as HTMLElement;
    if (target.closest('.hover-btn') || target.closest('button')) {
      return;
    }
    // 或者限定拖拽区域为 .node-hover-header（推荐）
    // if (!target.closest('.node-hover-header')) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    // 阻止文本选择
    document.body.style.userSelect = 'none';

    // 添加全局监听
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // 边界限制（可选）
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));

    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
  };

  const onMouseUp = () => {
    isDragging = false;
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  // 绑定 mousedown 到悬浮窗
  element.addEventListener('mousedown', onMouseDown);
  }

  //菜单悬浮窗
  private showTextMenu(x: number, y: number, text: string, NodeId: string, se: Selection|null) {
    const oldMenu = document.querySelector('.text-selection-menu');
    if (oldMenu) oldMenu.remove();
    const oldDropdown = document.querySelector('.text-selection-dropdown');
    if (oldDropdown) oldDropdown.remove();

    const menu = document.createElement('div');
    menu.className = 'text-selection-menu';

    menu.style.left = x + 'px';
    menu.style.top =  y + 'px';

    const displayText = text.length > 7 ? '...' : text;

    menu.innerHTML = `
      <div class="menu-item" id="menu-item-text" data-action="display-all">${displayText}</div>
      <div class="menu-divider"></div>
      <div class="menu-item" data-action="create-node">对此提问并生成对应子节点</div>
      <div class="menu-divider"></div>
      <div class="menu-item" data-action="dropdown-toggle" title="更多操作">▼</div>
      <div class="menu-divider"></div>
      <div class="menu-item" data-action="close">取消</div>
    `;


    
    document.body.appendChild(menu);
    this.enableDrag(menu)

    menu.querySelector('[data-action="display-all"]')?.addEventListener('click', () => {
      const textDom = document.getElementById("menu-item-text")
      if (!textDom) return;
      textDom.textContent = text;
    })

    menu.querySelector('[data-action="create-node"]')?.addEventListener('click', async () => {
      console.log("create-node");
      if (!this.mind) return;
      const newNode: NodeObj = {
        topic: `${text}`,
        id:"",
      }
      const NodeTopic = this.mind.findEle(NodeId)
      await this.mind.addChild(NodeTopic, newNode);
      if (this.activeRootId) {
        const root = await api.getNodeData(this.activeRootId)
        const mindData = await convertToMindElixirData(root);
        this.mind.refresh(mindData);
      }
      const conversation = await api.TreeModeGetConversation(newNode.id)
      this.renderChat(conversation, newNode.id, text)
      menu.remove();
    });

    menu.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      console.log("remove");
      menu.remove();
      closeDropDown();
    });

    document.addEventListener("dblclick", () => {
      menu.remove();
      closeDropDown();
    })

    let dropdownOpen = false;
    const dropdownBtn = menu.querySelector('[data-action="dropdown-toggle"]') as HTMLElement;
    let dropdown: HTMLElement | null = null;

    dropdownBtn.addEventListener('click', (e: Event) => {
    
      e.stopPropagation();
      dropdownOpen = ! dropdownOpen
      if ( dropdownOpen) {
        dropdown = document.createElement('div');
        dropdown.className = 'text-selection-dropdown open';

        const btnRect = dropdownBtn.getBoundingClientRect();
        if (!se) return;
        const textOperation = new TextOperation(se)
        
        dropdown.style.left = btnRect.left + 'px';
        dropdown.style.top = (btnRect.bottom + 4) + 'px';

        dropdown.innerHTML = `
        <div class="dropdown-item" data-action="1">下划线标准</div>
        <div class="dropdown-item" data-action="2">高光</div>
        <div class="dropdown-item" data-action="3">插片</div>
        `;
        document.body.appendChild(dropdown);

        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener("click", (e) => {
            e.stopPropagation();
            const action = item.getAttribute('data-action')
            console.log(action);
            if (action === "1") {
              textOperation.underline();
            } 
            else if (action === "2") {
              textOperation.highlight();
            }
            menu.remove()
            closeDropDown();
          });
        });

      } else {
        closeDropDown();
      }
    })

    const closeDropDown = () => {
      dropdownOpen = false;
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }   
    }

  }

  //聊天区域
  private renderChat(conversation: any, NodeId: string, text: string|null = null) {
    const right = this.container.querySelector('.TreeModeRight') as HTMLElement;
    if (!right) return;
  
    right.innerHTML = `
      <div class="chat-container">
        <div class="chat-header">
          <span class="chat-title">${conversation.id || '新会话'}</span>
        </div>
        <div class="chat-messages" id="treeChatMessages"></div>
        <div class="chat-input-area">
          <div class="chat-turns-bar">
            <div class="chat-turns-selector" id="treeChatTurnsSelector">
              <button class="turns-trigger" type="button">
                <span class="turns-value">10</span>
                <span class="turns-unit">轮</span>
                <span class="turns-arrow">▾</span>
              </button>
              <div class="turns-dropdown">
                <div class="turns-option" data-value="1">1 轮</div>
                <div class="turns-option" data-value="3">3 轮</div>
                <div class="turns-option" data-value="5">5 轮</div>
                <div class="turns-option active" data-value="10">10 轮</div>
                <div class="turns-option" data-value="20">20 轮</div>
                <div class="turns-option" data-value="-1">全部</div>
              </div>
            </div>
          </div>
          <div class="chat-input-row">
            <textarea class="chat-input" id="treeChatInput" placeholder="输入消息..." rows="1"></textarea>
            <button class="chat-send-btn" id="treeSendBtn">发送</button>
          </div>
        </div>
      </div>
    `;    
  
    const messagesContainer = right.querySelector('#treeChatMessages') as HTMLDivElement;
    if (messagesContainer && conversation.messages) {
      conversation.messages.forEach((msg: any) => {
        const div = document.createElement('div');
        div.className = `message ${msg.role}`;
        div.id = `${msg.id}`
        const markdown = msg.content || '';
        const rawHtml = code.marked.parse(markdown) as string;
        div.innerHTML = DOMPurify.sanitize(rawHtml);
        messagesContainer.appendChild(div);
        
        mermaid.renderMermaidBlocks(div, markdown);
        code.enhanceCodeBlocks(div)

        if (msg.id && conversation.id) {
          this.attachDeleteButton(div, msg.id, conversation.id);
        }

      });

      messagesContainer.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        
        const selectedText = selection?.toString().trim();
        if (selectedText && selectedText.length > 0) {
          // 获取选区的坐标
          const range = selection?.getRangeAt(0);
          const rect = range?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX;
          const y = rect.bottom;
          // 显示菜单
          this.showTextMenu(x, y, selectedText, NodeId, selection);
        }

      })

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } 
    
    this.bindChatEvents(conversation.id, NodeId);

  }

  private bindChatEvents(conversationId: string, NodeId: string) {
    const right = this.container.querySelector('.TreeModeRight') as HTMLElement;
    const input = right.querySelector('#treeChatInput') as HTMLTextAreaElement;
    const sendBtn = right.querySelector('#treeSendBtn') as HTMLButtonElement;
    const messagesContainer = right.querySelector('#treeChatMessages') as HTMLDivElement;
    const turnsSelector = right.querySelector('#treeChatTurnsSelector') as HTMLElement;

    const getTurns = turnsSelector ? initTurnsSelector(turnsSelector) : 10;

    const sendMessage = async () => {
        const prompt = input.value.trim();
        if (!prompt) return;

        // 显示用户消息
        const userDiv = document.createElement('div');
        userDiv.className = 'message user';
        userDiv.textContent = prompt;
        messagesContainer.appendChild(userDiv);
        input.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const assistantDiv = document.createElement('div');
        assistantDiv.className = 'message assistant';
        assistantDiv.textContent = '';
        messagesContainer.appendChild(assistantDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const currentNodeId = NodeId;
            const response = await api.streamChat(prompt, conversationId, true, currentNodeId);
            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let fullContent = '';
            let judgeThreadId: string | null = null;     
            let streamFinished = false;                    

            while (reader) {
                const { done, value } = await reader.read();
                if (done) {
                    
                    if (buffer.startsWith('data: ')) {
                        const data = buffer.slice(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.judge_thread_id && !judgeThreadId) {
                                    judgeThreadId = parsed.judge_thread_id;
                                }
                                if (parsed.content) {
                                    fullContent += parsed.content;
                                }
                                if (parsed.finish) {
                                    streamFinished = true;
                                }
                            } catch (e) {}
                        }
                    }

                    
                    const rawHtml = code.marked.parse(fullContent) as string;
                    assistantDiv.innerHTML = DOMPurify.sanitize(rawHtml);
                    mermaid.renderMermaidBlocks(assistantDiv, fullContent);
                    code.enhanceCodeBlocks(assistantDiv);

                    streamFinished = true;
                    
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        console.log(parsed);

                        if (parsed.judge_thread_id && !judgeThreadId) {
                            judgeThreadId = parsed.judge_thread_id;
                            console.log('[Judge] 收到 thread_id:', judgeThreadId);
                        }

                        if (parsed.finish === true) {
                            streamFinished = true;
                        }

    
                        const content = parsed.content || '';
                        if (content) {
                            fullContent += content;
                            const rawHtml = code.marked.parse(fullContent) as string;
                            assistantDiv.innerHTML = DOMPurify.sanitize(rawHtml);
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        }

                        if (parsed.type === 'tool_result' && parsed.tool_name === 'generate_mermaid_diagram') {
                           
                        }
                    } catch (e) {}
                }
            }


            if (streamFinished && judgeThreadId) {
                console.log('[Judge] 流已结束，开始轮询判断结果');
                // 0000
                this.pollJudgeResult(judgeThreadId);
            }
        } catch (e) {
            console.error('发送消息失败', e);
            assistantDiv.textContent = '⚠️ 发送失败，请重试';
        }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendMessage();
        }
    });
  }

  private async pollJudgeResult(threadId: string) {
    const MAX_ATTEMPTS = 20;      // 最多轮询 20 次
    const INTERVAL = 800;         // 间隔 800ms
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
            const result = await api.getJudgeStatus(threadId);

            if (result.status === 'no_new_topic') {
                console.log('[Judge] 未检测到新主题');
                return;
            }

            if (result.status === 'waiting_confirmation') {
                console.log('[Judge] 检测到新主题，弹出确认窗');
                const confirmed = await this.showConfirmDialog({
                    title: result.suggested_title,
                    reason: result.reason,
                });

                const res = await api.confirmJudge(threadId, confirmed ? 'confirm' : 'reject');

                if (res.success && res.node_id) {
                    await this.refreshMindElixir();
                    if ((window as any).treeMode?.refreshAndSelect) {
                        await (window as any).treeMode.refreshAndSelect(res.node_id);
                    }
                }
                return;
            }

            if (result.status === 'created' || result.status === 'rejected' || result.status === 'finished') {
                return;
            }

            // status === 'pending' 或其它，继续轮询
        } catch (e) {
            console.error('[Judge] 轮询失败', e);
            return;
        }
        await new Promise(r => setTimeout(r, INTERVAL));
    }

    console.warn('[Judge] 轮询超时，放弃');
  }

  private showConfirmDialog(options: { title: string; reason: string }): Promise<boolean> {
    return new Promise((resolve) => {

      const overlay = document.createElement('div');
      overlay.className = 'confirm-dialog-overlay';
  
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <div class="confirm-dialog-title">检测到新主题</div>
        <div class="confirm-dialog-body">
          <div class="confirm-dialog-row">
            <span class="confirm-dialog-label">建议标题：</span>
            <span class="confirm-dialog-value">${options.title}</span>
          </div>
          <div class="confirm-dialog-row">
            <span class="confirm-dialog-label">理由：</span>
            <span class="confirm-dialog-value confirm-dialog-reason">${options.reason}</span>
          </div>
        </div>
        <div class="confirm-dialog-actions">
          <button class="dialog-btn dialog-cancel">忽略</button>
          <button class="dialog-btn dialog-confirm">创建新节点</button>
        </div>
      `;
  
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
  
      // 3. 触发进入动画
      requestAnimationFrame(() => {
        overlay.classList.add('dialog-active');
      });
  
      // 4. 清理函数（含离场动画）
      const cleanup = (result: boolean) => {
        overlay.classList.remove('dialog-active');
        // 等待动画结束再移除 DOM
        const onEnd = () => {
          overlay.removeEventListener('transitionend', onEnd);
          overlay.remove();
          resolve(result);
        };
        overlay.addEventListener('transitionend', onEnd, { once: true });
        // 保底移除
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.remove();
            resolve(result);
          }
        }, 400);
      };
  
      dialog.querySelector('.dialog-confirm')?.addEventListener('click', () => cleanup(true));
      dialog.querySelector('.dialog-cancel')?.addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });
    });
  }

  private attachDeleteButton(messageEl: HTMLElement, msgId: string, convId: string): void {
    if (!msgId || !convId) return;
  
    const delBtn = document.createElement('button');
    delBtn.className = 'message-delete-btn';
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.title = '删除消息';
    delBtn.setAttribute('aria-label', '删除消息');
  
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
  
      if (!confirm('确认删除该消息？')) return;
  
      delBtn.disabled = true;
  
      try {
        await api.deleteMessage(convId, msgId, 'true');
  
        messageEl.classList.add('removing');
  
        const onAnimationEnd = () => {
          messageEl.removeEventListener('animationend', onAnimationEnd);
          messageEl.remove();
        };
        messageEl.addEventListener('animationend', onAnimationEnd, { once: true });
  
        setTimeout(() => {
          if (messageEl.parentNode) messageEl.remove();
        }, 500);
  
      } catch (err) {
        console.error('删除消息失败:', err);
        alert('删除失败，请重试');
        delBtn.disabled = false;
      }
    });
  
    messageEl.appendChild(delBtn);
  }

}


document.addEventListener('DOMContentLoaded', () => {

  const treeMode = new TreeMode('TreeMode');
  (window as any).treeMode = treeMode;
});