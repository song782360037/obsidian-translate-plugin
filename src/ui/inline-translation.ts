import { Component, MarkdownView, Editor, EditorPosition } from 'obsidian';
import { TranslationResponse, TranslationRequest, TranslatorType, LanguageCode } from '../types';
import { ContentTranslationService } from '../services';
import { utils } from '../utils';

// 内联翻译配置接口
interface IInlineTranslationConfig {
  sourceLanguage?: LanguageCode;
  targetLanguage?: LanguageCode;
  translatorType?: TranslatorType;
  autoTranslate?: boolean;
  autoTranslateDelay?: number;
  autoHideDelay?: number;
  minTextLength?: number;
  maxTextLength?: number;
  excludeCodeBlocks?: boolean;
  closeOnClickOutside?: boolean;
  saveToHistory?: boolean;
  showOriginalText?: boolean;
  showTranslatorInfo?: boolean;
  position?: 'above' | 'below' | 'right';
  maxWidth?: number;
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * 内联翻译显示组件
 */
export class InlineTranslationComponent extends Component {
  private contentTranslationService: ContentTranslationService;
  private logger = utils.logger.createChild('InlineTranslationComponent');
  
  // 当前活动的内联翻译
  private activeTranslations: Map<string, InlineTranslationWidget> = new Map();
  private config: IInlineTranslationConfig;
  
  // 事件监听器
  private selectionChangeHandler: () => void;
  private clickHandler: (event: MouseEvent) => void;

  constructor(
    contentTranslationService: ContentTranslationService,
    config: IInlineTranslationConfig
  ) {
    super();
    this.contentTranslationService = contentTranslationService;
    this.config = config;
    
    this.selectionChangeHandler = this.onSelectionChange.bind(this);
    this.clickHandler = this.onDocumentClick.bind(this);
  }

  /**
   * 组件加载时调用
   */
  onload(): void {
    // 监听文档选择变化
    document.addEventListener('selectionchange', this.selectionChangeHandler);
    document.addEventListener('click', this.clickHandler);
    
    this.logger.info('Inline translation component loaded');
  }

  /**
   * 组件卸载时调用
   */
  onunload(): void {
    // 清理所有活动的翻译
    this.clearAllTranslations();
    
    // 移除事件监听器
    document.removeEventListener('selectionchange', this.selectionChangeHandler);
    document.removeEventListener('click', this.clickHandler);
    
    this.logger.info('Inline translation component unloaded');
  }

  /**
   * 为选中文本创建内联翻译
   */
  public async createInlineTranslation(
    editor: Editor,
    selectedText: string,
    startPos: EditorPosition,
    endPos: EditorPosition
  ): Promise<InlineTranslationWidget | null> {
    try {
      // 生成唯一ID
      const translationId = this.generateTranslationId(startPos, endPos);
      
      // 检查是否已存在相同位置的翻译
      if (this.activeTranslations.has(translationId)) {
        return this.activeTranslations.get(translationId)!;
      }
      
      // 执行翻译
      const request: TranslationRequest = {
        text: selectedText,
        sourceLang: this.config.sourceLanguage || LanguageCode.AUTO,
        targetLang: this.config.targetLanguage || LanguageCode.ZH_CN,
        translator: this.config.translatorType || TranslatorType.OPENAI
      };
      const result = await this.contentTranslationService.translateText(request);
      
      // 创建内联翻译组件
      const widget = new InlineTranslationWidget(
        translationId,
        editor,
        result,
        startPos,
        endPos,
        this.config,
        this.onTranslationClose.bind(this)
      );
      
      // 显示翻译
      widget.show();
      
      // 保存到活动翻译列表
      this.activeTranslations.set(translationId, widget);
      
      this.logger.info(`Inline translation created: ${translationId}`);
      return widget;
      
    } catch (error) {
      this.logger.error('Failed to create inline translation', error);
      return null;
    }
  }

  /**
   * 为当前选中文本创建翻译
   */
  public async translateSelection(): Promise<void> {
    const activeView = (this as any).app?.workspace?.getActiveViewOfType?.(MarkdownView);
    if (!activeView) {
      this.logger.warn('No active markdown view found');
      return;
    }
    
    const editor = activeView.editor;
    const selection = editor.getSelection();
    
    // 添加调试日志
    this.logger.info('Inline translation selection debug:', {
      selection: selection,
      selectionLength: selection?.length || 0,
      trimmedLength: selection?.trim()?.length || 0,
      hasSelection: !!selection
    });
    
    // 改进的文本选择检查
    if (!selection || selection.length === 0) {
      this.showError('请先选择要翻译的文本');
      this.logger.warn('Inline translation: No text selected');
      return;
    }
    
    if (selection.trim().length === 0) {
      this.showError('选中的文本只包含空白字符，请选择有效文本');
      this.logger.warn('Inline translation: Selected text contains only whitespace');
      return;
    }
    
    this.logger.info('Valid text selected for inline translation:', selection.substring(0, 50) + (selection.length > 50 ? '...' : ''));
    
    const startPos = editor.getCursor('from');
    const endPos = editor.getCursor('to');
    
    await this.createInlineTranslation(editor, selection, startPos, endPos);
  }

