import { App, Modal } from 'obsidian';

/**
 * 全局翻译结果弹窗
 */
export class GlobalTranslationResultModal extends Modal {
  private originalText: string;
  private translatedText: string;

  constructor(app: App, originalText: string, translatedText: string) {
    super(app);
    this.originalText = originalText;
    this.translatedText = translatedText;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // 设置弹窗标题
    contentEl.createEl('h2', { text: '翻译结果' });
    
    // 原文区域
    const originalSection = contentEl.createDiv('translation-section');
    originalSection.createEl('h3', { text: '原文' });
    const originalTextEl = originalSection.createEl('div', {
      cls: 'translation-text original-text'
    });
    this.setFormattedText(originalTextEl, this.originalText);
    
    // 译文区域
    const translatedSection = contentEl.createDiv('translation-section');
    translatedSection.createEl('h3', { text: '译文' });
    const translatedTextEl = translatedSection.createEl('div', {
      cls: 'translation-text translated-text'
    });
    this.setFormattedText(translatedTextEl, this.translatedText);
    
    // 操作按钮
    const buttonContainer = contentEl.createDiv('button-container');
    
    // 复制译文按钮
    const copyButton = buttonContainer.createEl('button', {
      text: '复制译文',
      cls: 'mod-cta'
    });
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(this.translatedText);
      copyButton.textContent = '已复制!';
      setTimeout(() => {
        copyButton.textContent = '复制译文';
      }, 1000);
    });
    
    // 关闭按钮
    const closeButton = buttonContainer.createEl('button', {
      text: '关闭'
    });
    closeButton.addEventListener('click', () => {
      this.close();
    });
    
    // 添加样式
    this.addStyles();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 设置格式化文本，保持换行和段落结构
   */
  private setFormattedText(element: HTMLElement, text: string) {
    // 清空元素
    element.empty();
    
    // 将文本按行分割
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 如果是空行，创建段落间距
      if (line.trim() === '') {
        if (i > 0 && i < lines.length - 1) {
          element.createEl('br');
        }
      } else {
        // 创建文本节点
        const textNode = document.createTextNode(line);
        element.appendChild(textNode);
        
        // 如果不是最后一行，添加换行
        if (i < lines.length - 1) {
          element.createEl('br');
        }
      }
    }
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .global-translation-modal .modal-content {
        max-width: 600px;
        max-height: 80vh;
      }
      
      .translation-section {
        margin-bottom: 20px;
      }
      
      .translation-section h3 {
        margin-bottom: 8px;
        color: var(--text-muted);
        font-size: 14px;
        font-weight: 600;
      }
      
      .translation-text {
        padding: 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        background: var(--background-secondary);
        font-family: var(--font-text);
        line-height: 1.5;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      
      .original-text {
        color: var(--text-normal);
      }
      
      .translated-text {
        color: var(--text-accent);
        font-weight: 500;
      }
      
      .button-container {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
      }
      
      .button-container button {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--interactive-normal);
        color: var(--text-normal);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .button-container button:hover {
        background: var(--interactive-hover);
      }
      
      .button-container button.mod-cta {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
      }
      
      .button-container button.mod-cta:hover {
        background: var(--interactive-accent-hover);
      }
    `;
    
    document.head.appendChild(style);
    
    // 为弹窗添加类名
    this.modalEl.addClass('global-translation-modal');
  }
}