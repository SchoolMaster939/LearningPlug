import * as api from './api'
import * as mermaid from './render/mermaid-utils'
import * as code from './render/code-utils'
import { initTurnsSelector } from './tool/turnsSelector'
import DOMPurify from 'dompurify';


const SidebarButton = document.querySelectorAll("#Nav-box")[0]
const TreeModeButton = document.querySelectorAll("#Nav-box")[1]
const SettingButton = document.querySelectorAll("#Nav-box")[2]

const Sidebar = document.querySelector(".Left") as HTMLDivElement
const Setting = document.querySelector(".Setting") as HTMLDivElement
const Main = document.querySelector("main") as HTMLDivElement
const TreeMode = document.querySelector(".TreeMode") as HTMLDivElement

const convList = document.getElementById('convList') as HTMLDivElement;
const newConvBtn = document.getElementById('newConvBtn') as HTMLButtonElement;
const chatTitle = document.getElementById('chatTitle') as HTMLSpanElement;
const chatMessages = document.getElementById('chatMessages') as HTMLDivElement;
const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;

const treeModeLeft = document.querySelector('.TreeModeLeft') as HTMLDivElement | null
const widthHandle = document.querySelector('.widthHandle') as HTMLDivElement | null;

const turnsSelectorEl = document.getElementById('chatTurnsSelector');
if (turnsSelectorEl) {
  initTurnsSelector(turnsSelectorEl);
}


interface Config {
  id: string;               
  name: string;
  provider: string;
  api_key: string | null;  
  base_url: string | null;
  model_name: string | null;
  temperature: number;  
  usability: boolean | null;    
}



let configs: Config[] = [];
let active_config_id: string; 

let conversations: any[] = [];
let currentConvId: string | null = null;

var SidebarSwitch = 0;
type PanelType = 'setting' | 'tree' | null;
let activePanel: PanelType = null;


export async function loadConfigs() {
  configs = await api.getConfigs();
  renderList();
  await active_config();
}

async function active_config() {
  let piece = document.querySelector<HTMLElement>(`[data-id="${active_config_id}"]`)
  if(!piece) return;
  piece.classList.add('active-config');
}

async function get_active_config_id(){
  active_config_id = await api.getActiveConfig()
}

function renderList() {
  const list = document.getElementById("config-list");
  if (!list) return;
  list.innerHTML = '';

  configs.forEach((cfg) => {
    const piece = document.createElement('div');
    piece.className = 'Setting-piece config-item';
    piece.dataset.id = cfg.id;
    piece.id = `config-${cfg.id}`;

    const fields = document.createElement('div');
    fields.className = 'config-fields';

    const fieldMap: { key: keyof Config; label: string }[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'provider', label: 'Provider' },
      { key: 'api_key', label: 'API Key' },
      { key: 'base_url', label: 'Base URL' },
      { key: 'model_name', label: 'Model' },
      { key: 'temperature', label: 'Temperature' },
      { key: 'usability', label: '状态' },   
    ];

    fieldMap.forEach(({ key, label }) => {
      let rawValue = cfg[key];
      let displayValue = rawValue ?? '';
      let statusClass = '';

      if (key === 'usability') {
        if (rawValue === true) {
          displayValue = '可用';
          statusClass = 'status-available';
        } else if (rawValue === false) {
          displayValue = '不可用';
          statusClass = 'status-unavailable';
        } else {
          displayValue = '未检测';
          statusClass = 'status-unknown';
        }
      }

      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'field';
      fieldDiv.innerHTML = `
        <span class="label">${label}</span>
        <span class="value ${statusClass}">${displayValue}</span>
      `;
      fields.appendChild(fieldDiv);
    });

    piece.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'config-actions';

    const btnSet = document.createElement('button');
    btnSet.className = 'config-btn btn-set-active';
    btnSet.textContent = '设置当前配置';
    actions.appendChild(btnSet);

    const btnEdit = document.createElement('button');
    btnEdit.className = 'config-btn btn-edit';
    btnEdit.textContent = '修改';
    actions.appendChild(btnEdit);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'config-btn btn-delete';
    btnDelete.textContent = '删除';
    actions.appendChild(btnDelete);

    piece.appendChild(actions);
    list.appendChild(piece);
  });

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('.btn-set-active').forEach((btn) => {
    btn.removeEventListener('click', handleSetActive)
    btn.addEventListener('click', handleSetActive);
  });

  // 2. 修改按钮
  document.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.removeEventListener('click', handleEdit);
    btn.addEventListener('click', handleEdit);
  });

  // 3. 删除按钮
  document.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.removeEventListener('click', handleDelete);
    btn.addEventListener('click', handleDelete);
  });
}

