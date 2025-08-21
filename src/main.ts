import { Plugin, TFile, Editor, MarkdownView, Notice, Modal, App } from 'obsidian';
import { PluginSettings, TranslatorType, LanguageCode } from './types';
import {
  ConfigService,
  ContentTranslationService,
  SettingsTranslationService,
  MenuManagementService,
  serviceManager
} from './services';
import {
  TranslationModal,
  TranslationSidebarView,
  InlineTranslationComponent,
  TranslateSettingTab,
  uiManager
} from './ui';
import { TranslatorFactory } from './translator';
import { utils } from './utils';
import { CommandManager } from './commands';
import { GlobalTranslationResultModal } from './ui/global-translation-modal';

/**
 * Obsidian 翻译插件主类
 */
export class TranslatePlugin extends Plugin {
  // 服务实例
  private configService!: ConfigService;
  private contentTranslationService!: ContentTranslationService;
  private settingsTranslationService!: SettingsTranslationService;
  private menuManagementService!: MenuManagementService;
  
  // UI组件实例
  private translationModal!: TranslationModal;
  private sidebarView!: TranslationSidebarView | null;
  private inlineTranslation!: InlineTranslationComponent;
  private settingTab!: TranslateSettingTab;
  
  // 翻译器工厂
  private translatorFactory!: TranslatorFactory;
  
  // 命令管理器
  private commandManager!: CommandManager;
  
  // 日志记录器
  private logger = console; // TODO: 实现日志记录器
  
  // 插件状态
  private isInitialized = false;
  private isEnabled = true;

  /**
   * 插件加载时调用
   */
  async onload(): Promise<void> {
    this.logger.info('Loading Translate Plugin...');
    
    try {
      // 初始化服务层
      await this.initializeServices();
      
      // 初始化UI层
      await this.initializeUI();
      
      // 初始化命令管理器
      this.initializeCommandManager();
      
      // 注册命令
      this.commandManager.registerCommands();
      
      // 注册事件监听器
      this.registerEventListeners();
      
      // 注册设置页面
      this.addSettingTab(this.settingTab);
      
      // 标记为已初始化
      this.isInitialized = true;
      
      this.logger.info('Translate Plugin loaded successfully');
      
    } catch (error) {
      this.logger.error('Failed to load Translate Plugin', error);
      new Notice('翻译插件加载失败，请检查配置');
    }
  }

  /**
   * 插件卸载时调用
   */
  async onunload(): Promise<void> {
    this.logger.info('Unloading Translate Plugin...');
    
    try {
      // 销毁UI组件
      uiManager.destroyAll();
      
      // 销毁服务
      await serviceManager.destroyAll();
      
      // 重置状态
      this.isInitialized = false;
      
      this.logger.info('Translate Plugin unloaded successfully');
      
    } catch (error) {
      this.logger.error('Error during plugin unload', error);
    }
  }

  /**
   * 初始化服务层
   */
  private async initializeServices(): Promise<void> {
    this.logger.info('Initializing services...');
    
    // 创建配置服务
    this.configService = new ConfigService(this.app);
    serviceManager.register('config', this.configService);
    
    // 创建翻译器工厂并初始化翻译器
    this.translatorFactory = TranslatorFactory.getInstance();
    
    // 初始化所有翻译器
    const { initializeTranslators } = await import('./translator');
    await initializeTranslators();
    
    // 创建内容翻译服务
    this.contentTranslationService = new ContentTranslationService(
      this.app,
      this.configService,
      this.translatorFactory
    );
    serviceManager.register('contentTranslation', this.contentTranslationService);
    
    // 创建设置翻译服务
    this.settingsTranslationService = new SettingsTranslationService(
      this.app,
      this.configService,
      this.translatorFactory
    );
    serviceManager.register('settingsTranslation', this.settingsTranslationService);
    
    // 创建菜单管理服务
    this.menuManagementService = new MenuManagementService(
      this.app,
      this.configService,
      this.contentTranslationService
    );
    serviceManager.register('menuManagement', this.menuManagementService);
    
    // 初始化所有服务
    await serviceManager.initializeAll();
    
    this.logger.info('Services initialized successfully');
  }

