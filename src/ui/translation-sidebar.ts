import { ItemView, WorkspaceLeaf, Setting, ButtonComponent, DropdownComponent } from 'obsidian';
import { LanguageCode, TranslatorType, TranslationRequest, TranslationResponse, TranslationHistory } from '../types';
import { ContentTranslationService, ConfigService } from '../services';
import { utils } from '../utils';

export const TRANSLATION_SIDEBAR_VIEW_TYPE = 'translation-sidebar';

/**
 * 翻译侧边栏视图
 */
export class TranslationSidebarView extends ItemView {
  private contentTranslationService: ContentTranslationService;
  private configService: ConfigService;
  private logger = utils.logger.createChild('TranslationSidebarView');
  
  // UI元素
  private quickTranslateContainer!: HTMLElement;
  private historyContainer!: HTMLElement;
  private sourceTextArea!: HTMLTextAreaElement;
  private targetTextArea!: HTMLTextAreaElement;
  private translateButton!: ButtonComponent;
  private clearHistoryButton!: ButtonComponent;
  private translatorDropdown!: DropdownComponent;
  private targetLanguageDropdown!: DropdownComponent;
  private targetLanguage: LanguageCode = LanguageCode.EN;
  private selectedTranslator: TranslatorType = TranslatorType.OPENAI;
  