function handleSetActive(this: HTMLButtonElement, e: Event) {
  e.stopPropagation();
  const piece = this.closest('.Setting-piece.config-item') as HTMLDivElement;
  if (!piece) return;

  document.querySelectorAll('.Setting-piece.config-item.active-config').forEach((el) => {
    el.classList.remove('active-config');
  });

  piece.classList.add('active-config');
  if (piece.dataset.id) {
    const res = api.setActiveConfig(piece.dataset.id);
    console.log(res);
  } else {
    console.error("该配置id不存在，可能是json文件损坏");
  }
}

function handleEdit(this: HTMLButtonElement) {
  const piece = this.closest('.Setting-piece.config-item') as HTMLDivElement;
  if (!piece) return;
  const id = piece.dataset.id;
  if (!id) {
    console.error("删除对象ID为空！");
    return
  }const config = configs.find((c) => c.id === id);
  if (!config) {
    console.error("未找到配置数据");
    return;
  }

  // 打开修改对话框
  openEditModal(config);
}

async function handleDelete(this: HTMLButtonElement) {
  const piece = this.closest('.Setting-piece.config-item') as HTMLDivElement;
  if (!piece) return;

  if (!confirm('确认删除该配置？')) return;

  if (piece.classList.contains('active-config')) {
    piece.classList.remove('active-config');
  }
  const id = piece.dataset.id;
  if (!id) {
    console.error("删除对象ID为空！");
    return
  }
  const res = await api.deleteConfig(id);

  console.log(res);
  
  piece.style.transition = 'all 0.35s ease';
  piece.style.opacity = '0';
  piece.style.transform = 'translateX(-30px) scale(0.95)';
  piece.style.maxHeight = '0';
  piece.style.marginBottom = '0';
  piece.style.padding = '0 3%';
  piece.style.overflow = 'hidden';

  setTimeout(() => {
    const id = piece.dataset.id;
    const index = configs.findIndex((c) => c.id === id);
    if (index !== -1) {
      configs.splice(index, 1);
    }
    piece.remove();
  }, 400);
}

function openEditModal(config: Config) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-box';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = '修改配置';
  modal.appendChild(title);

  const form = document.createElement('form');
  form.className = 'modal-form';

  const fieldDefs: { key: keyof Config; label: string; type: string; readonly?: boolean; options?: string[] }[] = [
    { key: 'id', label: 'ID', type: 'text', readonly: true },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'provider', label: 'Provider', type: 'select', options: ['deepseek', 'openai', 'ollama'] },
    { key: 'api_key', label: 'API Key', type: 'text' },
    { key: 'base_url', label: 'Base URL', type: 'text' },
    { key: 'model_name', label: 'Model', type: 'text' },
    { key: 'temperature', label: 'Temperature', type: 'number' },
  ];


  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};

  fieldDefs.forEach((def) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-field';

    const label = document.createElement('label');
    label.className = 'modal-label';
    label.textContent = def.label;
    wrapper.appendChild(label);

    let input: HTMLInputElement | HTMLSelectElement;
    if (def.type === 'select' && def.options) {
      input = document.createElement('select');
      def.options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
      input.value = config[def.key]?.toString() || '';
    } else {
      input = document.createElement('input');
      input.type = def.type;
      if (def.type === 'number') {
        input.step = '0.1';
      }
      input.value = config[def.key]?.toString() ?? '';
    }

    input.className = 'modal-input';
    if (def.readonly) {
      input.disabled = true;
    }

    wrapper.appendChild(input);
    form.appendChild(wrapper);
    inputs[def.key] = input;
  });

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const btnSave = document.createElement('button');
  btnSave.type = 'submit';
  btnSave.className = 'modal-btn modal-btn-save';
  btnSave.textContent = '保存';
  actions.appendChild(btnSave);

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'modal-btn modal-btn-cancel';
  btnCancel.textContent = '取消';
  actions.appendChild(btnCancel);

  form.appendChild(actions);
  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('modal-active');
  });

  function closeModal() {
    overlay.classList.remove('modal-active');
    overlay.addEventListener('transitionend', function onEnd() {
      overlay.removeEventListener('transitionend', onEnd);
      overlay.remove();
    }, { once: true });
    setTimeout(() => {
      if (overlay.parentNode) overlay.remove();
    }, 500);
  }


  btnCancel.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updated: Config = {
      id: config.id,
      name: inputs.name.value.trim(),
      provider: inputs.provider.value,
      api_key: inputs.api_key.value || null,
      base_url: inputs.base_url.value || null,
      model_name: inputs.model_name.value || null,
      temperature: parseFloat(inputs.temperature.value) || 0,
      usability: config.usability,
    };

    if (!updated.name) {
      alert('配置名称不能为空');
      return;
    }

    try {
      await api.updateConfig(config.id, updated);
      await loadConfigs();
      closeModal();
    } catch (err) {
      console.error(err);
      alert('更新失败，请检查字段是否合法');
    }
  });
}

