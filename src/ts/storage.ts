import * as api from './api'
import * as main from './main'
import * as notif from './tool/notification'

interface Config {
  id: string;               
  name: string;
  provider: string;
  api_key: string | null;  
  base_url: string | null;
  model_name: string | null;
  temperature: number;      
}

type SettingValue = boolean | number;

interface BaseSettingDef<T extends SettingValue> {
  key: string;
  label: string;
  description: string;
  loadValue: () => Promise<T | null>;
  saveValue: (value: T) => void | Promise<void>;
}

export interface BooleanSettingDef extends BaseSettingDef<boolean> {
  type: 'boolean';
}

export interface NumberSettingDef extends BaseSettingDef<number> {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;  
}

export type TreeModeSettingDef = BooleanSettingDef | NumberSettingDef;

const filePathInfo = document.querySelector(".file_path_info")
const filePathInfo_p = filePathInfo!.querySelector("p");
const saveConfigBtn = document.getElementById("saveConfigBtn")
const clearBtn = document.getElementById('clearModalBtn') as HTMLButtonElement;

const switchTitle = document.getElementById('switchTitle') as HTMLDivElement | null;
const switchLine = document.getElementById('switchLine') as HTMLDivElement | null;
const switchOff = document.getElementById('switchOff') as HTMLSpanElement | null;
const switchOn = document.getElementById('switchOn') as HTMLSpanElement | null;
const switchChunk = document.getElementById('switchChunk') as HTMLDivElement | null;

const treeModeSettings: TreeModeSettingDef[] = [
  {
    type: 'boolean',
    key: 'TreeModeAutoTopicRelevance',
    label: 'TreeMode 自动话题关联',
    description:
      '自动根据用户对话内容判断是否应该创建新的子节点与其对应的新主题。开启后，系统会在合适的时机提示创建新主题节点。',
    loadValue: async () => await loadTreeModeAutoTopicRelevance(),
    saveValue: async (value: boolean) =>
      window.pywebview.api.TreeModeAutoTopicRelevance_switch(value),
  },
  {
    type: 'number',
    key: 'SummaryTriggerThreshold',
    label: 'SummaryTriggerThreshold 对话摘要触发值',
    description:
    '达到该数值后，后端会自动总结前文作为摘要，摘要有助于节省token，以及帮助树状图模式更好理解前后节点的内容',
    min: 0,
    max: 50,
    step: 5,
    loadValue: async () => await loadSummaryTriggerThreshold(),
    saveValue: async (value: number) => {
      window.pywebview.api.updateSummaryTriggerThreshold(value)
    }
  },
  {
    type: 'number',
    key: 'RecentKeepTurns',
    label: 'RecentKeepTurns 摘要保留值',
    description:
    '后端总结前往作为摘要时，该数字会保留最后该值数的轮次对话不被纳为总结范围之内',
    min: 0,
    max: 25,
    step: 1,
    loadValue: async () => await loadRecentKeepTurns(),
    saveValue: async (value: number) => {
      window.pywebview.api.updateRecentKeepTurns(value)
    }
  }
  // 示例
  // {
  //   key: 'TreeModeAnotherSetting',
  //   label: '其他设置',
  //   description: '...',
  //   loadValue: () => window.pywebview.api.load_XXX(),
  //   saveValue: (v) => window.pywebview.api.XXX_switch(v),
  // },
];

let hoverTimer: number | null = null;
let isOn: boolean;
let active_config_id: string; 


async function loadConfig() {
    try {
        const ReadingSavePath = await window.pywebview.api.readSavePath();
        const targetP = filePathInfo?.querySelector("p");
        if (targetP) {
            targetP.textContent = `配置文件保存路径：${ReadingSavePath}`;
        }
    } catch (error) {
        console.error("加载配置失败：", error);
    }
}
async function saveConfigPath(modifiedPath: string){
    try{
        const res = await window.pywebview.api.saveConfigPath(modifiedPath)
        if(res) {
            filePathInfo_p!.style.setProperty('--pseudo-color', '#7FFF00');
            filePathInfo_p!.textContent = `配置文件保存路径：${modifiedPath}`
        } else {
            filePathInfo_p!.style.setProperty('--pseudo-color', '#FF2400');
            filePathInfo_p!.textContent = `保存为${modifiedPath}出现错误！`
        }

    } catch (error) {
        console.error("保存路径配置失败：", error);
    }
}


async function active_config() {
  let piece = document.querySelector<HTMLElement>(`[data-id="${active_config_id}"]`)
  if(!piece) return;
  piece.classList.add('active-config');
}
async function get_active_config_id(){
  active_config_id = await api.getActiveConfig()
}