  /**
   * 清除所有翻译
   */
  public clearAllTranslations(): void {
    this.activeTranslations.forEach(widget => {
      widget.hide();
    });
    this.activeTranslations.clear();
    
    this.logger.info('All inline translations cleared');
  }

  /**
   * 清除指定位置的翻译
   */
  public clearTranslationAt(startPos: EditorPosition, endPos: EditorPosition): void {
    const translationId = this.generateTranslationId(startPos, endPos);
    const widget = this.activeTranslations.get(translationId);
    
    if (widget) {
      widget.hide();
      this.activeTranslations.delete(translationId);
    }
  }

  /**
   * 切换翻译显示
   */
  public toggleTranslations(): void {
    if (this.activeTranslations.size === 0) {
      this.translateSelection();
    } else {
      this.clearAllTranslations();
    }
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<IInlineTranslationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 选择变化处理
   */
  private onSelectionChange(): void {
    if (!this.config.autoTranslate) {
      return;
    }
    
    // 延迟处理，避免频繁触发
    setTimeout(() => {
      this.handleAutoTranslate();
    }, this.config.autoTranslateDelay || 500);
  }

  /**
   * 文档点击处理
   */
  private onDocumentClick(event: MouseEvent): void {
    // 检查是否点击在翻译组件外部
    const target = event.target as HTMLElement;
    if (!target.closest('.inline-translation-widget')) {
      // 如果配置了点击外部关闭，则关闭所有翻译
      if (this.config.closeOnClickOutside) {
        this.clearAllTranslations();
      }
    }
  }

  /**
   * 处理自动翻译
   */
  private async handleAutoTranslate(): Promise<void> {
    const activeView = (this as any).app?.workspace?.getActiveViewOfType?.(MarkdownView);
    if (!activeView) {
      return;
    }
    
    const editor = activeView.editor;
    const selection = editor.getSelection();
    
    // 检查选择是否符合自动翻译条件
    if (!this.shouldAutoTranslate(selection)) {
      return;
    }
    
    const startPos = editor.getCursor('from');
    const endPos = editor.getCursor('to');
    
    await this.createInlineTranslation(editor, selection, startPos, endPos);
  }

  /**
   * 检查是否应该自动翻译
   */
  private shouldAutoTranslate(selection: string): boolean {
    if (!selection || selection.trim().length === 0) {
      return false;
    }
    
    // 检查最小长度
    if (this.config.minTextLength && selection.length < this.config.minTextLength) {
      return false;
    }
    
    // 检查最大长度
    if (this.config.maxTextLength && selection.length > this.config.maxTextLength) {
      return false;
    }
    
    // 检查是否包含非文本内容（如代码块标记）
    if (this.config.excludeCodeBlocks && this.isCodeBlock(selection)) {
      return false;
    }
    
    return true;
  }

  /**
   * 检查是否为代码块
   */
  private isCodeBlock(text: string): boolean {
    return text.includes('```') || text.includes('`') || !!text.match(/^\s*[\w-]+:\s*/);
  }

  /**
   * 生成翻译ID
   */
  private generateTranslationId(startPos: EditorPosition, endPos: EditorPosition): string {
    return `${startPos.line}-${startPos.ch}-${endPos.line}-${endPos.ch}`;
  }

  /**
   * 翻译关闭回调
   */
  private onTranslationClose(translationId: string): void {
    this.activeTranslations.delete(translationId);
  }

  /**
   * 显示错误信息
   */
  private showError(message: string): void {
    console.error(message);
    // new Notice(message, 3000);
  }
}

/**
 * 内联翻译组件
 */
export class InlineTranslationWidget {
  private id: string;
  private editor: Editor;
  private result: TranslationResponse;
  private startPos: EditorPosition;
  private endPos: EditorPosition;
  private config: IInlineTranslationConfig;
  private onClose: (id: string) => void;
  
  private widgetEl: HTMLElement | null = null;
  private isVisible = false;
  private logger = utils.logger.createChild('InlineTranslationWidget');

  constructor(
    id: string,
    editor: Editor,
    result: TranslationResponse,
    startPos: EditorPosition,
    endPos: EditorPosition,
    config: IInlineTranslationConfig,
    onClose: (id: string) => void
  ) {
    this.id = id;
    this.editor = editor;
    this.result = result;
    this.startPos = startPos;
    this.endPos = endPos;
    this.config = config;
    this.onClose = onClose;
  }

