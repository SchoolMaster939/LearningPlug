let pywebviewReadyPromise: Promise<any> | null = null;

function waitForPywebview(): Promise<any> {
  if ((window as any).pywebview?.api) {
    return Promise.resolve((window as any).pywebview);
  }
  if (!pywebviewReadyPromise) {
    pywebviewReadyPromise = new Promise(resolve => {
      const tryResolve = () => {
        if ((window as any).pywebview?.api) {
          resolve((window as any).pywebview);
          return true;
        }
        return false;
      };
      window.addEventListener("pywebviewready", () => resolve((window as any).pywebview), { once: true });
      const timer = setInterval(() => {
        if (tryResolve()) clearInterval(timer);
      }, 100);
    });
  }
  return pywebviewReadyPromise;
}

async function loadTurns(): Promise<number | null> {
  try {
    const pywebview = await waitForPywebview();
    const res = await pywebview.api.load_Turns();
    return typeof res === 'number' ? res : null;
  } catch (error) {
    console.error("加载Turns失败：", error);
    return null;
  }
}

async function updateTurns(turns: number): Promise<boolean> {
  try {
    const pywebview = await waitForPywebview();
    await pywebview.api.updateTurns(turns);
    return true;
  } catch (error) {
    console.error("更新Turns失败：", error);
    return false;
  }
}

export async function initTurnsSelector(selectorEl: HTMLElement): Promise<number> {
  const trigger = selectorEl.querySelector('.turns-trigger') as HTMLButtonElement;
  const valueEl = selectorEl.querySelector('.turns-value') as HTMLSpanElement;
  const options = selectorEl.querySelectorAll<HTMLElement>('.turns-option');

  let currentValue = 10;

  function updateTriggerDisplay(value: number) {
    if (!valueEl) return;
    const unitEl = selectorEl.querySelector('.turns-unit') as HTMLElement;
    if (value === -1) {
      valueEl.textContent = '全部';
      if (unitEl) unitEl.style.display = 'none';
    } else {
      valueEl.textContent = String(value);
      if (unitEl) unitEl.style.display = '';
    }
  }

  function toggleDropdown(open?: boolean) {
    const isOpen = open !== undefined ? open : !selectorEl.classList.contains('open');
    selectorEl.classList.toggle('open', isOpen);
  }

  // ✅ 1. 先同步绑定所有事件（不依赖后端）
  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  options.forEach((opt) => {
    opt.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = parseInt(opt.dataset.value || '10', 10);
      if (Number.isNaN(value)) return;

      currentValue = value;

      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');

      updateTriggerDisplay(value);
      toggleDropdown(false);

      const ok = await updateTurns(value);
      if (!ok) {
        console.warn('轮数写回后端失败，UI 已更新但后端未生效');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!selectorEl.contains(e.target as Node)) {
      toggleDropdown(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleDropdown(false);
    }
  });

  // ✅ 2. 再 await 后端值，用后端值刷新 UI
  //    即使这一步卡住，上面的交互也不受影响
  const backendTurns = await loadTurns();
  if (backendTurns != null) {
    currentValue = backendTurns;
    options.forEach(opt => {
      const v = parseInt(opt.dataset.value || '', 10);
      opt.classList.toggle('active', v === currentValue);
    });
    updateTriggerDisplay(currentValue);
  }

  return currentValue;
}