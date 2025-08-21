import { IContentTranslationService } from '../interfaces/services';
import {
  TranslationRequest,
  TranslationResponse,
  TranslationStatus,
  TranslatorType,
  LanguageCode,
  TranslationHistory,
  SelectedText,
  BatchTranslationProgress
} from '../types';
import { TranslatorFactory } from '../translator';
import { ConfigService } from './config';
import { utils } from '../utils';
import { DOMUtils } from '../utils/dom';
import { App, TFile, Editor, MarkdownView } from 'obsidian';

/**
 * 翻译缓存项
 */
interface TranslationCacheItem {
  originalText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  translator: TranslatorType;
  timestamp: number;
  hash: string;
}

/**
 * 批量翻译任务
 */
interface BatchTranslationTask {
  id: string;
  texts: string[];
  from: LanguageCode;
  to: LanguageCode;
  translator: TranslatorType;
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: TranslationResponse[];
  errors: string[];
  startTime?: number;
  endTime?: number;
}

/**
 * Content Translation Service Implementation
 */
export class ContentTranslationService implements IContentTranslationService {
  private app: App;
  private configService: ConfigService;
  private translatorFactory: TranslatorFactory;
  private domUtils: DOMUtils;
  private translationCache: Map<string, TranslationCacheItem> = new Map();
  private translationHistory: TranslationHistory[] = [];
  private batchTasks: Map<string, BatchTranslationTask> = new Map();
  private logger = console; // TODO: Replace with proper logger implementation
  private isInitialized = false;
  private pageTranslationState: Map<string, { originalTexts: Map<Element, string>, isTranslated: boolean }> = new Map();

