import { Modal, App, Setting, Notice } from 'obsidian';
import { TranslatorType, LanguageCode, TranslationRequest } from '../types';
import { TranslatorFactory } from '../translator';
import { GlobalTranslationResultModal } from './global-translation-modal';
import { ConfigService } from '../services';

/**
 * 翻译输入弹窗
 * 用于在没有选中文本时让用户输入要翻译的内容
 */
export class TranslationInputModal extends Modal {
  private inputEl!: HTMLTextAreaElement;
  private translatorSelect!: HTMLSelectElement;
  private languageSelect!: HTMLSelectElement;
  private translateButton!: HTMLButtonElement;
  
  private selectedTranslator: TranslatorType = TranslatorType.OPENAI;
  private inputText: string = '';
  private targetLanguage: LanguageCode = LanguageCode.ZH_CN;
  private translatorFactory: TranslatorFactory;
  private configService: ConfigService;
  
  constructor(app: App, configService: ConfigService) {
    super(app);
    this.translatorFactory = TranslatorFactory.getInstance();
    this.configService = configService;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // 设置弹窗标题
    contentEl.createEl('h2', { text: '文本翻译' });
    
    // 输入区域
    const inputSection = contentEl.createDiv('input-section');
    inputSection.createEl('label', { text: '请输入要翻译的文本：' });
    
    this.inputEl = inputSection.createEl('textarea', {
      cls: 'translation-input',
      attr: {
        placeholder: '在此输入要翻译的文本...',
        rows: '6'
      }
    });
    
    this.inputEl.addEventListener('input', (e) => {
      this.inputText = (e.target as HTMLTextAreaElement).value;
      this.updateTranslateButton();
    });
    
    // 支持Tab键缩进
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.inputEl.selectionStart;
        const end = this.inputEl.selectionEnd;
        const value = this.inputEl.value;
        
        // 插入Tab字符
        this.inputEl.value = value.substring(0, start) + '\t' + value.substring(end);
        this.inputEl.selectionStart = this.inputEl.selectionEnd = start + 1;
        
        // 更新内部状态
        this.inputText = this.inputEl.value;
        this.updateTranslateButton();
      }
    });
    
    // 翻译器选择
    new Setting(contentEl)
      .setName('翻译器')
      .setDesc('选择要使用的翻译器')
      .addDropdown(dropdown => {
        dropdown
          .addOption(TranslatorType.OPENAI, 'OpenAI')
          .addOption(TranslatorType.CUSTOM, '自定义接口')
          .setValue(this.selectedTranslator)
          .onChange(value => {
            this.selectedTranslator = value as TranslatorType;
          });
      });
    
    // 目标语言选择
    new Setting(contentEl)
      .setName('目标语言')
      .setDesc('选择翻译的目标语言')
      .addDropdown(dropdown => {
        dropdown
          .addOption('zh', '中文')
          .addOption('en', '英文')
          .addOption('ja', '日文')
          .addOption('ko', '韩文')
          .addOption('fr', '法文')
          .addOption('de', '德文')
          .addOption('es', '西班牙文')
          .addOption('ru', '俄文')
          .setValue(this.targetLanguage)
          .onChange(value => {
            this.targetLanguage = value as LanguageCode;
          });
      });
    
    // 错误信息显示区域
    const errorContainer = contentEl.createDiv('error-container');
    const errorEl = errorContainer.createEl('div', {
      cls: 'translation-error',
      attr: { style: 'display: none;' }
    });
    
    // 操作按钮
    const buttonContainer = contentEl.createDiv('button-container');
    
    // 翻译按钮
    this.translateButton = buttonContainer.createEl('button', {
      text: '翻译',
      cls: 'mod-cta'
    });
    this.translateButton.disabled = true;
    this.translateButton.addEventListener('click', () => {
      this.performTranslation();
    });
    
    // 取消按钮
    const cancelButton = buttonContainer.createEl('button', {
      text: '取消'
    });
    cancelButton.addEventListener('click', () => {
      this.close();
    });
    
    // 添加样式
    this.addStyles();
    
    // 聚焦到输入框
    setTimeout(() => {
      this.inputEl.focus();
    }, 100);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private updateTranslateButton() {
    this.translateButton.disabled = !this.inputText.trim();
  }

  /**
   * 执行翻译
   */
  private async performTranslation(): Promise<void> {
    const inputText = this.inputEl.value;
    
    if (!inputText.trim()) {
      new Notice('请输入要翻译的文本');
      return;
    }
    
    // 显示加载状态
    this.translateButton.disabled = true;
    this.translateButton.textContent = '翻译中...';
    
    try {
      // 获取配置
      const config = this.configService.getSettings();
      const translatorConfig = config.translators?.[this.selectedTranslator];
      
      if (!translatorConfig) {
        throw new Error(`未找到翻译器 ${this.selectedTranslator} 的配置`);
      }
      
      // 获取翻译器实例
      const translator = await this.translatorFactory.createTranslatorAsync(this.selectedTranslator, translatorConfig);
      
      if (!translator) {
        throw new Error('无法创建翻译器实例');
      }
      
      // 构建翻译请求
      const request: TranslationRequest = {
        text: inputText,
        sourceLang: LanguageCode.AUTO,
        targetLang: this.targetLanguage,
        translator: this.selectedTranslator
      };
      
      const result = await translator.translate(request);
      
      // 关闭当前弹窗
      this.close();
      
      // 显示翻译结果
      const resultModal = new GlobalTranslationResultModal(
        this.app,
        inputText,
        result.translatedText || '翻译失败'
      );
      resultModal.open();
      
    } catch (error) {
      console.error('Translation failed:', error);
      const errorEl = this.contentEl.querySelector('.translation-error') as HTMLElement;
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = `翻译失败: ${error instanceof Error ? error.message : '未知错误'}`;
      }
    } finally {
      // 恢复按钮状态
      this.translateButton.disabled = false;
      this.translateButton.textContent = '翻译';
    }
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .translation-input-modal .modal-content {
        max-width: 500px;
        min-width: 400px;
      }
      
      .input-section {
        margin-bottom: 20px;
      }
      
      .input-section label {
        display: block;
        margin-bottom: 8px;
        color: var(--text-normal);
        font-weight: 500;
      }
      
      .translation-input {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        background: var(--background-primary);
        color: var(--text-normal);
        font-family: var(--font-text);
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        min-height: 120px;
        box-sizing: border-box;
      }
      
      .translation-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
        box-shadow: 0 0 0 2px var(--interactive-accent-hover);
      }
      
      .translation-input::placeholder {
        color: var(--text-muted);
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
        font-size: 14px;
      }
      
      .button-container button:hover:not(:disabled) {
        background: var(--interactive-hover);
      }
      
      .button-container button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .button-container button.mod-cta {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
      }
      
      .button-container button.mod-cta:hover:not(:disabled) {
        background: var(--interactive-accent-hover);
      }
      
      .error-container {
        margin: 10px 0;
      }
      
      .translation-error {
        padding: 8px 12px;
        border-radius: 4px;
        background: var(--background-modifier-error);
        border: 1px solid var(--background-modifier-error-border);
        color: var(--text-error);
        font-size: 13px;
        margin-bottom: 10px;
      }
    `;
    
    document.head.appendChild(style);
    
    // 为弹窗添加类名
    this.modalEl.addClass('translation-input-modal');
  }
}