  /**
   * 初始化UI层
   */
  private async initializeUI(): Promise<void> {
    this.logger.info('Initializing UI components...');
    
    const config = this.configService.getSettings();
    
    // 创建翻译弹窗
    this.translationModal = new TranslationModal(
      this.app,
      {
        defaultTranslator: config.defaultTranslator || TranslatorType.OPENAI,
        targetLanguage: config.defaultTargetLang || LanguageCode.ZH_CN
      },
      this.contentTranslationService
    );
    uiManager.registerComponent('modal', this.translationModal);
    
    // 侧边栏视图将在registerView时初始化，这里不需要注册
    
    // 注册侧边栏视图
    this.registerView(
      'translate-sidebar',
      (leaf) => {
        const sidebarView = new TranslationSidebarView(
          leaf,
          this.contentTranslationService,
          this.configService
        );
        this.sidebarView = sidebarView;
        return sidebarView;
      }
    );
    
    // 创建内联翻译组件
    this.inlineTranslation = new InlineTranslationComponent(
      this.contentTranslationService,
      {}
    );
    uiManager.registerComponent('inline', this.inlineTranslation);
    
    // 创建设置页面
    this.settingTab = new TranslateSettingTab(
      this.app,
      this,
      this.configService
    );
    uiManager.registerComponent('settings', this.settingTab);
    
    // 初始化所有UI组件
    uiManager.initializeAll();
    
    this.logger.info('UI components initialized successfully');
  }

  /**
   * 初始化命令管理器
   */
  private initializeCommandManager(): void {
    this.commandManager = new CommandManager(
      this,
      this.configService,
      this.contentTranslationService,
      this.translationModal,
      this.inlineTranslation,
      this.translatorFactory
    );
  }