async function loadConfigAvailableDetect() {
    try {
        let res = await window.pywebview.api.load_ConfigAvailableDetect();
        if(res == null){return};
        isOn = res
        toggleSwitch(isOn);
    } catch (error) {
        console.error("加载ConfigAvailableDetect失败：", error);
    }
}

async function loadTreeModeAutoTopicRelevance(): Promise< boolean| null> {
  try {
    let res = await window.pywebview.api.load_TreeModeAutoTopicRelevance();
    return res 
  } catch (error) {
    console.error("加载TreeModeAutoTopicRelevance失败：", error);
  }
  return null
}

async function loadSummaryTriggerThreshold() {
  try {
    let res = await window.pywebview.api.load_SummaryTriggerThreshold();
    return res 
  } catch (error) {
    console.error("加载TreeModeAutoTopicRelevance失败：", error);
  }
  return null
}

async function loadRecentKeepTurns() {
  try {
    let res = await window.pywebview.api.load_RecentKeepTurns();
    return res 
  } catch (error) {
    console.error("加载TreeModeAutoTopicRelevance失败：", error);
  }
  return null
}


function clearAddConfigForm(): void {
  const nameInput = document.getElementById('cfgName') as HTMLInputElement;
  const providerSelect = document.getElementById('cfgProvider') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('cfgAPIKey') as HTMLInputElement;
  const baseUrlInput = document.getElementById('cfgBaseUrl') as HTMLInputElement;
  const modelNameInput = document.getElementById('cfgModelName') as HTMLInputElement;
  const tempInput = document.getElementById('cfgTemperature') as HTMLInputElement;

  if (nameInput) nameInput.value = '';
  if (providerSelect) providerSelect.selectedIndex = 0; // 重置为第一个选项
  if (apiKeyInput) apiKeyInput.value = '';
  if (baseUrlInput) baseUrlInput.value = '';
  if (modelNameInput) modelNameInput.value = '';
  if (tempInput) tempInput.value = '0.7';
}


if ((window as any).pywebview?.api) {
    loadConfig();
    loadConfigAvailableDetect();
    loadTreeModeAutoTopicRelevance();
    loadSummaryTriggerThreshold();
    loadRecentKeepTurns();
} else {
    window.addEventListener("pywebviewready", loadConfig, { once: true });
    window.addEventListener("pywebviewready", loadConfigAvailableDetect, { once: true });
    window.addEventListener("pywebviewready", loadTreeModeAutoTopicRelevance, { once: true });
    window.addEventListener("pywebviewready", loadSummaryTriggerThreshold, { once: true });
    window.addEventListener("pywebviewready", loadRecentKeepTurns, { once: true });
}

filePathInfo?.addEventListener('click', async () => {
    if(window.pywebview && window.pywebview.api) {
        try {
            const folderPath = await window.pywebview.api.open_folder_dialog();

            if (folderPath) {
                await saveConfigPath(folderPath)
                loadConfig();
                loadConfigAvailableDetect();
                await main.loadConfigs();
                await get_active_config_id();
                await active_config
            } else {
                await loadConfig()
            }
        } catch (error) {
            console.error('调用 Python 方法失败:', error);
            filePathInfo!.textContent = "发生错误"

        }
    } else {
        console.warn("pywebview API 未就绪");
    }
})

saveConfigBtn?.addEventListener("click", async () => {
    try {
        const config: Config = {
            id: "",
            name: (document.getElementById('cfgName') as HTMLInputElement).value,
            provider: (document.getElementById('cfgProvider') as HTMLInputElement).value,
            api_key: (document.getElementById('cfgAPIKey') as HTMLInputElement).value,
            base_url: (document.getElementById('cfgBaseUrl') as HTMLInputElement).value ,
            model_name: (document.getElementById('cfgModelName') as HTMLInputElement).value,
            temperature: parseFloat((document.getElementById('cfgTemperature') as HTMLInputElement).value) || 0.7
        };
        
        try {

            let res = await api.createConfig(config);

            notif.showToast(`配置已保存，返回${res}`, '#39FF14');

            clearAddConfigForm();
            await main.loadConfigs();
        } catch (error) {
            notif.showToast(`配置保存失败，请检查填写的字段`,'#ff6b6b')
            setTimeout(() => {notif.showToast(`错误返回${error}`,'#ff6b6b')}, 2000)
        }
    } catch (error) {
        console.error("构建config失败，字段填写不完整", error);
        notif.showToast('保存失败，请检查字段', '#ff6b6b');
    }
})

clearBtn?.addEventListener('click', () => {
  clearAddConfigForm();
  notif.showToast('已清空表单', '#888'); 
});

