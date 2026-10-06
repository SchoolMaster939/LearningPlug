import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
});

 
export async function renderMermaid(el: HTMLElement, code: string) {
  const id = `mermaid-${crypto.randomUUID()}`;
  const { svg, bindFunctions } = await mermaid.render(id, code);

  el.innerHTML = '';
  el.classList.add('mermaid-block');

  const viewport = document.createElement('div');
  viewport.className = 'mermaid-viewport';

  const stage = document.createElement('div');
  stage.className = 'mermaid-stage';
  stage.innerHTML = svg;

  viewport.appendChild(stage);
  el.appendChild(viewport);
  bindFunctions?.(el);

  const svgEl = stage.querySelector('svg') as SVGSVGElement | null;
  if (!svgEl) {
    console.warn('[mermaid] no <svg> generated for id:', id);
    return;
  }

  let w = 0;
  let h = 0;
  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2];
      h = parts[3];
    }
  }

  if (!w || !h) {
    try {
      const bbox = svgEl.getBBox();
      w = bbox.width || 600;
      h = bbox.height || 400;
    } catch {
      w = 600;
      h = 400;
    }
  }

  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.style.maxWidth = 'none';
  svgEl.style.width = `${w}px`;
  svgEl.style.height = `${h}px`;
  svgEl.style.display = 'block';
  svgEl.style.userSelect = 'none';

  let scale = 1;
  let tx = 0;
  let ty = 0;

  const MIN = 0.2;
  const MAX = 8;

  const apply = () => {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  viewport.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = Math.min(MAX, Math.max(MIN, scale * factor));
      const k = next / scale;

      tx = mx - k * (mx - tx);
      ty = my - k * (my - ty);
      scale = next;
      apply();
    },
    { passive: false }
  );

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  viewport.addEventListener('pointerdown', (e: PointerEvent) => {

    if (e.button !== 0) return;

    // 点在工具栏上时不启动拖拽
    const target = e.target as HTMLElement;
    if (target.closest('.mermaid-toolbar')) return;

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx;
    startTy = ty;
    viewport.classList.add('dragging');
    viewport.setPointerCapture(e.pointerId);
    });

  viewport.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    apply();
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('dragging');
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {}
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('dblclick', () => {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  });

  // 工具栏
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';
  toolbar.innerHTML = `
    <button type="button" data-act="out" title="缩小">−</button>
    <button type="button" data-act="reset" title="重置">⟲</button>
    <button type="button" data-act="in" title="放大">＋</button>
    <button type="button" data-act="full" title="全屏">⛶</button>
  `;
  viewport.appendChild(toolbar);

  const zoomBy = (factor: number) => {
    const rect = viewport.getBoundingClientRect();
    const ax = rect.width / 2;
    const ay = rect.height / 2;
    const next = Math.min(MAX, Math.max(MIN, scale * factor));
    const k = next / scale;
    tx = ax - k * (ax - tx);
    ty = ay - k * (ay - ty);
    scale = next;
    apply();
  };

  toolbar.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'in') zoomBy(1.25);
    else if (act === 'out') zoomBy(1 / 1.25);
    else if (act === 'reset') {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    } else if (act === 'full') {
      if (document.fullscreenElement === viewport) document.exitFullscreen();
      else viewport.requestFullscreen?.();
    }
  });

  viewport.addEventListener('fullscreenchange', () => {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  });

  apply();
}

export async function renderMermaidBlocks(
  container: HTMLElement,
  fullContent: string
) {
  const sources = [...fullContent.matchAll(/```mermaid\s*([\s\S]*?)```/g)]
    .map(m => m[1].trim());

  if (sources.length === 0) return;

  const codeNodes = container.querySelectorAll<HTMLElement>(
    'pre > code.language-mermaid'
  );

  codeNodes.forEach((codeEl, i) => {
    const src = sources[i];
    if (!src) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-block';
    codeEl.parentElement!.replaceWith(wrapper);

    renderMermaid(wrapper, src).catch(err => {
      console.error('mermaid render error:', err);
      wrapper.textContent = 'Mermaid 渲染失败';
    });
  });
}