  constructor(app: App, configService: ConfigService, translatorFactory: TranslatorFactory) {
    this.app = app;
    this.configService = configService;
    this.translatorFactory = translatorFactory;
    this.domUtils = new DOMUtils();
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      await this.loadTranslationHistory();
      await this.loadTranslationCache();
      this.isInitialized = true;
      this.logger.info('Content translation service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize content translation service', error);
      throw error;
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      await this.saveTranslationHistory();
      await this.saveTranslationCache();
      this.translationCache.clear();
      this.translationHistory = [];
      this.batchTasks.clear();
      this.isInitialized = false;
      this.logger.info('Content translation service destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy content translation service', error);
    }
  }

  /**
   * 翻译文本
   */
  async translateText(request: TranslationRequest): Promise<TranslationResponse> {
    try {
      if (!this.isInitialized) {
        throw new Error('Service not initialized');
      }

      // 获取配置
      const config = this.configService.getSettings();
      const sourceLanguage = request.sourceLang || LanguageCode.AUTO;
      const targetLang = request.targetLang;
      const text = request.text;
      const translator = request.translator || config.defaultTranslator;

      // 检查缓存
      if (config.advanced.enableCache) {
        const cachedResult = this.getCachedTranslation(text, sourceLanguage, targetLang, translator);
        if (cachedResult) {
          this.logger.debug('Translation found in cache');
          return this.createResponseFromCache(cachedResult);
        }
      }

      // 获取用户配置的最大token限制
      const maxTokens = config.advanced?.maxTokens || 128000;

      // 创建翻译请求
      const translationRequest: TranslationRequest = {
        text: utils.validation.sanitizeHtml(text),
        sourceLang: sourceLanguage,
        targetLang: targetLang,
        translator,
        maxTokens: maxTokens
      };

      // 获取翻译器实例
      const translatorConfig = config.translators[translator];
      if (!translatorConfig) {
        throw new Error(`Translator ${translator} not configured`);
      }
      
      // 将全局maxTokens配置合并到翻译器配置中
      const enhancedTranslatorConfig = {
        ...translatorConfig,
        maxTokens: maxTokens
      };
      
      const translatorInstance = await this.translatorFactory.createTranslatorAsync(translator, enhancedTranslatorConfig);
      if (!translatorInstance) {
        throw new Error(`Translator ${translator} not available`);
      }

      // 执行翻译
      const response = await translatorInstance.translate(translationRequest);

      // 缓存结果
      if (config.advanced.enableCache && response.status === 'success') {
        this.cacheTranslation(text, response, translator);
      }

      // 添加到历史记录
      this.addToHistory(response, translator);

      this.logger.info(`Translation completed: ${text.substring(0, 50)}...`);
      return response;
    } catch (error) {
      this.logger.error('Translation failed', error);
      const config = this.configService.getSettings();
      
      return {
        originalText: request.text,
        translatedText: '',
        sourceLang: request.sourceLang || LanguageCode.AUTO,
        targetLang: request.targetLang,
        translator: request.translator || config.defaultTranslator,
        status: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 批量翻译
   */
  async batchTranslate(requests: TranslationRequest[]): Promise<TranslationResponse[]> {
    try {
      const results: TranslationResponse[] = [];
      
      for (const request of requests) {
        const response = await this.translateText(request);
        results.push(response);
      }
      
      return results;
    } catch (error) {
      this.logger.error('Failed to batch translate', error);
      throw error;
    }
  }

  /**
   * 直接替换当前页面文本
   */
  async translateAndReplaceCurrentPage(): Promise<void> {
    const pageKey = this.getCurrentPageKey();
    const state = this.pageTranslationState.get(pageKey);
    
    if (state && state.isTranslated) {
      // 如果已翻译，则恢复原文
      this.restoreOriginalTexts(pageKey);
    } else {
      // 如果未翻译，则进行翻译
      await this.translateCurrentPageTexts();
    }
  }

  /**
   * 翻译当前页面的文本
   */
  private async translateCurrentPageTexts(): Promise<void> {
    const pageKey = this.getCurrentPageKey();
    const textElements = this.getTranslatableTextElements();
    
    if (textElements.length === 0) {
      return;
    }

    const originalTexts = new Map<Element, string>();
    const translationTasks: Promise<void>[] = [];

    // 为每个文本元素创建翻译任务
    for (const element of textElements) {
      const originalText = element.textContent?.trim();
      if (originalText && this.shouldTranslateText(originalText)) {
        originalTexts.set(element, originalText);
        
        const task = this.translateElementText(element, originalText);
        translationTasks.push(task);
      }
    }

    // 保存原文状态
    this.pageTranslationState.set(pageKey, {
      originalTexts,
      isTranslated: true
    });

    // 并发执行所有翻译任务
    await Promise.allSettled(translationTasks);
  }

  /**
   * 翻译单个元素的文本
   */
  private async translateElementText(element: Element, originalText: string): Promise<void> {
    try {
      const response = await this.translateText({
        text: originalText,
        sourceLang: LanguageCode.AUTO,
        targetLang: this.configService.getSettings().defaultTargetLang,
        translator: this.configService.getSettings().defaultTranslator
      });
      if (response.status === 'success' && response.translatedText) {
        element.textContent = response.translatedText;
      }
    } catch (error) {
      console.error('翻译元素文本失败:', error);
    }
  }

  /**
   * 恢复原始文本
   */
  private restoreOriginalTexts(pageKey: string): void {
    const state = this.pageTranslationState.get(pageKey);
    if (!state) return;

    // 恢复所有元素的原始文本
    state.originalTexts.forEach((originalText, element) => {
      element.textContent = originalText;
    });

    // 更新状态
    state.isTranslated = false;
    this.pageTranslationState.set(pageKey, state);
  }

  /**
   * 获取当前页面的唯一标识
   */
  private getCurrentPageKey(): string {
    return window.location.href;
  }

  /**
   * 获取可翻译的文本元素
   */
  private getTranslatableTextElements(): Element[] {
    const selectors = [
      '.setting-item-name',
      '.setting-item-description', 
      '.vertical-tab-nav-item',
      '.community-plugin .plugin-list-item .plugin-name',
      '.community-plugin .plugin-list-item .plugin-author',
      '.community-plugin .plugin-list-item .plugin-description',
      '.modal-title',
      '.modal-content p',
      '.modal-content span',
      'label',
      'button:not(.clickable-icon)',
      '.nav-file-title-content',
      '.tree-item-inner'
    ];

    const elements: Element[] = [];
    
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      found.forEach(element => {
        if (this.isValidTextElement(element)) {
          elements.push(element);
        }
      });
    }

    return elements;
  }

  /**
   * 检查元素是否为有效的文本元素
   */
  private isValidTextElement(element: Element): boolean {
    const text = element.textContent?.trim();
    if (!text) return false;

    // 排除隐藏元素
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
      return false;
    }

    // 排除只包含数字、符号的元素
    if (/^[\d\s\-_.,;:!?()\[\]{}"'`~@#$%^&*+=|\\/<>]*$/.test(text)) {
      return false;
    }

    return true;
  }

  /**
   * 判断文本是否需要翻译
   */
  private shouldTranslateText(text: string): boolean {
    // 只翻译包含英文字母的文本
    return /[a-zA-Z]/.test(text) && text.length > 1;
  }

  /**
   * 获取选中的文本
   */
  getSelectedText(): SelectedText | null {
    try {
      // 首先尝试从当前活动编辑器获取选中文本
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf && activeLeaf.view.getViewType() === 'markdown') {
        const view = activeLeaf.view as any;
        if (view.editor) {
          const selection = view.editor.getSelection();
          if (selection && selection.trim().length > 0) {
            // 从编辑器获取选中文本，创建SelectedText对象
            const cursor = view.editor.getCursor();
            const element = view.containerEl.querySelector('.cm-editor') as HTMLElement;
            
            // 为编辑器选择创建虚拟的range和rect
            const dummyRange = document.createRange();
            const dummyRect = new DOMRect(0, 0, 0, 0);
            
            return {
              text: selection,
              element: element || document.body,
              range: dummyRange,
              rect: dummyRect
            };
          }
        }
      }
      
      // 如果编辑器没有选中文本，尝试使用DOM API获取
      const domSelection = this.domUtils.getSelectedText();
      if (domSelection && domSelection.text.trim().length > 0) {
        this.logger.info('Got selected text from DOM:', {
          text: domSelection.text,
          length: domSelection.text.length
        });
        return domSelection;
      }
      
      // 特殊处理：如果在设置页面且没有选中文本，尝试获取当前焦点元素的文本
      if (this.isInSettingsPage()) {
        const focusedElement = document.activeElement as HTMLElement;
        if (focusedElement) {
          const settingText = this.extractSettingElementText(focusedElement);
          if (settingText) {
            const dummyRange = document.createRange();
            const dummyRect = new DOMRect(0, 0, 0, 0);
            
            this.logger.info('Got setting element text:', {
              text: settingText,
              length: settingText.length
            });
            
            return {
              text: settingText,
              element: focusedElement,
              range: dummyRange,
              rect: dummyRect
            };
          }
        }
      }
      
      this.logger.info('No text selected in editor or DOM');
      return null;
    } catch (error) {
      this.logger.error('Failed to get selected text', error);
      return null;
    }
  }

  /**
   * 检查是否在设置页面
   */
  private isInSettingsPage(): boolean {
    const settingSelectors = [
      '.modal.mod-settings',
      '.setting-tab-content',
      '.vertical-tab-content',
      '.community-plugin-list',
      '.setting-item'
    ];
    
    return settingSelectors.some(selector => {
      return document.querySelector(selector) !== null;
    });
  }

  /**
   * 从设置元素中提取文本
   */
  private extractSettingElementText(element: HTMLElement): string | null {
    if (!element) return null;
    
    // 查找最近的设置项容器
    const settingItem = element.closest('.setting-item');
    if (settingItem) {
      const nameEl = settingItem.querySelector('.setting-item-name');
      const descEl = settingItem.querySelector('.setting-item-description');
      const infoEl = settingItem.querySelector('.setting-item-info');
      
      const texts: string[] = [];
      if (nameEl?.textContent?.trim()) {
        texts.push(nameEl.textContent.trim());
      }
      if (descEl?.textContent?.trim()) {
        texts.push(descEl.textContent.trim());
      }
      if (infoEl?.textContent?.trim()) {
        texts.push(infoEl.textContent.trim());
      }
      
      if (texts.length > 0) {
        return texts.join(' - ');
      }
    }
    
    // 查找垂直标签页内容
    const tabContent = element.closest('.vertical-tab-content');
    if (tabContent) {
      const tabHeader = tabContent.querySelector('.vertical-tab-header');
      if (tabHeader?.textContent?.trim()) {
        return tabHeader.textContent.trim();
      }
    }
    
    // 查找社区插件项
    const pluginItem = element.closest('.community-plugin-item');
    if (pluginItem) {
      const nameEl = pluginItem.querySelector('.community-plugin-name');
      const descEl = pluginItem.querySelector('.community-plugin-desc');
      
      const texts: string[] = [];
      if (nameEl?.textContent?.trim()) {
        texts.push(nameEl.textContent.trim());
      }
      if (descEl?.textContent?.trim()) {
        texts.push(descEl.textContent.trim());
      }
      
      if (texts.length > 0) {
        return texts.join(' - ');
      }
    }
    
    // 如果元素本身有文本内容
    if (element.textContent?.trim()) {
      return element.textContent.trim();
    }
    
    return null;
  }

  /**
   * 翻译并替换选中的文本
   */
  async translateAndReplace(selectedText: SelectedText): Promise<void> {
    try {
      const response = await this.translateSelectedText(selectedText);
      
      if (response.status === 'success') {
        // 这里应该实现替换选中文本的逻辑
        // 在实际的Obsidian插件中，需要操作编辑器API
        this.logger.info('Text replacement would be implemented here');
      } else {
        throw new Error(response.error || 'Translation failed');
      }
    } catch (error) {
      this.logger.error('Failed to translate and replace', error);
      throw error;
    }
  }

  /**
   * 翻译选中的文本
   */
  async translateSelectedText(selectedText: SelectedText): Promise<TranslationResponse> {
    try {
      if (!selectedText.text.trim()) {
        throw new Error('No text selected');
      }

      const settings = this.configService.getSettings();
      const targetLang = settings.defaultTargetLang;
      const sourceLang = LanguageCode.AUTO; // SelectedText接口中没有sourceLang属性

      const request: TranslationRequest = {
        text: selectedText.text,
        sourceLang: sourceLang,
        targetLang: targetLang,
        translator: settings.defaultTranslator
      };
      const response = await this.translateText(request);
      
      // 如果翻译成功，可以选择替换选中的文本
      if (response.status === 'success') {
        // 这里可以实现内联翻译显示逻辑
        this.logger.debug('Inline translation completed');
      }

      return response;
    } catch (error) {
      this.logger.error('Failed to translate selection', error);
      throw error;
    }
  }

  /**
   * 翻译整个文档
   */
  async translateDocument(file?: TFile): Promise<string> {
    try {
      const targetFile = file || this.app.workspace.getActiveFile();
      if (!targetFile) {
        throw new Error('No file to translate');
      }

      const content = await this.app.vault.read(targetFile);
      const config = this.configService.getSettings();
      
      // 解析Markdown内容，提取需要翻译的文本
      const textBlocks = this.extractTranslatableText(content);
      
      // 批量翻译
      const taskId = await this.startBatchTranslation(
        textBlocks,
        LanguageCode.AUTO,
        config.defaultTargetLang || LanguageCode.EN,
        config.defaultTranslator
      );

      // 等待批量翻译完成
      const task = await this.waitForBatchCompletion(taskId);
      
      if (task.status === 'completed') {
        // 重新组装翻译后的文档
        const translatedContent = this.reassembleDocument(content, textBlocks, task.results);
        return translatedContent;
      } else {
        throw new Error('Batch translation failed');
      }
    } catch (error) {
      this.logger.error('Failed to translate document', error);
      throw error;
    }
  }

  /**
   * 开始批量翻译
   */
  async startBatchTranslation(
    texts: string[],
    from: LanguageCode,
    to: LanguageCode,
    translatorType: TranslatorType
  ): Promise<string> {
    const taskId = utils.crypto.generateUUID();
    
    const task: BatchTranslationTask = {
      id: taskId,
      texts,
      from,
      to,
      translator: translatorType,
      progress: 0,
      status: 'pending',
      results: [],
      errors: []
    };

    this.batchTasks.set(taskId, task);
    
    // 异步执行批量翻译
    this.executeBatchTranslation(taskId).catch(error => {
      this.logger.error(`Batch translation ${taskId} failed`, error);
      task.status = 'failed';
      task.errors.push(error.message);
    });

    return taskId;
  }

  /**
   * 获取批量翻译进度
   */
  getBatchTranslationProgress(taskId: string): {
    progress: number;
    status: string;
    results: TranslationResponse[];
    errors: string[];
  } | null {
    const task = this.batchTasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      progress: task.progress,
      status: task.status,
      results: task.results,
      errors: task.errors
    };
  }

  /**
   * 取消批量翻译
   */
  cancelBatchTranslation(taskId: string): boolean {
    const task = this.batchTasks.get(taskId);
    if (!task || task.status === 'completed') {
      return false;
    }

    task.status = 'failed';
    task.errors.push('Translation cancelled by user');
    return true;
  }

  /**
   * 获取翻译历史
   */
  getTranslationHistory(limit?: number): TranslationHistory[] {
    const history = [...this.translationHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 清除翻译历史
   */
  async clearTranslationHistory(): Promise<void> {
    this.translationHistory = [];
    await this.saveTranslationHistory();
    this.logger.info('Translation history cleared');
  }

  /**
   * 清除翻译缓存
   */
  async clearTranslationCache(): Promise<void> {
    this.translationCache.clear();
    await this.saveTranslationCache();
    this.logger.info('Translation cache cleared');
  }

  /**
   * 检测文本语言
   */
  async detectLanguage(text: string): Promise<LanguageCode> {
    try {
      // 简单的语言检测逻辑
      // 在实际实现中，可以使用更复杂的语言检测算法或API
      
      // 检测中文
      if (/[\u4e00-\u9fff]/.test(text)) {
        return LanguageCode.ZH_CN;
      }
      
      // 检测日文
      if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
        return LanguageCode.JA;
      }
      
      // 检测韩文
      if (/[\uac00-\ud7af]/.test(text)) {
        return LanguageCode.KO;
      }
      
      // 检测俄文
      if (/[\u0400-\u04ff]/.test(text)) {
        return LanguageCode.RU;
      }
      
      // 检测阿拉伯文
      if (/[\u0600-\u06ff]/.test(text)) {
        return LanguageCode.AR;
      }
      
      // 默认为英文
      return LanguageCode.EN;
    } catch (error) {
      this.logger.error('Language detection failed', error);
      return LanguageCode.AUTO;
    }
  }

  /**
   * 获取缓存的翻译
   */
  private getCachedTranslation(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    translator: TranslatorType
  ): TranslationCacheItem | null {
    const hash = this.generateTextHash(text, sourceLang, targetLang, translator);
    return this.translationCache.get(hash) || null;
  }

  /**
   * 缓存翻译结果
   */
  private cacheTranslation(
    originalText: string,
    response: TranslationResponse,
    translator: TranslatorType
  ): void {
    const hash = this.generateTextHash(originalText, response.sourceLang, response.targetLang, translator);
    
    const cacheItem: TranslationCacheItem = {
      originalText,
      translatedText: response.translatedText,
      sourceLang: response.sourceLang,
      targetLang: response.targetLang,
      translator,
      timestamp: Date.now(),
      hash
    };

    this.translationCache.set(hash, cacheItem);
    
    // 限制缓存大小
    if (this.translationCache.size > 1000) {
      const oldestKey = this.translationCache.keys().next().value;
      this.translationCache.delete(oldestKey);
    }
  }

  /**
   * 从缓存创建响应
   */
  private createResponseFromCache(cacheItem: TranslationCacheItem): TranslationResponse {
    return {
      originalText: cacheItem.originalText,
      translatedText: cacheItem.translatedText,
      sourceLang: cacheItem.sourceLang,
      targetLang: cacheItem.targetLang,
      translator: cacheItem.translator,
      status: 'success' as TranslationStatus,
      timestamp: Date.now()
    };
  }

  /**
   * 生成文本哈希
   */
  private generateTextHash(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    translator: TranslatorType
  ): string {
    const content = `${text}|${sourceLang}|${targetLang}|${translator}`;
    return utils.crypto.hash(content);
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(response: TranslationResponse, translator: TranslatorType): void {
    const historyItem: TranslationHistory = {
      id: utils.crypto.generateUUID(),
      originalText: response.originalText,
      translatedText: response.translatedText,
      sourceLang: response.sourceLang,
      targetLang: response.targetLang,
      translator,
      timestamp: response.timestamp
    };

    this.translationHistory.push(historyItem);
    
    // 限制历史记录大小
    const maxHistorySize = 1000; // 固定限制为1000条
    if (this.translationHistory.length > maxHistorySize) {
      this.translationHistory = this.translationHistory.slice(-maxHistorySize);
    }
  }

  /**
   * 执行批量翻译
   */
  private async executeBatchTranslation(taskId: string): Promise<void> {
    const task = this.batchTasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    task.status = 'running';
    task.startTime = Date.now();

    const config = this.configService.getSettings();
    const translatorConfig = config.translators[task.translator];
    if (!translatorConfig) {
      throw new Error(`Translator ${task.translator} not configured`);
    }
    const translatorInstance = await this.translatorFactory.createTranslatorAsync(task.translator, translatorConfig);
    if (!translatorInstance) {
      throw new Error(`Translator ${task.translator} not available`);
    }

    for (let i = 0; i < task.texts.length; i++) {
      if (task.status !== 'running') {
        break; // 任务被取消
      }

      try {
        const request: TranslationRequest = {
          text: task.texts[i],
          sourceLang: task.from,
          targetLang: task.to,
          translator: task.translator
        };

        const response = await translatorInstance.translate(request);
        task.results.push(response);
        
        if (response.status === 'error') {
          task.errors.push(response.error || 'Unknown error');
        }
      } catch (error) {
        task.errors.push(error instanceof Error ? error.message : 'Unknown error');
        task.results.push({
          originalText: task.texts[i],
          translatedText: '',
          sourceLang: task.from,
          targetLang: task.to,
          translator: task.translator,
          status: 'error',
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      task.progress = ((i + 1) / task.texts.length) * 100;
    }

    task.status = 'completed';
    task.endTime = Date.now();
  }

  /**
   * 等待批量翻译完成
   */
  private async waitForBatchCompletion(taskId: string): Promise<BatchTranslationTask> {
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const task = this.batchTasks.get(taskId);
        if (!task) {
          reject(new Error('Task not found'));
          return;
        }

        if (task.status === 'completed' || task.status === 'failed') {
          resolve(task);
        } else {
          setTimeout(checkStatus, 1000);
        }
      };

      checkStatus();
    });
  }

  /**
   * 提取可翻译的文本
   */
  private extractTranslatableText(content: string): string[] {
    // 简单的Markdown文本提取
    // 在实际实现中，应该使用更复杂的Markdown解析器
    
    const lines = content.split('\n');
    const textBlocks: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过代码块、链接、图片等
      if (trimmed.startsWith('```') || 
          trimmed.startsWith('![') || 
          trimmed.startsWith('[') ||
          trimmed.startsWith('#') ||
          trimmed === '') {
        continue;
      }
      
      // 提取纯文本
      const text = trimmed.replace(/\*\*(.*?)\*\*/g, '$1')
                          .replace(/\*(.*?)\*/g, '$1')
                          .replace(/`(.*?)`/g, '$1')
                          .trim();
      
      if (text.length > 0) {
        textBlocks.push(text);
      }
    }
    
    return textBlocks;
  }

  /**
   * 重新组装文档
   */
  private reassembleDocument(
    originalContent: string,
    textBlocks: string[],
    translations: TranslationResponse[]
  ): string {
    let result = originalContent;
    
    // 简单的替换逻辑
    // 在实际实现中，应该保持Markdown格式
    for (let i = 0; i < textBlocks.length && i < translations.length; i++) {
      if (translations[i].status === 'success') {
        result = result.replace(textBlocks[i], translations[i].translatedText);
      }
    }
    
    return result;
  }

  /**
   * 加载翻译历史
   */
  private async loadTranslationHistory(): Promise<void> {
    try {
      const historyData = await this.app.vault.adapter.read(
        '.obsidian/plugins/translate-plugin/translation-history.json'
      );
      
      this.translationHistory = JSON.parse(historyData);
      this.logger.info('Translation history loaded');
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.error('Failed to load translation history', error);
      }
      this.translationHistory = [];
    }
  }

  /**
   * 保存翻译历史
   */
  private async saveTranslationHistory(): Promise<void> {
    try {
      const configDir = '.obsidian/plugins/translate-plugin';
      
      if (!(await this.app.vault.adapter.exists(configDir))) {
        await this.app.vault.adapter.mkdir(configDir);
      }
      
      await this.app.vault.adapter.write(
        `${configDir}/translation-history.json`,
        JSON.stringify(this.translationHistory, null, 2)
      );
      
      this.logger.debug('Translation history saved');
    } catch (error) {
      this.logger.error('Failed to save translation history', error);
    }
  }

  /**
   * 加载翻译缓存
   */
  private async loadTranslationCache(): Promise<void> {
    try {
      const cacheData = await this.app.vault.adapter.read(
        '.obsidian/plugins/translate-plugin/translation-cache.json'
      );
      
      const cacheArray: TranslationCacheItem[] = JSON.parse(cacheData);
      this.translationCache = new Map(cacheArray.map(item => [item.hash, item]));
      
      this.logger.info('Translation cache loaded');
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.error('Failed to load translation cache', error);
      }
      this.translationCache = new Map();
    }
  }

  /**
   * 保存翻译缓存
   */
  private async saveTranslationCache(): Promise<void> {
    try {
      const configDir = '.obsidian/plugins/translate-plugin';
      
      if (!(await this.app.vault.adapter.exists(configDir))) {
        await this.app.vault.adapter.mkdir(configDir);
      }
      
      const cacheArray = Array.from(this.translationCache.values());
      await this.app.vault.adapter.write(
        `${configDir}/translation-cache.json`,
        JSON.stringify(cacheArray, null, 2)
      );
      
      this.logger.debug('Translation cache saved');
    } catch (error) {
      this.logger.error('Failed to save translation cache', error);
    }
  }
}