function renderPanel() {
  Main.classList.add('hidden');
  Setting.classList.add('hidden');
  TreeMode.classList.add('hidden');

  if (activePanel === null) {
    Main.classList.remove('hidden');
  } else if (activePanel === 'setting') {
    Setting.classList.remove('hidden');
  } else if (activePanel === 'tree') {
    TreeMode.classList.remove('hidden');
  }
}

SidebarButton.addEventListener("click", function(){
    if (SidebarSwitch) {
        SidebarSwitch = 0
        Sidebar!.style.width = "0%"
        Sidebar!.style.borderRight = "0px solid #212121"
        Sidebar!.style.borderTop = "0px solid #212121"

    } else {
        SidebarSwitch = 1
        Sidebar!.style.width = "30%" 
        Sidebar!.style.borderRight = "2px solid white"
        Sidebar!.style.borderTop = "2px solid white"

    }
})

renderPanel()

SettingButton.addEventListener("click", function () {
  activePanel = activePanel === 'setting' ? null : 'setting';
  renderPanel();
});

TreeModeButton.addEventListener("click", function () {
  activePanel = activePanel === 'tree' ? null : 'tree';
  renderPanel();
});

document.addEventListener('DOMContentLoaded', async () => {
  const titles = document.querySelectorAll<HTMLElement>('.Setting-title');
  titles.forEach((title: HTMLElement): void => {
    title.addEventListener('click', function(this: HTMLElement, e: MouseEvent): void {
      e.stopPropagation();
      let chunk: Element | null = this.nextElementSibling;
      while (chunk && !chunk.classList.contains('Setting-chunk')) {
        chunk = chunk.nextElementSibling;
      }
      if (!chunk) return;
      chunk.classList.toggle('expanded');
      this.classList.toggle('active');
    });
  });

  await get_active_config_id();
  await loadConfigs();
  await active_config();
});


async function loadConversations() {
  try {
    conversations = await api.getConversations();
    renderConvList();
    if (!currentConvId && conversations.length > 0) {
      const first = conversations[0];
      currentConvId = first.id;
      chatTitle.textContent = first.title || '未命名会话';
      await loadConversationMessages(first.id);
    } else if (conversations.length === 0) {
      chatTitle.textContent = '选择或新建会话';
      chatMessages.innerHTML = '';
    }
    highlightCurrent();
  } catch (e) {
    console.error('加载会话列表失败', e);
  }
}

function renderConvList() {
  convList.innerHTML = '';
  conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conv-item';
    item.dataset.id = conv.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'conv-name';
    nameSpan.textContent = conv.title || '未命名会话';
    item.appendChild(nameSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'conv-delete-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConv(conv.id);
    });
    item.appendChild(delBtn);

    item.addEventListener('click', () => {
      switchConversation(conv.id);
    });

    convList.appendChild(item);
  });
  highlightCurrent();
}

function highlightCurrent() {
  document.querySelectorAll('.conv-item').forEach((el) => {
    const id = (el as HTMLDivElement).dataset.id;
    el.classList.toggle('active', id === currentConvId);
  });
}

async function switchConversation(convId: string) {
  if (convId === currentConvId) return;
  currentConvId = convId;
  const conv = conversations.find(c => c.id === convId);
  chatTitle.textContent = conv ? (conv.title || '未命名会话') : '会话';
  await loadConversationMessages(convId);
  highlightCurrent();
}

async function loadConversationMessages(convId: string) {
  try {
    const data = await api.getConversation(convId);
    const messages = data.messages || [];
    renderMessages(messages);
  } catch (e) {
    console.error('加载消息失败', e);
    chatMessages.innerHTML = '<div class="message assistant">加载消息失败</div>';
  }
}

