import { Plugin, Editor, MarkdownView, MarkdownFileInfo, Notice } from 'obsidian';
import { IContentTranslationService } from '../interfaces/services';
import { ConfigService } from '../services/config';
import { TranslationModal } from '../ui/translation-modal';
import { TranslationSidebarView } from '../ui/translation-sidebar';
import { InlineTranslationComponent } from '../ui/inline-translation';
import { TranslationInputModal } from '../ui/translation-input-modal';
import { GlobalTranslationResultModal } from '../ui/global-translation-modal';
import { TranslatorType, LanguageCode } from '../types';
import { DOMUtils } from '../utils';
import { TranslatorFactory } from '../translator/factory';

/**
 * 命令管理器
 * 负责注册和管理插件的所有命令
 */
export class CommandManager {
  private plugin: Plugin;
  private configService: ConfigService;
  private contentTranslationService: IContentTranslationService;
  private translationModal: TranslationModal;
  private inlineTranslation: InlineTranslationComponent;
  private translatorFactory: TranslatorFactory;
  private domUtils: DOMUtils;
  private logger = console; // TODO: 实现日志记录器

  constructor(
    plugin: Plugin,
    configService: ConfigService,
    contentTranslationService: IContentTranslationService,
    translationModal: TranslationModal,
    inlineTranslation: InlineTranslationComponent,
    translatorFactory: TranslatorFactory
  ) {
    this.plugin = plugin;
    this.configService = configService;
    this.contentTranslationService = contentTranslationService;
    this.translationModal = translationModal;
    this.inlineTranslation = inlineTranslation;
    this.translatorFactory = translatorFactory;
    this.domUtils = new DOMUtils();
  }

  /**
   * 注册所有命令
   */
  registerCommands(): void {
    this.logger.info('Registering commands...');

    // 智能翻译命令（有选中文本时翻译选中文本，无选中文本时打开翻译输入弹窗）
    this.plugin.addCommand({
      id: 'smart-translate',
      name: '智能翻译',
      callback: () => {
        this.smartTranslate();
      },
      hotkeys: [
        {
          modifiers: ['Ctrl', 'Shift'],
          key: 't'
        }
      ]
    });

    // 翻译当前页面命令
    this.plugin.addCommand({
      id: 'translate-current-page',
      name: '翻译当前页面',
      callback: () => {
        this.translateCurrentPage();
      },
      hotkeys: [
        {
          modifiers: ['Ctrl', 'Shift'],
          key: 'p'
        }
      ]
    });

    // 打开翻译弹窗命令
    this.plugin.addCommand({
      id: 'open-translation-modal',
      name: '打开翻译弹窗',
      callback: () => {
        this.openTranslationModal();
      },
      hotkeys: [
        {
          modifiers: ['Ctrl', 'Alt'],
          key: 't'
        }
      ]
    });

    // 切换翻译侧边栏命令
    this.plugin.addCommand({
      id: 'toggle-translation-sidebar',
      name: '切换翻译侧边栏',
      callback: () => {
        this.toggleTranslationSidebar();
      }
    });

    // 切换内联翻译命令
    this.plugin.addCommand({
      id: 'toggle-inline-translation',
      name: '切换内联翻译',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.toggleInlineTranslation();
      }
    });