  /**
   * 显示翻译组件
   */
  public show(): void {
    if (this.isVisible) {
      return;
    }
    
    this.createWidget();
    this.positionWidget();
    this.isVisible = true;
    
    // 自动隐藏
    if (this.config.autoHideDelay && this.config.autoHideDelay > 0) {
      setTimeout(() => {
        this.hide();
      }, this.config.autoHideDelay);
    }
    
    this.logger.info(`Translation widget shown: ${this.id}`);
  }

  /**
   * 隐藏翻译组件
   */
  public hide(): void {
    if (!this.isVisible || !this.widgetEl) {
      return;
    }
    
    this.widgetEl.remove();
    this.widgetEl = null;
    this.isVisible = false;
    
    this.onClose(this.id);
    this.logger.info(`Translation widget hidden: ${this.id}`);
  }

  /**
   * 创建组件元素
   */
  private createWidget(): void {
    this.widgetEl = document.createElement('div');
    this.widgetEl.className = 'inline-translation-widget';
    
    // 设置样式
    this.widgetEl.style.cssText = `
      position: absolute;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 8px 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      max-width: 300px;
      font-size: 13px;
      line-height: 1.4;
    `;
    
    // 创建内容
    this.createWidgetContent();
    
    // 添加到文档
    document.body.appendChild(this.widgetEl);
  }

  /**
   * 创建组件内容
   */
  private createWidgetContent(): void {
    if (!this.widgetEl) return;
    
    // 翻译结果文本
    const textEl = this.widgetEl.createDiv('translation-text');
    textEl.textContent = this.result.translatedText;
    textEl.style.cssText = `
      margin-bottom: 6px;
      word-wrap: break-word;
    `;
    
    // 操作按钮栏
    const actionsEl = this.widgetEl.createDiv('translation-actions');
    actionsEl.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 11px;
    `;
    
    // 复制按钮
    const copyBtn = actionsEl.createEl('button', {
      text: '复制',
      cls: 'translation-action-btn'
    });
    copyBtn.style.cssText = `
      padding: 2px 6px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    `;
    copyBtn.addEventListener('click', () => this.copyTranslation());
    
    // 替换按钮
    const replaceBtn = actionsEl.createEl('button', {
      text: '替换',
      cls: 'translation-action-btn'
    });
    replaceBtn.style.cssText = copyBtn.style.cssText;
    replaceBtn.addEventListener('click', () => this.replaceOriginalText());
    
    // 关闭按钮
    const closeBtn = actionsEl.createEl('button', {
      text: '×',
      cls: 'translation-close-btn'
    });
    closeBtn.style.cssText = `
      padding: 2px 6px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      margin-left: auto;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    
    // 翻译器信息
    if (this.config.showTranslatorInfo) {
      const infoEl = actionsEl.createEl('span', {
        text: this.result.translator,
        cls: 'translator-info'
      });
      infoEl.style.cssText = `
        color: var(--text-muted);
        font-size: 10px;
        margin-left: auto;
        margin-right: 6px;
      `;
    }
  }

  /**
   * 定位组件
   */
  private positionWidget(): void {
    if (!this.widgetEl) return;
    
    // 获取选中文本的位置
    const coords = (this.editor as any).cm?.coordsAtPos?.(this.endPos) || 
                   (this.editor as any).coordsAtPos?.(this.endPos);
    if (!coords) return;
    
    // 计算位置
    let left = coords.left;
    let top = coords.bottom + 5; // 在选中文本下方
    
    // 检查是否超出视口
    const rect = this.widgetEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 水平位置调整
    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 10;
    }
    if (left < 10) {
      left = 10;
    }
    
    // 垂直位置调整
    if (top + rect.height > viewportHeight) {
      top = coords.top - rect.height - 5; // 在选中文本上方
    }
    
    this.widgetEl.style.left = `${left}px`;
    this.widgetEl.style.top = `${top}px`;
  }

  /**
   * 复制翻译结果
   */
  private async copyTranslation(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.result.translatedText);
      this.showSuccess('译文已复制');
    } catch (error) {
      this.showError('复制失败');
    }
  }

  /**
   * 替换原文
   */
  private replaceOriginalText(): void {
    try {
      this.editor.replaceRange(
        this.result.translatedText,
        this.startPos,
        this.endPos
      );
      this.hide();
      this.showSuccess('文本已替换');
    } catch (error) {
      this.showError('替换失败');
    }
  }

  /**
   * 显示成功信息
   */
  private showSuccess(message: string): void {
    console.log(message);
    // new Notice(message, 1500);
  }

  /**
   * 显示错误信息
   */
  private showError(message: string): void {
    console.error(message);
    // new Notice(message, 3000);
  }

  /**
   * 获取翻译结果
   */
  public getResult(): TranslationResponse {
    return this.result;
  }

  /**
   * 检查是否可见
   */
  public isShown(): boolean {
    return this.isVisible;
  }
}