function renderMessages(messages: any[]) {
  chatMessages.innerHTML = '';
  messages.forEach((msg) => {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.id = `${msg.id}`

    if (msg.role === 'assistant') {
      const markdown = msg.content || '';
      const rawHtml = code.marked.parse(markdown) as string;
      div.innerHTML = DOMPurify.sanitize(rawHtml);
      chatMessages.appendChild(div);

      mermaid.renderMermaidBlocks(div, markdown);
      
      code.enhanceCodeBlocks(div)
    } else {
      div.textContent = msg.content;
      chatMessages.appendChild(div);
    }

    if (msg.id && currentConvId) {
      attachDeleteButton(div, msg.id, currentConvId);
    }

  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function attachDeleteButton(messageEl: HTMLElement, msgId: string, convId: string): void {
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
      await api.deleteMessage(convId, msgId, 'false');

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

async function createNewConversation() {
  try {
    const newConv = await api.createConversation();
    conversations.unshift(newConv);
    renderConvList();
    await switchConversation(newConv.id);
    const sidebar = document.querySelector('.Left') as HTMLDivElement;
    if (sidebar && sidebar.style.width !== '30%') {
      const btn = document.querySelectorAll("#Nav-box")[0] as HTMLElement;
      if (btn) btn.click();
    }
  } catch (e) {
    console.error('创建会话失败', e);
    alert('创建会话失败，请重试');
  }
}

async function deleteConv(convId: string) {
  if (!confirm('确认删除此会话？')) return;
  try {
    await api.deleteConversation(convId);
    conversations = conversations.filter(c => c.id !== convId);
    if (currentConvId === convId) {
      currentConvId = null;
      chatTitle.textContent = '选择或新建会话';
      chatMessages.innerHTML = '';
    }
    renderConvList();
  } catch (e) {
    console.error('删除会话失败', e);
    alert('删除失败，请重试');
  }
}

async function sendMessage() {
  const prompt = chatInput.value.trim();
  if (!prompt) return;
  if (!currentConvId) {
    alert('请先选择或新建会话');
    return;
  }

  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'message user';
  userMsgDiv.textContent = prompt;
  chatMessages.appendChild(userMsgDiv);
  chatInput.value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const assistantMsgDiv = document.createElement('div');
  assistantMsgDiv.className = 'message assistant';
  assistantMsgDiv.textContent = '';
  chatMessages.appendChild(assistantMsgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const response = await api.streamChat(prompt, currentConvId);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';

    while (reader) {
      const { done, value } = await reader.read();
      if (done) {

        const rawHtml = code.marked.parse(fullContent) as string;
        assistantMsgDiv.innerHTML = DOMPurify.sanitize(rawHtml);

        // 用公共函数
        mermaid.renderMermaidBlocks(assistantMsgDiv, fullContent);

        code.enhanceCodeBlocks(assistantMsgDiv)
        
        chatMessages.scrollTop = chatMessages.scrollHeight;

        await loadConversationMessages(currentConvId)

        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            continue
          };
          try {
            const parsed = JSON.parse(data);
            const content = parsed.content || '';
            
            fullContent += content;
            const rawHtml = code.marked.parse(fullContent) as string;
            assistantMsgDiv.innerHTML = DOMPurify.sanitize(rawHtml);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } catch (e) {
            
          }
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.content || '';
          fullContent += content;
          const rawHtml = code.marked.parse(fullContent) as string;
          assistantMsgDiv.innerHTML = DOMPurify.sanitize(rawHtml);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error('发送消息失败', e);
    assistantMsgDiv.textContent = '⚠️ 发送失败，请重试';
  }
}

newConvBtn.addEventListener('click', createNewConversation);
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }
});

loadConversations();


let isWidthResizing = false;
let startX = 0;
let startWidth = 0;

widthHandle?.addEventListener('mousedown', (e) => {
  if (!treeModeLeft) return;
  isWidthResizing = true;
  startX = e.clientX;
  startWidth = treeModeLeft.offsetWidth

  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'ew-resize';

  document.addEventListener("mousemove", onWidthMouseMove)
  document.addEventListener("mouseup", onWidthMouseUp)
  e.preventDefault();
})

function onWidthMouseMove (e: MouseEvent) {
    if (!isWidthResizing) return;
    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;
    if (!treeModeLeft) return;
    newWidth = Math.max(400, Math.min(800, newWidth)); 
    treeModeLeft.style.width = newWidth + 'px';
}
function onWidthMouseUp () {
    isWidthResizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onWidthMouseMove);
    document.removeEventListener('mouseup', onWidthMouseUp);
}