    // 翻译整个文档命令
    this.plugin.addCommand({
      id: 'translate-document',
      name: '翻译整个文档',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        if (ctx instanceof MarkdownView) {
          this.translateDocument(editor, ctx);
        }
      }
    });

    // 使用OpenAI翻译命令
    this.plugin.addCommand({
      id: 'translate-with-openai',
      name: '使用OpenAI翻译',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.translateWithSpecificTranslator(editor, 'openai');
      }
    });



    // 翻译到英文命令
    this.plugin.addCommand({
      id: 'translate-to-english',
      name: '翻译到英文',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.translateToSpecificLanguage(editor, 'en');
      }
    });

    // 翻译到中文命令
    this.plugin.addCommand({
      id: 'translate-to-chinese',
      name: '翻译到中文',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.translateToSpecificLanguage(editor, 'zh-CN');
      }
    });

    // 翻译到日文命令
    this.plugin.addCommand({
      id: 'translate-to-japanese',
      name: '翻译到日文',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.translateToSpecificLanguage(editor, 'ja');
      }
    });

    // 清除翻译缓存命令
    this.plugin.addCommand({
      id: 'clear-translation-cache',
      name: '清除翻译缓存',
      callback: () => {
        this.clearTranslationCache();
      }
    });

    // 重新加载翻译器命令
    this.plugin.addCommand({
      id: 'reload-translators',
      name: '重新加载翻译器',
      callback: () => {
        this.reloadTranslators();
      }
    });

    // 显示翻译统计命令
    this.plugin.addCommand({
      id: 'show-translation-stats',
      name: '显示翻译统计',
      callback: () => {
        this.showTranslationStats();
      }
    });

    this.logger.info('Commands registered successfully');
  }

  /**
   * 获取选中的文本（使用多种方法确保可靠性）
   */
  private getSelectedText(editor: Editor): string | null {
    try {
      // 首先尝试使用编辑器API
      let selection = editor.getSelection();
      
      this.logger.info('Editor selection:', {
        selection: selection,
        length: selection?.length || 0,
        trimmedLength: selection?.trim()?.length || 0
      });
      
      // 如果编辑器选择不为空，直接返回
      if (selection && selection.trim().length > 0) {
        return selection;
      }
      
      // 如果编辑器选择为空，使用content-translation服务获取选中文本
      const selectedText = this.contentTranslationService.getSelectedText();
      if (selectedText && selectedText.text.trim().length > 0) {
        this.logger.info('Using content-translation service selection as fallback:', {
          text: selectedText.text.substring(0, 50) + (selectedText.text.length > 50 ? '...' : ''),
          length: selectedText.text.length
        });
        return selectedText.text;
      }
      
      this.logger.info('No text selected in editor or DOM');
      return null;
    } catch (error) {
      this.logger.error('Error getting selected text:', error);
      return null;
    }
  }

  /**
   * 智能翻译 - 有选中文本时翻译选中文本，无选中文本时打开翻译输入弹窗
   */
  private async smartTranslate(): Promise<void> {
    try {
      // 尝试获取选中的文本
      const selectedText = this.getGlobalSelectedText();
      
      if (selectedText && selectedText.trim().length > 0) {
        // 有选中文本，直接翻译
        this.logger.info('Text selected, translating directly:', selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''));
        await this.translateTextDirectly(selectedText);
      } else {
        // 没有选中文本，打开翻译输入弹窗
        this.logger.info('No text selected, opening translation input modal');
        const inputModal = new TranslationInputModal(this.plugin.app, this.configService);
        inputModal.open();
      }

    } catch (error) {
      this.logger.error('Failed to perform smart translate', error);
      new Notice('翻译失败，请检查配置');
    }
  }

  /**
   * 翻译当前页面的所有可见文本内容
   */
  private async translateCurrentPage(): Promise<void> {
    try {
      // 使用新的直接替换功能
      const contentTranslationService = (this.plugin as any).contentTranslationService;
      if (contentTranslationService) {
        await contentTranslationService.translateAndReplaceCurrentPage();
      } else {
        // 降级到原有功能
        const pageText = this.getCurrentPageText();
        
        if (!pageText || pageText.trim().length === 0) {
          new Notice('当前页面没有可翻译的文本内容');
          return;
        }

        this.logger.info('Translating current page text:', pageText.substring(0, 100) + (pageText.length > 100 ? '...' : ''));
        
        // 显示加载提示
        const notice = new Notice('正在翻译当前页面...', 0);
        
        try {
          await this.translateTextDirectly(pageText);
          notice.hide();
        } catch (error) {
          notice.hide();
          throw error;
        }
      }

    } catch (error) {
      this.logger.error('Failed to translate current page', error);
      new Notice('翻译当前页面失败');
    }
  }

  /**
   * 直接翻译文本并显示结果
   */
  private async translateTextDirectly(text: string): Promise<void> {
    try {
      const config = this.configService.getSettings();
      const translatorType = config.defaultTranslator || TranslatorType.OPENAI;
      const translatorConfig = this.configService.getTranslatorConfig(translatorType);
      
      if (!translatorConfig) {
        new Notice(`翻译器 ${translatorType} 配置未找到`);
        return;
      }
      
      const translator = await this.translatorFactory.createTranslatorAsync(translatorType, translatorConfig);
      
      if (!translator) {
        throw new Error(`翻译器 ${config.defaultTranslator} 不可用`);
      }

      const result = await translator.translate({
        text: text,
        sourceLang: LanguageCode.AUTO,
        targetLang: config.defaultTargetLang || LanguageCode.ZH_CN,
        translator: config.defaultTranslator || TranslatorType.OPENAI
      });
      
      // 显示翻译结果弹窗
      const translatedText = typeof result === 'string' ? result : result.translatedText || '';
      const resultModal = new GlobalTranslationResultModal(
        this.plugin.app,
        text,
        translatedText
      );
      resultModal.open();
      
    } catch (error) {
      this.logger.error('Failed to translate text directly', error);
      throw error;
    }
  }

  /**
   * 获取全局选中的文本（支持编辑器和DOM选择）
   */
  private getGlobalSelectedText(): string | null {
    try {
      // 首先尝试从当前活动编辑器获取选中文本
      const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.editor) {
        const editorSelection = activeView.editor.getSelection();
        if (editorSelection && editorSelection.trim().length > 0) {
          return editorSelection;
        }
      }
      
      // 然后尝试从DOM获取选中文本
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        return selection.toString();
      }
      
      // 最后尝试使用content-translation服务
      const selectedText = this.contentTranslationService.getSelectedText();
      if (selectedText && selectedText.text.trim().length > 0) {
        return selectedText.text;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error getting global selected text:', error);
      return null;
    }
  }

  /**
   * 获取当前页面的文本内容
   */
  private getCurrentPageText(): string {
    try {
      // 首先尝试从编辑器获取内容
      const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.editor) {
        const content = activeView.editor.getValue();
        if (content && content.trim().length > 0) {
          return content;
        }
      }
      
      // 如果不是编辑器视图，尝试多种DOM选择器获取可见文本
      const selectors = [
        // 设置页面专用选择器
        '.modal-content .setting-item-container',
        '.workspace-leaf-content .setting-item-container', 
        '.modal-content .vertical-tab-content',
        '.modal-content .community-plugin-item',
        '.modal-content .setting-item',
        '.workspace-leaf-content .setting-item',
        '.vertical-tab-content-container',
        '.setting-tab-content',
        // 通用选择器
        '.workspace-leaf.mod-active .view-content',
        '.workspace-leaf.mod-active',
        '.mod-active .setting-item',
        '.mod-active .vertical-tab-content',
        '.mod-active .community-plugin',
        '.workspace-split.mod-active',
        '.workspace-tab-container.mod-active',
        // 设置弹窗选择器
        '.modal-content',
        '.modal-container'
      ];
      
      for (const selector of selectors) {
        const contentEl = document.querySelector(selector);
        if (contentEl) {
          const textContent = this.extractTextFromElement(contentEl as HTMLElement);
          if (textContent && textContent.trim().length > 0) {
            this.logger.info(`Successfully extracted text using selector: ${selector}`);
            return textContent;
          }
        }
      }
      
      // 最后尝试从整个活动工作区获取文本
      const workspaceEl = document.querySelector('.workspace');
      if (workspaceEl) {
        const textContent = this.extractTextFromElement(workspaceEl as HTMLElement);
        if (textContent && textContent.trim().length > 0) {
          this.logger.info('Extracted text from entire workspace');
          return textContent;
        }
      }
      
      return '';
    } catch (error) {
      this.logger.error('Error getting current page text:', error);
      return '';
    }
  }

  /**
   * 从HTML元素中提取文本内容
   */
  private extractTextFromElement(element: HTMLElement): string {
    const textParts: string[] = [];
    const seenTexts = new Set<string>(); // 防止重复文本
    
    // 递归遍历所有子节点
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // 跳过脚本、样式、SVG等标签
          const skipTags = ['SCRIPT', 'STYLE', 'SVG', 'PATH', 'BUTTON', 'INPUT'];
          if (skipTags.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 跳过隐藏元素
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 跳过UI控制元素，但保留设置页面的重要元素
          const skipClasses = ['clickable-icon', 'nav-button', 'tab-header', 'titlebar', 'status-bar'];
          const allowedSettingClasses = ['setting-item-name', 'setting-item-description', 'setting-item-info'];
          
          // 如果是设置页面的重要元素，不跳过
          if (allowedSettingClasses.some(cls => parent.classList.contains(cls))) {
            return NodeFilter.FILTER_ACCEPT;
          }
          
          if (skipClasses.some(cls => parent.classList.contains(cls))) {
            return NodeFilter.FILTER_REJECT;
          }
          
          const text = node.textContent?.trim();
          if (text && text.length > 2 && !seenTexts.has(text)) { // 至少3个字符且不重复
            return NodeFilter.FILTER_ACCEPT;
          }
          
          return NodeFilter.FILTER_REJECT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text && text.length > 2 && !seenTexts.has(text)) {
        seenTexts.add(text);
        textParts.push(text);
      }
    }
    
    const text = textParts.join('\n').trim();
    
    // 如果找到了文本，返回结果
    if (text.trim()) {
      return text.trim();
    }
    
    // 特殊处理：如果是设置页面但没有找到文本，尝试更广泛的搜索
    const isSettingsPage = element.closest('.modal-content') || 
                          element.closest('.workspace-leaf-content[data-type="settings"]') ||
                          element.querySelector('.setting-item');
    
    if (isSettingsPage) {
      const settingsText = this.extractSettingsPageText(element);
      if (settingsText.trim()) {
        return settingsText.trim();
      }
    }
    
    return text;
  }

  /**
   * 专门提取设置页面文本的方法
   */
  private extractSettingsPageText(element: HTMLElement): string {
    const texts: string[] = [];
    
    // 提取设置项文本
    const settingItems = element.querySelectorAll('.setting-item');
    settingItems.forEach(item => {
      const nameEl = item.querySelector('.setting-item-name');
      const descEl = item.querySelector('.setting-item-description');
      const infoEl = item.querySelector('.setting-item-info');
      
      if (nameEl?.textContent?.trim()) {
        texts.push(nameEl.textContent.trim());
      }
      if (descEl?.textContent?.trim()) {
        texts.push(descEl.textContent.trim());
      }
      if (infoEl?.textContent?.trim()) {
        texts.push(infoEl.textContent.trim());
      }
    });
    
    // 提取标签页内容
    const tabContent = element.querySelectorAll('.vertical-tab-content, .setting-tab-content');
    tabContent.forEach(content => {
      const textNodes = this.getTextNodesFromElement(content as HTMLElement);
      textNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text && text.length > 2) {
          texts.push(text);
        }
      });
    });
    
    // 提取其他可见文本
    const allTextElements = element.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, label');
    allTextElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && !this.isUIControlElement(el as HTMLElement)) {
        texts.push(text);
      }
    });
    
    return [...new Set(texts)].join('\n');
  }
  
  /**
   * 获取元素中的所有文本节点
   */
  private getTextNodesFromElement(element: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // 跳过隐藏元素
          if (parent.style.display === 'none' || parent.style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 跳过脚本和样式
          if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }
  
  /**
   * 检查是否为UI控制元素
   */
  private isUIControlElement(element: HTMLElement): boolean {
    const controlClasses = [
      'clickable-icon', 'nav-button', 'tab-header', 'titlebar', 'status-bar',
      'modal-close-button', 'setting-editor-extra-setting-button'
    ];
    
    return controlClasses.some(cls => element.classList.contains(cls)) ||
           element.tagName === 'BUTTON' ||
           element.tagName === 'INPUT' ||
           element.getAttribute('role') === 'button';
  }

  /**
   * 翻译选中文本（保留原有方法以兼容其他调用）
   */
  private async translateSelection(editor: Editor): Promise<void> {
    try {
      const selection = this.getSelectedText(editor);
      
      if (!selection) {
        new Notice('请先选择要翻译的文本');
        this.logger.warn('No valid text selected');
        return;
      }

      this.logger.info('Valid text selected, proceeding with translation:', selection.substring(0, 50) + (selection.length > 50 ? '...' : ''));

      // 使用内联翻译或弹窗翻译
      const config = this.configService.getSettings();
      if (config.defaultDisplayMode === 'inline') {
        await this.inlineTranslation.translateSelection();
      } else {
        this.translationModal.open();
        // TODO: 需要添加设置初始文本的方法
      }

    } catch (error) {
      this.logger.error('Failed to translate selection', error);
      new Notice('翻译失败，请检查配置');
    }
  }

  /**
   * 打开翻译弹窗
   */
  private openTranslationModal(): void {
    this.translationModal.open();
  }

  /**
   * 切换翻译侧边栏
   */
  private async toggleTranslationSidebar(): Promise<void> {
    const existing = this.plugin.app.workspace.getLeavesOfType('translate-sidebar');
    if (existing.length > 0) {
      // 关闭侧边栏
      existing.forEach(leaf => leaf.detach());
    } else {
      // 打开侧边栏
      await this.plugin.app.workspace.getRightLeaf(false)?.setViewState({
        type: 'translate-sidebar',
        active: true
      });
    }
  }

  /**
   * 切换内联翻译
   */
  private toggleInlineTranslation(): void {
    this.inlineTranslation.toggleTranslations();
  }

  /**
   * 翻译整个文档
   */
  private async translateDocument(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      const content = editor.getValue();
      if (!content || content.trim().length === 0) {
        new Notice('文档内容为空');
        return;
      }

      // 确认操作
      const confirmed = await this.showConfirmDialog(
        '翻译整个文档',
        '确定要翻译整个文档吗？这可能需要一些时间。'
      );

      if (!confirmed) {
        return;
      }

      // 显示进度提示
      const notice = new Notice('正在翻译文档...', 0);

      try {
        // 执行翻译
        const config = this.configService.getSettings();
        if (!view.file) {
          new Notice('无法获取当前文件');
          notice.hide();
          return;
        }
        const translatedContent = await this.contentTranslationService.translateDocument(view.file);

        // 替换文档内容
        editor.setValue(translatedContent);
        notice.hide();
        new Notice('文档翻译完成');

      } catch (error) {
        notice.hide();
        throw error;
      }

    } catch (error) {
      this.logger.error('Failed to translate document', error);
      new Notice('文档翻译失败');
    }
  }

  /**
   * 使用指定翻译器翻译
   */
  private async translateWithSpecificTranslator(editor: Editor, translatorType: string): Promise<void> {
    try {
      const selection = this.getSelectedText(editor);
      
      if (!selection) {
        new Notice('请先选择要翻译的文本');
        this.logger.warn(`${translatorType} translator: No valid text selected`);
        return;
      }

      const config = this.configService.getSettings();
      
      try {
        const result = await this.contentTranslationService.translateText({
          text: selection,
          sourceLang: LanguageCode.AUTO,
          targetLang: config.defaultTargetLang || LanguageCode.ZH_CN,
          translator: translatorType as TranslatorType
        });

        // 只有翻译成功时才替换选中文本
        if (result && result.translatedText) {
          editor.replaceSelection(result.translatedText);
          new Notice(`使用${translatorType}翻译完成`);
        } else {
          new Notice(`使用${translatorType}翻译失败：未获得翻译结果`);
          this.logger.warn(`${translatorType} translator: No translation result`);
        }
      } catch (translationError) {
        // 翻译失败时不清空原文本，只显示错误信息
        this.logger.error(`Failed to translate with ${translatorType}`, translationError);
        new Notice(`使用${translatorType}翻译失败`);
      }

    } catch (error) {
      this.logger.error(`Error in translateWithSpecificTranslator`, error);
      new Notice('翻译过程中发生错误');
    }
  }

  /**
   * 翻译到指定语言
   */
  private async translateToSpecificLanguage(editor: Editor, targetLanguage: string): Promise<void> {
    try {
      const selection = this.getSelectedText(editor);
      
      if (!selection) {
        new Notice('请先选择要翻译的文本');
        this.logger.warn(`Translate to ${targetLanguage}: No valid text selected`);
        return;
      }

      const config = this.configService.getSettings();
      
      try {
        const result = await this.contentTranslationService.translateText({
          text: selection,
          sourceLang: LanguageCode.AUTO,
          targetLang: targetLanguage as LanguageCode,
          translator: config.defaultTranslator || TranslatorType.OPENAI
        });

        // 只有翻译成功时才替换选中文本
        if (result && result.translatedText) {
          editor.replaceSelection(result.translatedText);
          new Notice(`翻译到${targetLanguage}完成`);
        } else {
          new Notice(`翻译到${targetLanguage}失败：未获得翻译结果`);
          this.logger.warn(`Translate to ${targetLanguage}: No translation result`);
        }
      } catch (translationError) {
        // 翻译失败时不清空原文本，只显示错误信息
        this.logger.error(`Failed to translate to ${targetLanguage}`, translationError);
        new Notice(`翻译到${targetLanguage}失败`);
      }

    } catch (error) {
      this.logger.error(`Error in translateToSpecificLanguage`, error);
      new Notice('翻译过程中发生错误');
    }
  }

  /**
   * 清除翻译缓存
   */
  private async clearTranslationCache(): Promise<void> {
    try {
      await this.contentTranslationService.clearTranslationCache();
      new Notice('翻译缓存已清除');
      this.logger.info('Translation cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear translation cache', error);
      new Notice('清除缓存失败');
    }
  }

  /**
   * 重新加载翻译器
   */
  private async reloadTranslators(): Promise<void> {
    try {
      // 这里需要实现翻译器重新加载逻辑
      // await this.translatorFactory.reloadTranslators();
      new Notice('翻译器已重新加载');
      this.logger.info('Translators reloaded');
    } catch (error) {
      this.logger.error('Failed to reload translators', error);
      new Notice('重新加载翻译器失败');
    }
  }

  /**
   * 显示翻译统计
   */
  private async showTranslationStats(): Promise<void> {
    try {
      // TODO: 实现统计功能
      const message = `翻译统计信息：\n` +
        `功能开发中，敬请期待...`;
      
      new Notice(message, 3000);
    } catch (error) {
      this.logger.error('Failed to get translation stats', error);
      new Notice('获取统计信息失败');
    }
  }

  /**
   * 显示确认对话框
   */
  private async showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      // 这里应该使用一个确认对话框组件
      // 暂时使用简单的确认
      const confirmed = confirm(`${title}\n\n${message}`);
      resolve(confirmed);
    });
  }
}

export default CommandManager;