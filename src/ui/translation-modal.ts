import { Modal, Setting, ButtonComponent, TextComponent, DropdownComponent } from 'obsidian';
import { TranslatorType, LanguageCode, TranslationRequest, TranslationResponse } from '../types';
import { ContentTranslationService } from '../services';
import { utils } from '../utils';

// 翻译弹窗配置接口
interface ITranslationModalConfig {
  defaultTranslator?: TranslatorType;
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  initialText?: string;
  autoTranslate?: boolean;
}

/**
 * 翻译弹窗组件
 */
export class TranslationModal extends Modal {
  private config: ITranslationModalConfig;
  private contentTranslationService: ContentTranslationService;
  private logger = utils.logger.createChild('TranslationModal');
  
  // UI元素
  private sourceTextArea!: HTMLTextAreaElement;
  private targetTextArea!: HTMLTextAreaElement;
  private sourceLanguageDropdown!: DropdownComponent;
  private targetLanguageDropdown!: DropdownComponent;
  private translatorDropdown!: DropdownComponent;
  private translateButton!: ButtonComponent;
  private copyButton!: ButtonComponent;
  private insertButton!: ButtonComponent;
  private swapButton!: ButtonComponent;
  private clearButton!: ButtonComponent;
  
  // 状态
  private isTranslating = false;
  private currentResult: TranslationResponse | null = null;
  private originalText = '';

  constructor(
    app: any,
    config: ITranslationModalConfig,
    contentTranslationService: ContentTranslationService
  ) {
    super(app);
    this.config = config;
    this.contentTranslationService = contentTranslationService;
  }