function updateSwitchUI() {
  if (!switchLine || !switchTitle) return;
  switchLine.classList.remove('state-off', 'state-on');
  if (isOn) {
    switchLine.classList.add('state-on');
    switchTitle.dataset.state = 'on';
  } else {
    switchLine.classList.add('state-off');
    switchTitle.dataset.state = 'off';
  }
}

async function toggleSwitch(newState?: boolean) {
  if (newState !== undefined) {
    isOn = newState;
  } else {
    isOn = !isOn;
  }
  updateSwitchUI();

  try {
    await window.pywebview.api.ConfigAvailableDetect_switch(isOn)
  } catch (error) {
    console.error("切换ConfigAvailableDetect出错", error);
  }
  
  window.dispatchEvent(new CustomEvent('configCheckToggle', { detail: { enabled: isOn } }));
}


if (switchOff) {
  switchOff.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOn) toggleSwitch(false);
  });
}

if (switchOn) {
  switchOn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isOn) toggleSwitch(true);
  });
}

function showChunk() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (switchChunk) {
    switchChunk.classList.add('expanded');
  }
}

function hideChunk() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }
  hoverTimer = window.setTimeout(() => {
    if (switchChunk) {
      switchChunk.classList.remove('expanded');
    }
    hoverTimer = null;
  }, 200); 
}

if (switchTitle) {
  switchTitle.addEventListener('mouseenter', showChunk);
  switchTitle.addEventListener('mouseleave', hideChunk);
}
if (switchChunk) {
  switchChunk.addEventListener('mouseenter', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    switchChunk.classList.add('expanded');
  });
  switchChunk.addEventListener('mouseleave', hideChunk);
}

async function initTreeModeSettings() {
  const container = document.getElementById('treeModeSettingsContainer');
  if (!container) {
    console.warn('未找到 treeModeSettingsContainer');
    return;
  }
  container.innerHTML = '';

  for (const def of treeModeSettings) {
    // 根据 type 分发到不同的构造函数
    const item = def.type === 'boolean'
      ? createBooleanSettingItem(def)
      : createNumberSettingItem(def);

    container.appendChild(item);

    try {
      const value = await def.loadValue();
      if (def.type === 'boolean') {
        updateToggleUI(item, value === true);
      } else {
        updateNumberUI(item, def, typeof value === 'number' ? value : def.min ?? 0);
      }
    } catch (e) {
      console.error(`加载设置 ${def.key} 失败`, e);
      // 失败时使用默认值
      if (def.type === 'boolean') {
        updateToggleUI(item, false);
      } else {
        updateNumberUI(item, def, def.min ?? 0);
      }
    }
  }
}

function createBooleanSettingItem(def: BooleanSettingDef): HTMLElement {
  const item = document.createElement('div');
  item.className = 'tree-setting-item';
  item.dataset.key = def.key;
  item.dataset.type = 'boolean';

  item.innerHTML = `
    <div class="tree-setting-header">
      <span class="tree-setting-label">${def.label}</span>
      <div class="tree-setting-toggle" data-state="off">
        <span class="toggle-label toggle-off">关</span>
        <div class="toggle-track">
          <div class="toggle-thumb"></div>
        </div>
        <span class="toggle-label toggle-on">开</span>
      </div>
    </div>
    <div class="tree-setting-desc">${def.description}</div>
  `;

  const toggle = item.querySelector('.tree-setting-toggle') as HTMLElement;

  toggle.addEventListener('click', async (e) => {
    e.stopPropagation();

    const currentState = toggle.dataset.state === 'on';
    const newState = !currentState;

    // 乐观更新
    toggle.dataset.state = newState ? 'on' : 'off';

    try {
      await def.saveValue(newState);
      console.log(`设置 ${def.key} 已更新为: ${newState}`);
    } catch (err) {
      console.error(`保存设置 ${def.key} 失败`, err);
      // 回滚
      toggle.dataset.state = currentState ? 'on' : 'off';
    }
  });

  return item;
}

