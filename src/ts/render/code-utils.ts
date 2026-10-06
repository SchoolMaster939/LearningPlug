import hljs from 'highlight.js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight'; 
import 'highlight.js/styles/atom-one-dark.css';

export const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string): string {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);
marked.setOptions({
  breaks: true,        
  gfm: true,           
});

hljs.configure({ ignoreUnescapedHTML: true });

export function enhanceCodeBlocks(container: HTMLElement): void {
  const codeElements = container.querySelectorAll<HTMLElement>('pre code');

  codeElements.forEach((codeEl) => {
    if (codeEl.dataset.highlighted === 'true') return;

    if (!codeEl.className.match(/language-/)) {
      codeEl.className = 'language-plaintext';
    }

    try {
      hljs.highlightElement(codeEl);
      codeEl.dataset.highlighted = 'true';
    } catch (err) {
      console.warn('代码高亮失败:', err);
    }
  });

  const preElements = container.querySelectorAll<HTMLPreElement>('pre');

  preElements.forEach((pre) => {
    if (pre.dataset.enhanced === 'true') return;
    pre.dataset.enhanced = 'true';

    const codeEl = pre.querySelector('code');
    if (!codeEl) return;

    const classList = codeEl.className;
    const match = classList.match(/language-(\w+)/);
    const language = match ? match[1] : 'text';
    pre.setAttribute('data-language', language);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', '复制代码');

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      const codeText = codeEl.textContent || '';

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(codeText);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = codeText;
          textarea.style.position = 'fixed';
          textarea.style.top = '-9999px';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }

        copyBtn.textContent = '已复制';
        copyBtn.classList.add('copied');

        setTimeout(() => {
          copyBtn.textContent = '复制';
          copyBtn.classList.remove('copied');
        }, 1500);

      } catch (err) {
        console.error('复制失败:', err);
        copyBtn.textContent = '复制失败';
        setTimeout(() => {
          copyBtn.textContent = '复制';
        }, 1500);
      }
    });

    pre.appendChild(copyBtn);
  });
}