  /**
   * 打开弹窗
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    this.createHeader();
    this.createLanguageSelectors();
    this.createTextAreas();
    this.createActionButtons();
    this.createFooter();
    
    // 设置初始值
    this.setInitialValues();
    
    // 绑定事件
    this.bindEvents();
    
    this.logger.info('Translation modal opened');
  }

  /**
   * 关闭弹窗
   */
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.logger.info('Translation modal closed');
  }

  /**
   * 创建标题栏
   */
  private createHeader(): void {
    const headerEl = this.contentEl.createDiv('translation-modal-header');
    headerEl.createEl('h2', { text: '文本翻译' });
    
    // 翻译器选择
    new Setting(headerEl)
      .setName('翻译器')
      .setDesc('选择要使用的翻译服务')
      .addDropdown(dropdown => {
        this.translatorDropdown = dropdown;
        
        // 添加翻译器选项
        const translators = this.getAvailableTranslators();
        translators.forEach(translator => {
          dropdown.addOption(translator.type, translator.name);
        });
        
        dropdown.setValue(this.config.defaultTranslator || 'openai');
        dropdown.onChange(value => {
          this.config.defaultTranslator = value as TranslatorType;
          this.onTranslatorChange();
        });
      });
  }

  /**
   * 创建语言选择器
   */
  private createLanguageSelectors(): void {
    const languageEl = this.contentEl.createDiv('translation-modal-languages');
    
    const languageRow = languageEl.createDiv('language-row');
    
    // 源语言
    const sourceDiv = languageRow.createDiv('language-selector');
    new Setting(sourceDiv)
      .setName('源语言')
      .addDropdown(dropdown => {
        this.sourceLanguageDropdown = dropdown;
        this.populateLanguageOptions(dropdown);
        dropdown.setValue(this.config.sourceLanguage || 'auto');
        dropdown.onChange(value => {
          this.config.sourceLanguage = value as LanguageCode;
        });
      });
    
    // 交换按钮
    const swapDiv = languageRow.createDiv('language-swap');
    new Setting(swapDiv)
      .addButton(button => {
        this.swapButton = button;
        button.setButtonText('⇄')
          .setTooltip('交换语言')
          .onClick(() => this.swapLanguages());
      });
    
    // 目标语言
    const targetDiv = languageRow.createDiv('language-selector');
    new Setting(targetDiv)
      .setName('目标语言')
      .addDropdown(dropdown => {
        this.targetLanguageDropdown = dropdown;
        this.populateLanguageOptions(dropdown, false);
        dropdown.setValue(this.config.targetLanguage || 'zh-CN');
        dropdown.onChange(value => {
          this.config.targetLanguage = value as LanguageCode;
        });
      });
  }

  /**
   * 创建文本区域
   */
  private createTextAreas(): void {
    const textEl = this.contentEl.createDiv('translation-modal-text');
    
    // 源文本区域
    const sourceDiv = textEl.createDiv('text-area-container');
    sourceDiv.createEl('label', { text: '原文' });
    this.sourceTextArea = sourceDiv.createEl('textarea', {
      cls: 'translation-source-text',
      attr: {
        placeholder: '请输入要翻译的文本...',
        rows: '6'
      }
    });
    
    // 目标文本区域
    const targetDiv = textEl.createDiv('text-area-container');
    targetDiv.createEl('label', { text: '译文' });
    this.targetTextArea = targetDiv.createEl('textarea', {
      cls: 'translation-target-text',
      attr: {
        placeholder: '翻译结果将显示在这里...',
        rows: '6',
        readonly: 'true'
      }
    });
  }

  /**
   * 创建操作按钮
   */
  private createActionButtons(): void {
    const actionEl = this.contentEl.createDiv('translation-modal-actions');
    
    const buttonRow = actionEl.createDiv('button-row');
    
    // 翻译按钮
    new Setting(buttonRow)
      .addButton(button => {
        this.translateButton = button;
        button.setButtonText('翻译')
          .setCta()
          .onClick(() => this.performTranslation());
      })
      .addButton(button => {
        this.clearButton = button;
        button.setButtonText('清空')
          .onClick(() => this.clearText());
      });
    
    // 结果操作按钮
    const resultRow = actionEl.createDiv('button-row result-actions');
    resultRow.style.display = 'none';
    
    new Setting(resultRow)
      .addButton(button => {
        this.copyButton = button;
        button.setButtonText('复制译文')
          .onClick(() => this.copyTranslation());
      })
      .addButton(button => {
        this.insertButton = button;
        button.setButtonText('插入到编辑器')
          .onClick(() => this.insertTranslation());
      });
  }

  /**
   * 创建底部信息
   */
  private createFooter(): void {
    const footerEl = this.contentEl.createDiv('translation-modal-footer');
    
    // 统计信息
    const statsEl = footerEl.createDiv('translation-stats');
    statsEl.createSpan({ cls: 'char-count', text: '字符数: 0' });
    
    // 快捷键提示
    const shortcutsEl = footerEl.createDiv('translation-shortcuts');
    shortcutsEl.createSpan({ text: 'Ctrl+Enter: 翻译 | Ctrl+Shift+C: 复制 | Esc: 关闭' });
  }

  /**
   * 设置初始值
   */
  private setInitialValues(): void {
    if (this.config.initialText) {
      this.sourceTextArea.value = this.config.initialText;
      this.originalText = this.config.initialText;
      this.updateCharCount();
      
      // 如果设置了自动翻译，则立即翻译
      if (this.config.autoTranslate) {
        setTimeout(() => this.performTranslation(), 100);
      }
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // 文本输入事件
    this.sourceTextArea.addEventListener('input', () => {
      this.updateCharCount();
      this.clearResult();
    });
    
    // 键盘快捷键
    this.sourceTextArea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.performTranslation();
      }
    });
    
    // 全局快捷键
    this.contentEl.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.copyTranslation();
      }
    });
  }

  /**
   * 执行翻译
   */
  private async performTranslation(): Promise<void> {
    const sourceText = this.sourceTextArea.value.trim();
    if (!sourceText) {
      this.showError('请输入要翻译的文本');
      return;
    }
    
    if (this.isTranslating) {
      return;
    }
    
    this.setTranslatingState(true);
    
    try {
      const request: TranslationRequest = {
        text: sourceText,
        sourceLang: this.config.sourceLanguage as LanguageCode,
        targetLang: this.config.targetLanguage as LanguageCode,
        translator: this.config.defaultTranslator || TranslatorType.OPENAI
      };
      const result = await this.contentTranslationService.translateText(request);
      
      this.displayResult(result);
      this.logger.info('Translation completed successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.showError(`翻译失败: ${errorMessage}`);
      this.logger.error('Translation failed', error);
    } finally {
      this.setTranslatingState(false);
    }
  }

  /**
   * 显示翻译结果
   */
  private displayResult(result: TranslationResponse): void {
    this.currentResult = result;
    this.targetTextArea.value = result.translatedText;
    
    // 显示结果操作按钮
    const resultActions = this.contentEl.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'block';
    }
    
    // 更新统计信息
    this.updateStats(result);
  }

  /**
   * 复制翻译结果
   */
  private async copyTranslation(): Promise<void> {
    if (!this.currentResult) {
      this.showError('没有可复制的翻译结果');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(this.currentResult.translatedText);
      this.showSuccess('译文已复制到剪贴板');
    } catch (error) {
      this.showError('复制失败');
    }
  }

  /**
   * 插入翻译结果到编辑器
   */
  private insertTranslation(): void {
    if (!this.currentResult) {
      this.showError('没有可插入的翻译结果');
      return;
    }
    
    // 获取当前活动的编辑器
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && activeLeaf.view.getViewType() === 'markdown') {
      const view = activeLeaf.view as any;
      if (view.editor) {
        const cursor = view.editor.getCursor();
        view.editor.replaceRange(this.currentResult.translatedText, cursor);
        this.close();
        this.showSuccess('译文已插入到编辑器');
      }
    } else {
      this.showError('请先打开一个Markdown文档');
    }
  }

  /**
   * 交换源语言和目标语言
   */
  private swapLanguages(): void {
    const sourceValue = this.sourceLanguageDropdown.getValue();
    const targetValue = this.targetLanguageDropdown.getValue();
    
    if (sourceValue === 'auto') {
      this.showError('自动检测语言无法交换');
      return;
    }
    
    this.sourceLanguageDropdown.setValue(targetValue);
    this.targetLanguageDropdown.setValue(sourceValue);
    
    this.config.sourceLanguage = targetValue as LanguageCode;
    this.config.targetLanguage = sourceValue as LanguageCode;
    
    // 如果有翻译结果，交换文本内容
    if (this.currentResult) {
      const sourceText = this.sourceTextArea.value;
      const targetText = this.targetTextArea.value;
      
      this.sourceTextArea.value = targetText;
      this.targetTextArea.value = '';
      this.clearResult();
    }
  }

  /**
   * 清空文本
   */
  private clearText(): void {
    this.sourceTextArea.value = '';
    this.targetTextArea.value = '';
    this.clearResult();
    this.updateCharCount();
    this.sourceTextArea.focus();
  }

  /**
   * 清空结果
   */
  private clearResult(): void {
    this.currentResult = null;
    const resultActions = this.contentEl.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'none';
    }
  }

  /**
   * 设置翻译状态
   */
  private setTranslatingState(translating: boolean): void {
    this.isTranslating = translating;
    
    if (this.translateButton) {
      this.translateButton.setButtonText(translating ? '翻译中...' : '翻译');
      this.translateButton.setDisabled(translating);
    }
    
    this.sourceTextArea.disabled = translating;
    
    if (translating) {
      this.targetTextArea.value = '正在翻译，请稍候...';
    }
  }

  /**
   * 更新字符计数
   */
  private updateCharCount(): void {
    const charCount = this.sourceTextArea.value.length;
    const charCountEl = this.contentEl.querySelector('.char-count');
    if (charCountEl) {
      charCountEl.textContent = `字符数: ${charCount}`;
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(result: TranslationResponse): void {
    const statsEl = this.contentEl.querySelector('.translation-stats');
    if (statsEl) {
      const charCount = result.originalText.length;
      const translatedCount = result.translatedText.length;
      
      statsEl.innerHTML = `
        <span class="char-count">原文: ${charCount} 字符</span>
        <span class="translated-count">译文: ${translatedCount} 字符</span>
        <span class="translator">翻译器: ${result.translator}</span>
      `;
    }
  }

  /**
   * 翻译器变更处理
   */
  private onTranslatorChange(): void {
    // 清空之前的结果
    this.clearResult();
    
    // 可以在这里更新语言选项等
    this.logger.info(`Translator changed to: ${this.config.defaultTranslator}`);
  }

  /**
   * 获取可用翻译器
   */
  private getAvailableTranslators(): Array<{type: TranslatorType, name: string}> {
    return [
      { type: TranslatorType.OPENAI, name: 'OpenAI' },
      { type: TranslatorType.CUSTOM, name: '自定义接口' }
    ];
  }

  /**
   * 填充语言选项
   */
  private populateLanguageOptions(dropdown: DropdownComponent, includeAuto = true): void {
    if (includeAuto) {
      dropdown.addOption('auto', '自动检测');
    }
    
    const languages = [
      { code: 'zh-CN', name: '中文(简体)' },
      { code: 'zh-TW', name: '中文(繁体)' },
      { code: 'en', name: 'English' },
      { code: 'ja', name: '日本語' },
      { code: 'ko', name: '한국어' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'es', name: 'Español' },
      { code: 'ru', name: 'Русский' },
      { code: 'it', name: 'Italiano' },
      { code: 'pt', name: 'Português' },
      { code: 'ar', name: 'العربية' }
    ];
    
    languages.forEach(lang => {
      dropdown.addOption(lang.code, lang.name);
    });
  }

  /**
   * 显示错误信息
   */
  private showError(message: string): void {
    // 这里可以使用Obsidian的Notice或自定义错误显示
    console.error(message);
    // new Notice(message, 3000);
  }

  /**
   * 显示成功信息
   */
  private showSuccess(message: string): void {
    // 这里可以使用Obsidian的Notice或自定义成功显示
    console.log(message);
    // new Notice(message, 2000);
  }

  /**
   * 设置配置
   */
  public setConfig(config: Partial<ITranslationModalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  public getConfig(): ITranslationModalConfig {
    return { ...this.config };
  }

  /**
   * 设置初始文本
   */
  public setInitialText(text: string, autoTranslate = false): void {
    this.config.initialText = text;
    this.config.autoTranslate = autoTranslate;
    
    if (this.sourceTextArea) {
      this.sourceTextArea.value = text;
      this.updateCharCount();
      
      if (autoTranslate) {
        this.performTranslation();
      }
    }
  }
}