  /**
   * 注册事件监听器
   */
  private registerEventListeners(): void {
    this.logger.info('Registering event listeners...');
    
    // 监听文件切换事件
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.onActiveLeafChange();
      })
    );
    
    // 监听编辑器变化事件
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor: Editor) => {
        this.onEditorChange(editor);
      })
    );
    
    // 监听配置变化事件
    this.configService.onConfigChange((config: PluginSettings) => {
      this.onConfigChanged(config);
    });
    
    // 注册全局键盘事件监听器
    this.registerGlobalEventListeners();
    
    this.logger.info('Event listeners registered successfully');
  }



  /**
   * 活动叶子变化处理
   */
  private onActiveLeafChange(): void {
    // 清除内联翻译
    if (this.inlineTranslation) {
      this.inlineTranslation.clearAllTranslations();
    }
  }

  /**
   * 编辑器变化处理
   */
  private onEditorChange(editor: Editor): void {
    // 可以在这里实现自动翻译逻辑
  }

  /**
   * 配置变化处理
   */
  private onConfigChanged(config: PluginSettings): void {
    this.logger.info('Configuration changed, updating components...');
    
    // 更新UI组件配置
    if (this.inlineTranslation) {
      this.inlineTranslation.updateConfig({});
    }
    
    // 翻译器工厂是单例模式，不需要配置更新
    // TranslatorFactory会通过ConfigService获取最新配置
  }

  /**
   * 注册全局事件监听器
   */
  private registerGlobalEventListeners(): void {
    // 全局键盘事件监听器
    const globalKeyHandler = (event: KeyboardEvent) => {
      this.handleGlobalKeyEvent(event);
    };
    
    // 全局右键菜单事件监听器
    const globalContextMenuHandler = (event: MouseEvent) => {
      this.handleGlobalContextMenu(event);
    };
    
    // 注册全局事件
    document.addEventListener('keydown', globalKeyHandler);
    document.addEventListener('contextmenu', globalContextMenuHandler);
    
    // 保存事件监听器引用以便清理
    this.registerDomEvent(document, 'keydown', globalKeyHandler);
    this.registerDomEvent(document, 'contextmenu', globalContextMenuHandler);
    
    this.logger.info('Global event listeners registered');
  }

  /**
   * 处理全局键盘事件
   */
  private handleGlobalKeyEvent(event: KeyboardEvent): void {
    // 检查是否是翻译快捷键 (Ctrl+Shift+T)
    if (event.ctrlKey && event.shiftKey && event.key === 'T') {
      event.preventDefault();
      this.handleGlobalTranslation();
      return;
    }
    
    // 检查是否是打开翻译弹窗快捷键 (Ctrl+Shift+O)
    if (event.ctrlKey && event.shiftKey && event.key === 'O') {
      event.preventDefault();
      this.translationModal.open();
      return;
    }
    
    // 检查是否是设置页面翻译快捷键 (Ctrl+Shift+P)
    if (event.ctrlKey && event.shiftKey && event.key === 'P') {
      event.preventDefault();
      this.handleSettingsTranslation();
      return;
    }
  }

  /**
   * 处理全局右键菜单
   */
  private handleGlobalContextMenu(event: MouseEvent): void {
    // 获取选中的文本
    const selectedText = this.getGlobalSelectedText();
    
    if (selectedText && selectedText.trim().length > 0) {
      // 延迟处理，确保原生右键菜单已显示
      setTimeout(() => {
        this.addTranslationToContextMenu(event, selectedText);
      }, 10);
    }
  }

  /**
   * 获取全局选中文本
   */
  private getGlobalSelectedText(): string {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      return selection.toString().trim();
    }
    return '';
  }

  /**
   * 处理全局翻译
   */
  private async handleGlobalTranslation(): Promise<void> {
    const selectedText = this.getGlobalSelectedText();
    
    if (!selectedText || selectedText.trim().length === 0) {
      new Notice('请先选择要翻译的文本');
      return;
    }
    
    try {
      // 使用默认配置进行翻译
      const config = this.configService.getSettings();
      const sourceLang = LanguageCode.AUTO;
      const targetLang = config.defaultTargetLang || LanguageCode.ZH_CN;
      const translatorType = config.defaultTranslator || TranslatorType.OPENAI;
      
      // 检查文本长度，决定是否需要分段翻译
      const maxChunkSize = 1000; // 每段最大字符数
      
      if (selectedText.length <= maxChunkSize) {
        // 短文本，直接翻译
        const request = {
          text: selectedText,
          sourceLang,
          targetLang,
          translator: translatorType
        };
        
        const result = await this.contentTranslationService.translateText(request);
        this.showGlobalTranslationResult(selectedText, result.translatedText);
      } else {
        // 长文本，使用分段翻译
        await this.handleBatchGlobalTranslation(selectedText, sourceLang, targetLang, translatorType);
      }
      
    } catch (error) {
      this.logger.error('Global translation failed', error);
      new Notice('翻译失败，请检查网络连接和配置');
    }
  }

  /**
   * 处理批量全局翻译
   */
  private async handleBatchGlobalTranslation(
    text: string,
    sourceLang: LanguageCode,
    targetLang: LanguageCode,
    translatorType: TranslatorType
  ): Promise<void> {
    // 显示进度通知
    const progressNotice = new Notice('正在翻译中...', 0);
    
    try {
      // 将文本分段
      const textChunks = this.splitTextIntoChunks(text, 1000);
      
      // 启动批量翻译
      const taskId = await this.contentTranslationService.startBatchTranslation(
        textChunks,
        sourceLang,
        targetLang,
        translatorType
      );
      
      // 监控翻译进度
      await this.monitorBatchTranslation(taskId, progressNotice);
      
      // 获取翻译结果
      const progress = this.contentTranslationService.getBatchTranslationProgress(taskId);
      if (progress && progress.status === 'completed') {
        // 重新组装翻译结果
        const translatedText = this.reassembleTranslatedText(textChunks, progress.results);
        this.showGlobalTranslationResult(text, translatedText);
      } else {
        throw new Error('批量翻译未完成或失败');
      }
      
    } catch (error) {
      this.logger.error('Batch global translation failed', error);
      new Notice('批量翻译失败，请检查网络连接和配置');
    } finally {
      progressNotice.hide();
    }
  }
  
  /**
   * 将文本分割成块
   */
  private splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      // 如果当前行加上现有块会超过限制，先保存当前块
      if (currentChunk.length + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        // 添加到当前块
        if (currentChunk.length > 0) {
          currentChunk += '\n' + line;
        } else {
          currentChunk = line;
        }
      }
    }
    
    // 添加最后一个块
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  /**
   * 监控批量翻译进度
   */
  private async monitorBatchTranslation(taskId: string, progressNotice: Notice): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkProgress = () => {
        const progress = this.contentTranslationService.getBatchTranslationProgress(taskId);
        
        if (!progress) {
          reject(new Error('翻译任务未找到'));
          return;
        }
        
        // 更新进度显示
        progressNotice.setMessage(`翻译进度: ${Math.round(progress.progress)}%`);
        
        if (progress.status === 'completed') {
          resolve();
        } else if (progress.status === 'failed') {
          reject(new Error('翻译任务失败'));
        } else {
          // 继续检查
          setTimeout(checkProgress, 1000);
        }
      };
      
      checkProgress();
    });
  }
  
  /**
   * 重新组装翻译文本
   */
  private reassembleTranslatedText(originalChunks: string[], results: any[]): string {
    const translatedChunks: string[] = [];
    
    for (let i = 0; i < originalChunks.length && i < results.length; i++) {
      const result = results[i];
      if (result.status === 'success') {
        translatedChunks.push(result.translatedText);
      } else {
        // 如果翻译失败，保留原文
        translatedChunks.push(originalChunks[i]);
      }
    }
    
    return translatedChunks.join('\n\n');
  }

  /**
   * 处理设置页面翻译
   */
  private async handleSettingsTranslation(): Promise<void> {
    try {
      // 检查是否在设置页面
      const settingsContainer = this.getSettingsContainer();
      if (!settingsContainer) {
        new Notice('请在设置页面中使用此快捷键');
        return;
      }
      
      // 检查当前翻译状态
      const isTranslated = this.settingsTranslationService.isTranslated();
      
      if (isTranslated) {
        // 如果已翻译，则恢复原文
        await this.settingsTranslationService.restoreOriginalSettings();
        new Notice('设置页面已恢复原文');
      } else {
        // 如果未翻译，则进行翻译
        await this.settingsTranslationService.translateSettingsPage(settingsContainer);
        new Notice('设置页面翻译完成');
      }
      
    } catch (error) {
      this.logger.error('Settings translation failed', error);
      new Notice('设置页面翻译失败，请检查配置');
    }
  }
  
  /**
   * 获取设置容器
   */
  private getSettingsContainer(): HTMLElement | null {
    // 检查是否在设置模态框中
    const settingsModal = document.querySelector('.modal-content .setting-item-container');
    if (settingsModal) {
      return settingsModal as HTMLElement;
    }
    
    // 检查是否在设置页面中
    const settingsPage = document.querySelector('.workspace-leaf-content .setting-item-container');
    if (settingsPage) {
      return settingsPage as HTMLElement;
    }
    
    // 检查其他可能的设置容器
    const settingsContent = document.querySelector('.modal-content');
    if (settingsContent && settingsContent.querySelector('.setting-item')) {
      return settingsContent as HTMLElement;
    }
    
    return null;
  }

  /**
    * 显示全局翻译结果
    */
   private showGlobalTranslationResult(originalText: string, translatedText: string): void {
     // 创建一个临时的通知显示翻译结果
     const modal = new GlobalTranslationResultModal(this.app, originalText, translatedText);
     modal.open();
   }

  /**
   * 添加翻译选项到右键菜单
   */
  private addTranslationToContextMenu(event: MouseEvent, selectedText: string): void {
    // 这里可以通过DOM操作添加翻译选项到现有的右键菜单
    // 由于Obsidian的右键菜单实现复杂，这里使用简化的实现
    
    // 创建自定义右键菜单
    const menu = document.createElement('div');
    menu.className = 'global-translation-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${event.clientX}px;
      top: ${event.clientY}px;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 4px;
      box-shadow: var(--shadow-s);
      z-index: 10000;
      min-width: 120px;
    `;
    
    // 添加翻译选项
    const translateOption = document.createElement('div');
    translateOption.className = 'menu-item';
    translateOption.textContent = '翻译选中文本';
    translateOption.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 4px;
    `;
    
    translateOption.addEventListener('click', () => {
      this.handleGlobalTranslation();
      menu.remove();
    });
    
    translateOption.addEventListener('mouseenter', () => {
      translateOption.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    
    translateOption.addEventListener('mouseleave', () => {
      translateOption.style.backgroundColor = 'transparent';
    });
    
    menu.appendChild(translateOption);
    document.body.appendChild(menu);
    
    // 点击其他地方时移除菜单
    const removeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 100);
  }

  /**
   * 显示确认对话框
   */
  private async showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(this.app, title, message, resolve);
      modal.open();
    });
  }

  /**
   * 启用插件
   */
  public enable(): void {
    this.isEnabled = true;
    this.logger.info('Plugin enabled');
  }

  /**
   * 禁用插件
   */
  public disable(): void {
    this.isEnabled = false;
    this.logger.info('Plugin disabled');
  }

  /**
   * 检查插件是否已启用
   */
  public isPluginEnabled(): boolean {
    return this.isEnabled && this.isInitialized;
  }

  /**
   * 获取配置服务
   */
  public getConfigService(): ConfigService {
    return this.configService;
  }

  /**
   * 获取内容翻译服务
   */
  public getContentTranslationService(): ContentTranslationService {
    return this.contentTranslationService;
  }

  /**
   * 获取翻译器工厂
   */
  public getTranslatorFactory(): TranslatorFactory {
    return this.translatorFactory;
  }
}

/**
 * 确认对话框
 */
class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private callback: (result: boolean) => void;

  constructor(app: App, title: string, message: string, callback: (result: boolean) => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.callback = callback;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });
    
    const buttonContainer = contentEl.createDiv('modal-button-container');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    `;
    
    const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => {
      this.callback(false);
      this.close();
    });
    
    const confirmBtn = buttonContainer.createEl('button', {
      text: '确定',
      cls: 'mod-cta'
    });
    confirmBtn.addEventListener('click', () => {
      this.callback(true);
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// 默认导出
export default TranslatePlugin;