function createNumberSettingItem(def: NumberSettingDef): HTMLElement {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const step = def.step ?? 1;
  const unit = def.unit ?? '';

  const item = document.createElement('div');
  item.className = 'tree-setting-item';
  item.dataset.key = def.key;
  item.dataset.type = 'number';

  item.innerHTML = `
    <div class="tree-setting-header">
      <span class="tree-setting-label">${def.label}</span>
      <div class="tree-setting-number">
        <button class="num-btn minus" type="button" aria-label="减少">−</button>
        <div class="num-track-wrapper">
          <div class="num-track">
            <div class="num-fill"></div>
          </div>
          <div class="num-thumb"></div>
          <div class="num-value">0${unit}</div>
        </div>
        <button class="num-btn plus" type="button" aria-label="增加">+</button>
      </div>
    </div>
    <div class="tree-setting-desc">${def.description}</div>
  `;

  const wrapper = item.querySelector('.tree-setting-number') as HTMLElement;
  const minusBtn = item.querySelector('.num-btn.minus') as HTMLButtonElement;
  const plusBtn = item.querySelector('.num-btn.plus') as HTMLButtonElement;
  const trackWrapper = item.querySelector('.num-track-wrapper') as HTMLElement;
  const fill = item.querySelector('.num-fill') as HTMLElement;
  const thumb = item.querySelector('.num-thumb') as HTMLElement;
  const valueDisplay = item.querySelector('.num-value') as HTMLElement;

  let currentValue = min;
  let isDragging = false;

  // ---- 更新 UI（进度条宽度、手柄位置、数值显示） ----
  function renderValue(value: number) {
    // 边界约束
    value = Math.max(min, Math.min(max, value));
    currentValue = value;

    const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

    fill.style.width = percent + '%';
    thumb.style.left = percent + '%';
    valueDisplay.textContent = `${value}${unit}`;

    // 禁用边界按钮
    minusBtn.disabled = value <= min;
    plusBtn.disabled = value >= max;
  }

  let saveTimer: number | null = null;

  async function saveValue(value: number, immediate = false) {
    if (saveTimer) clearTimeout(saveTimer);

    const doSave = async () => {
      wrapper.classList.add('saving');
      try {
        await def.saveValue(value);
        wrapper.classList.remove('saving');
        wrapper.classList.add('saved');
        setTimeout(() => wrapper.classList.remove('saved'), 600);
        console.log(`设置 ${def.key} 已更新为: ${value}`);
      } catch (err) {
        console.error(`保存设置 ${def.key} 失败`, err);
        wrapper.classList.remove('saving');
      }
    };

    if (immediate) {
      await doSave();
    } else {
      saveTimer = window.setTimeout(doSave, 300);
    }
  }

  minusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentValue <= min) return;
    const newValue = Math.max(min, currentValue - step);
    renderValue(newValue);
    saveValue(newValue);
  });

  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentValue >= max) return;
    const newValue = Math.min(max, currentValue + step);
    renderValue(newValue);
    saveValue(newValue);
  });

  function valueFromEvent(e: MouseEvent | PointerEvent): number {
    const rect = trackWrapper.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // 对齐到最近的 step
    const rawValue = min + ratio * (max - min);
    const stepped = Math.round(rawValue / step) * step;
    return Math.max(min, Math.min(max, stepped));
  }

  trackWrapper.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    isDragging = true;
    wrapper.classList.add('editing');
    const newValue = valueFromEvent(e);
    renderValue(newValue);
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging) return;
      const v = valueFromEvent(ev);
      renderValue(v);
    };
    const onUp = (ev: MouseEvent) => {
      isDragging = false;
      wrapper.classList.remove('editing');
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // 拖动结束立即保存
      saveValue(currentValue, true);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  trackWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      if (currentValue < max) {
        const v = Math.min(max, currentValue + step);
        renderValue(v);
        saveValue(v);
      }
    } else {
      if (currentValue > min) {
        const v = Math.max(min, currentValue - step);
        renderValue(v);
        saveValue(v);
      }
    }
  }, { passive: false });

  renderValue(min);

  return item;
}

function updateToggleUI(item: HTMLElement, isOn: boolean) {
  const toggle = item.querySelector('.tree-setting-toggle') as HTMLElement;
  if (toggle) {
    toggle.dataset.state = isOn ? 'on' : 'off';
  }
}

function updateNumberUI(item: HTMLElement, def: NumberSettingDef, value: number) {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const unit = def.unit ?? '';

  const fill = item.querySelector('.num-fill') as HTMLElement;
  const thumb = item.querySelector('.num-thumb') as HTMLElement;
  const valueDisplay = item.querySelector('.num-value') as HTMLElement;
  const minusBtn = item.querySelector('.num-btn.minus') as HTMLButtonElement;
  const plusBtn = item.querySelector('.num-btn.plus') as HTMLButtonElement;

  const clamped = Math.max(min, Math.min(max, value));
  const percent = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  fill.style.width = percent + '%';
  thumb.style.left = percent + '%';
  valueDisplay.textContent = `${clamped}${unit}`;

  minusBtn.disabled = clamped <= min;
  plusBtn.disabled = clamped >= max;
}

const Setting1 = document.getElementById("Setting1") as HTMLDivElement
Setting1.addEventListener("click", async () => {
  console.log("setting1");
  await initTreeModeSettings();
})