  // 状态
  private isTranslating = false;
  private currentHistory: TranslationHistory[] = [];
  private selectedHistoryItem: TranslationHistory | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    contentTranslationService: ContentTranslationService,
    configService: ConfigService
  ) {
    super(leaf);
    this.contentTranslationService = contentTranslationService;
    this.configService = configService;
  }

  /**
   * 获取视图类型
   */
  getViewType(): string {
    return TRANSLATION_SIDEBAR_VIEW_TYPE;
  }

  /**
   * 获取显示文本
   */
  getDisplayText(): string {
    return '翻译助手';
  }

  /**
   * 获取图标
   */
  getIcon(): string {
    return 'languages';
  }

  /**
   * 视图打开时调用
   */
  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('translation-sidebar');
    
    this.createHeader(container);
    this.createQuickTranslate(container);
    this.createHistorySection(container);
    
    // 加载翻译历史
    await this.loadTranslationHistory();
    
    this.logger.info('Translation sidebar opened');
  }

  /**
   * 视图关闭时调用
   */
  async onClose(): Promise<void> {
    this.logger.info('Translation sidebar closed');
  }

  /**
   * 创建标题栏
   */
  private createHeader(container: Element): void {
    const headerEl = container.createDiv('sidebar-header');
    headerEl.createEl('h3', { text: '翻译助手' });
    
    // 设置按钮
    const settingsButton = headerEl.createEl('button', {
      cls: 'sidebar-settings-btn',
      attr: { 'aria-label': '翻译设置' }
    });
    settingsButton.innerHTML = '⚙️';
    settingsButton.addEventListener('click', () => {
      this.openSettings();
    });
  }

  /**
   * 创建快速翻译区域
   */
  private createQuickTranslate(container: Element): void {
    this.quickTranslateContainer = container.createDiv('quick-translate-section');
    
    // 标题
    this.quickTranslateContainer.createEl('h4', { text: '快速翻译' });
    
    // 翻译器选择
    new Setting(this.quickTranslateContainer)
      .setName('翻译器')
      .addDropdown(dropdown => {
        this.translatorDropdown = dropdown;
        this.populateTranslatorOptions(dropdown);
        dropdown.onChange(value => {
          this.onTranslatorChange(value as TranslatorType);
        });
      });
    
    // 目标语言选择
    new Setting(this.quickTranslateContainer)
      .setName('目标语言')
      .addDropdown(dropdown => {
        this.targetLanguageDropdown = dropdown;
        this.populateLanguageOptions(dropdown);
        dropdown.onChange(value => {
          this.onTargetLanguageChange(value as LanguageCode);
        });
      });
    
    // 源文本输入
    const sourceContainer = this.quickTranslateContainer.createDiv('text-input-container');
    sourceContainer.createEl('label', { text: '原文' });
    this.sourceTextArea = sourceContainer.createEl('textarea', {
      cls: 'quick-translate-source',
      attr: {
        placeholder: '输入要翻译的文本...',
        rows: '3'
      }
    });
    
    // 翻译按钮
    const buttonContainer = this.quickTranslateContainer.createDiv('button-container');
    new Setting(buttonContainer)
      .addButton(button => {
        this.translateButton = button;
        button.setButtonText('翻译')
          .setCta()
          .onClick(() => this.performQuickTranslation());
      });
    
    // 结果显示
    const resultContainer = this.quickTranslateContainer.createDiv('text-result-container');
    resultContainer.createEl('label', { text: '译文' });
    this.targetTextArea = resultContainer.createEl('textarea', {
      cls: 'quick-translate-result',
      attr: {
        placeholder: '翻译结果将显示在这里...',
        rows: '3',
        readonly: 'true'
      }
    });
    
    // 结果操作按钮
    const resultActions = this.quickTranslateContainer.createDiv('result-actions');
    resultActions.style.display = 'none';
    
    new Setting(resultActions)
      .addButton(button => {
        button.setButtonText('复制')
          .onClick(() => this.copyResult());
      })
      .addButton(button => {
        button.setButtonText('插入')
          .onClick(() => this.insertResult());
      })
      .addButton(button => {
        button.setButtonText('清空')
          .onClick(() => this.clearQuickTranslate());
      });
    
    // 绑定事件
    this.bindQuickTranslateEvents();
  }

  /**
   * 创建历史记录区域
   */
  private createHistorySection(container: Element): void {
    this.historyContainer = container.createDiv('history-section');
    
    // 标题和操作
    const historyHeader = this.historyContainer.createDiv('history-header');
    historyHeader.createEl('h4', { text: '翻译历史' });
    
    new Setting(historyHeader)
      .addButton(button => {
        this.clearHistoryButton = button;
        button.setButtonText('清空历史')
          .setWarning()
          .onClick(() => this.clearHistory());
      });
    
    // 历史记录列表
    const historyList = this.historyContainer.createDiv('history-list');
    this.renderHistoryList(historyList);
  }

  /**
   * 渲染历史记录列表
   */
  private renderHistoryList(container: HTMLElement): void {
    container.empty();
    
    if (this.currentHistory.length === 0) {
      container.createDiv('history-empty').textContent = '暂无翻译历史';
      return;
    }
    
    this.currentHistory.forEach((item, index) => {
      const historyItem = container.createDiv('history-item');
      
      // 历史项内容
      const itemContent = historyItem.createDiv('history-item-content');
      
      // 原文预览
      const sourcePreview = itemContent.createDiv('history-source');
      sourcePreview.textContent = this.truncateText(item.originalText, 50);
      sourcePreview.title = item.originalText;
      
      // 译文预览
      const targetPreview = itemContent.createDiv('history-target');
      targetPreview.textContent = this.truncateText(item.translatedText, 50);
      targetPreview.title = item.translatedText;
      
      // 元信息
      const metaInfo = itemContent.createDiv('history-meta');
      metaInfo.innerHTML = `
        <span class="language-info">${item.sourceLang} → ${item.targetLang}</span>
        <span class="translator-info">${item.translator}</span>
        <span class="time-info">${this.formatTime(item.timestamp)}</span>
      `;
      
      // 操作按钮
      const itemActions = historyItem.createDiv('history-item-actions');
      
      // 查看按钮
      const viewButton = itemActions.createEl('button', {
        cls: 'history-action-btn',
        text: '查看'
      });
      viewButton.addEventListener('click', () => {
        this.viewHistoryItem(item);
      });
      
      // 复制按钮
      const copyButton = itemActions.createEl('button', {
        cls: 'history-action-btn',
        text: '复制'
      });
      copyButton.addEventListener('click', () => {
        this.copyHistoryItem(item);
      });
      
      // 重新翻译按钮
      const retranslateButton = itemActions.createEl('button', {
        cls: 'history-action-btn',
        text: '重译'
      });
      retranslateButton.addEventListener('click', () => {
        this.retranslateHistoryItem(item);
      });
      
      // 删除按钮
      const deleteButton = itemActions.createEl('button', {
        cls: 'history-action-btn history-delete-btn',
        text: '删除'
      });
      deleteButton.addEventListener('click', () => {
        this.deleteHistoryItem(index);
      });
      
      // 点击项目展开/收起详情
      itemContent.addEventListener('click', () => {
        this.toggleHistoryItemDetails(historyItem, item);
      });
    });
  }

  /**
   * 执行快速翻译
   */
  private async performQuickTranslation(): Promise<void> {
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
      const config = await this.configService.getConfig();
      const request: TranslationRequest = {
        text: sourceText,
        sourceLang: LanguageCode.AUTO,
        targetLang: this.targetLanguage,
        translator: this.selectedTranslator
      };
      const result = await this.contentTranslationService.translateText(request);
      
      this.displayQuickTranslationResult(result);
      await this.loadTranslationHistory(); // 刷新历史记录
      
      this.logger.info('Quick translation completed');
      
    } catch (error) {
      this.showError(`翻译失败: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error('Quick translation failed', error);
    } finally {
      this.setTranslatingState(false);
    }
  }

  /**
   * 显示快速翻译结果
   */
  private displayQuickTranslationResult(result: TranslationResponse): void {
    this.targetTextArea.value = result.translatedText;
    
    // 显示结果操作按钮
    const resultActions = this.quickTranslateContainer.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'block';
    }
  }

  /**
   * 复制翻译结果
   */
  private async copyResult(): Promise<void> {
    const result = this.targetTextArea.value;
    if (!result) {
      this.showError('没有可复制的翻译结果');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(result);
      this.showSuccess('译文已复制到剪贴板');
    } catch (error) {
      this.showError('复制失败');
    }
  }

  /**
   * 插入翻译结果到编辑器
   */
  private insertResult(): void {
    const result = this.targetTextArea.value;
    if (!result) {
      this.showError('没有可插入的翻译结果');
      return;
    }
    
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && activeLeaf.view.getViewType() === 'markdown') {
      // 检查是否为MarkdownView类型
      const view = activeLeaf.view;
      if (!(view as any).editor) {
        this.showError('当前视图不支持文本插入');
        return;
      }
      const editor = (view as any).editor;
      if (editor) {
        const cursor = editor.getCursor();
        editor.replaceRange(result, cursor);
        this.showSuccess('译文已插入到编辑器');
      }
    } else {
      this.showError('请先打开一个Markdown文档');
    }
  }

  /**
   * 清空快速翻译
   */
  private clearQuickTranslate(): void {
    this.sourceTextArea.value = '';
    this.targetTextArea.value = '';
    
    const resultActions = this.quickTranslateContainer.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'none';
    }
  }

  /**
   * 加载翻译历史
   */
  private async loadTranslationHistory(): Promise<void> {
    try {
      this.currentHistory = this.contentTranslationService.getTranslationHistory(50);
      
      const historyList = this.historyContainer.querySelector('.history-list') as HTMLElement;
      if (historyList) {
        this.renderHistoryList(historyList);
      }
      
    } catch (error) {
      this.logger.error('Failed to load translation history', error);
    }
  }

  /**
   * 查看历史项详情
   */
  private viewHistoryItem(item: TranslationHistory): void {
    this.selectedHistoryItem = item;
    
    // 在快速翻译区域显示历史项内容
    this.sourceTextArea.value = item.originalText;
    this.targetTextArea.value = item.translatedText;
    
    // 更新语言和翻译器选择
    this.targetLanguageDropdown.setValue(item.targetLang);
    this.translatorDropdown.setValue(item.translator);
    
    // 显示结果操作按钮
    const resultActions = this.quickTranslateContainer.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'block';
    }
  }

  /**
   * 复制历史项
   */
  private async copyHistoryItem(item: TranslationHistory): Promise<void> {
    try {
      await navigator.clipboard.writeText(item.translatedText);
      this.showSuccess('译文已复制到剪贴板');
    } catch (error) {
      this.showError('复制失败');
    }
  }

  /**
   * 重新翻译历史项
   */
  private async retranslateHistoryItem(item: TranslationHistory): Promise<void> {
    this.sourceTextArea.value = item.originalText;
    this.targetLanguageDropdown.setValue(item.targetLang);
    this.translatorDropdown.setValue(item.translator);
    
    await this.performQuickTranslation();
  }

  /**
   * 删除历史项
   */
  private async deleteHistoryItem(index: number): Promise<void> {
    try {
      const item = this.currentHistory[index];
      // 注意：这里需要实现单个历史项删除功能，暂时使用清空所有历史
      // TODO: 在ContentTranslationService中添加deleteTranslationHistory方法
      await this.contentTranslationService.clearTranslationHistory();
      
      this.currentHistory.splice(index, 1);
      
      const historyList = this.historyContainer.querySelector('.history-list') as HTMLElement;
      if (historyList) {
        this.renderHistoryList(historyList);
      }
      
      this.showSuccess('历史记录已删除');
      
    } catch (error) {
      this.showError('删除失败');
      this.logger.error('Failed to delete history item', error);
    }
  }

  /**
   * 清空历史记录
   */
  private async clearHistory(): Promise<void> {
    try {
      await this.contentTranslationService.clearTranslationHistory();
      this.currentHistory = [];
      
      const historyList = this.historyContainer.querySelector('.history-list') as HTMLElement;
      if (historyList) {
        this.renderHistoryList(historyList);
      }
      
      this.showSuccess('历史记录已清空');
      
    } catch (error) {
      this.showError('清空失败');
      this.logger.error('Failed to clear history', error);
    }
  }

  /**
   * 切换历史项详情显示
   */
  private toggleHistoryItemDetails(itemEl: HTMLElement, item: TranslationHistory): void {
    let detailsEl = itemEl.querySelector('.history-details') as HTMLElement;
    
    if (detailsEl) {
      // 已存在详情，切换显示状态
      detailsEl.style.display = detailsEl.style.display === 'none' ? 'block' : 'none';
    } else {
      // 创建详情元素
      detailsEl = itemEl.createDiv('history-details');
      
      // 完整原文
      const fullSource = detailsEl.createDiv('detail-section');
      fullSource.createEl('strong', { text: '原文：' });
      fullSource.createDiv('detail-text').textContent = item.originalText;
      
      // 完整译文
      const fullTarget = detailsEl.createDiv('detail-section');
      fullTarget.createEl('strong', { text: '译文：' });
      fullTarget.createDiv('detail-text').textContent = item.translatedText;
      
      // 详细信息
      const metaDetails = detailsEl.createDiv('detail-meta');
      metaDetails.innerHTML = `
        <div><strong>翻译器：</strong>${item.translator}</div>
        <div><strong>语言：</strong>${item.sourceLang} → ${item.targetLang}</div>
        <div><strong>时间：</strong>${new Date(item.timestamp).toLocaleString()}</div>
      `;
    }
  }

  /**
   * 绑定快速翻译事件
   */
  private bindQuickTranslateEvents(): void {
    // 回车键翻译
    this.sourceTextArea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.performQuickTranslation();
      }
    });
    
    // 输入时清空结果
    this.sourceTextArea.addEventListener('input', () => {
      this.targetTextArea.value = '';
      const resultActions = this.quickTranslateContainer.querySelector('.result-actions') as HTMLElement;
      if (resultActions) {
        resultActions.style.display = 'none';
      }
    });
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
   * 翻译器变更处理
   */
  private onTranslatorChange(translatorType: TranslatorType): void {
    this.logger.info(`Translator changed to: ${translatorType}`);
    // 可以在这里保存用户偏好
  }

  /**
   * 目标语言变更处理
   */
  private onTargetLanguageChange(language: LanguageCode): void {
    this.logger.info(`Target language changed to: ${language}`);
    // 可以在这里保存用户偏好
  }

  /**
   * 填充翻译器选项
   */
  private populateTranslatorOptions(dropdown: DropdownComponent): void {
    const translators = [
      { type: 'openai', name: 'OpenAI' },
      { type: 'baidu', name: '百度翻译' },
      { type: 'tencent', name: '腾讯翻译' },
      { type: 'custom', name: '自定义接口' }
    ];
    
    translators.forEach(translator => {
      dropdown.addOption(translator.type, translator.name);
    });
    
    dropdown.setValue('openai'); // 默认值
  }

  /**
   * 填充语言选项
   */
  private populateLanguageOptions(dropdown: DropdownComponent): void {
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
    
    dropdown.setValue('zh-CN'); // 默认值
  }

  /**
   * 打开设置
   */
  private openSettings(): void {
    // 这里可以打开插件设置页面
    // 注意：Obsidian的设置API可能不同，这里需要根据实际API调整
    // TODO: 使用正确的Obsidian设置API
    console.log('Opening plugin settings...');
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 格式化时间
   */
  private formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) { // 1分钟内
      return '刚刚';
    } else if (diff < 3600000) { // 1小时内
      return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 1天内
      return `${Math.floor(diff / 3600000)}小时前`;
    } else {
      return new Date(timestamp).toLocaleDateString();
    }
  }

  /**
   * 显示错误信息
   */
  private showError(message: string): void {
    console.error(message);
    // new Notice(message, 3000);
  }

  /**
   * 显示成功信息
   */
  private showSuccess(message: string): void {
    console.log(message);
    // new Notice(message, 2000);
  }

  /**
   * 刷新视图
   */
  public async refresh(): Promise<void> {
    await this.loadTranslationHistory();
  }

  /**
   * 设置选中文本进行翻译
   */
  public setSelectedText(text: string): void {
    this.sourceTextArea.value = text;
    
    // 清空之前的结果
    this.targetTextArea.value = '';
    const resultActions = this.quickTranslateContainer.querySelector('.result-actions') as HTMLElement;
    if (resultActions) {
      resultActions.style.display = 'none';
    }
  }
}