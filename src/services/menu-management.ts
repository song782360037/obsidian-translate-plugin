import { IMenuService } from '../interfaces';
import {
  MenuConfig,
  MenuItemConfig,
  MenuPosition,
  TranslatorType,
  LanguageCode,
  SelectedText,
  PluginSettings,
  TranslationRequest
} from '../types';
import { ConfigService } from './config';
import { ContentTranslationService } from './content-translation';
import { utils } from '../utils';
import { App, Menu, MenuItem, Editor, MarkdownView, Notice, TFile, Component } from 'obsidian';

/**
 * 菜单项类型
 */
type MenuItemType = 'translate' | 'separator' | 'submenu' | 'action';

/**
 * 菜单项定义
 */
interface MenuItemDefinition {
  id: string;
  type: MenuItemType;
  title: string;
  icon?: string;
  hotkey?: string;
  enabled: boolean;
  visible: boolean;
  action?: () => Promise<void> | void;
  submenu?: MenuItemDefinition[];
  translatorType?: TranslatorType;
  targetLanguage?: LanguageCode;
}

/**
 * 注册的菜单
 */
interface RegisteredMenu {
  id: string;
  position: MenuPosition;
  items: MenuItemDefinition[];
  element?: HTMLElement;
  isActive: boolean;
  eventRef?: any; // Obsidian事件监听器引用
}

/**
 * 菜单管理服务实现
 */
export class MenuManagementService {
  private app: App;
  private configService: ConfigService;
  private contentTranslationService: ContentTranslationService;
  private registeredMenus: Map<string, RegisteredMenu> = new Map();
  private contextMenuHandlers: Map<string, (event: MouseEvent) => void> = new Map();
  private logger = utils.logger.createChild('MenuManagementService');
  private isInitialized = false;

  constructor(
    app: App,
    configService: ConfigService,
    contentTranslationService: ContentTranslationService
  ) {
    this.app = app;
    this.configService = configService;
    this.contentTranslationService = contentTranslationService;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      await this.setupDefaultMenus();
      this.setupContextMenuHandlers();
      this.isInitialized = true;
      this.logger.info('Menu management service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize menu management service', error);
      throw error;
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      this.removeAllMenus();
      this.removeContextMenuHandlers();
      this.registeredMenus.clear();
      this.contextMenuHandlers.clear();
      this.isInitialized = false;
      this.logger.info('Menu management service destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy menu management service', error);
    }
  }

  /**
   * 注册菜单
   */
  registerMenu(config: MenuConfig): string {
    try {
      const menuId = config.id || utils.crypto.generateUUID();
      
      const menu: RegisteredMenu = {
        id: menuId,
        position: config.position,
        items: this.convertMenuItems(config.items),
        isActive: config.enabled !== false
      };

      this.registeredMenus.set(menuId, menu);
      
      if (menu.isActive) {
        this.activateMenu(menuId);
      }

      this.logger.info(`Menu registered: ${menuId}`);
      return menuId;
    } catch (error) {
      this.logger.error('Failed to register menu', error);
      throw error;
    }
  }

  /**
   * 注销菜单
   */
  unregisterMenu(menuId: string): boolean {
    try {
      const menu = this.registeredMenus.get(menuId);
      if (!menu) {
        return false;
      }

      this.deactivateMenu(menuId);
      this.registeredMenus.delete(menuId);
      
      this.logger.info(`Menu unregistered: ${menuId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to unregister menu', error);
      return false;
    }
  }

  /**
   * 更新菜单
   */
  updateMenu(menuId: string, config: Partial<MenuConfig>): boolean {
    try {
      const menu = this.registeredMenus.get(menuId);
      if (!menu) {
        return false;
      }

      // 更新菜单配置
      if (config.position !== undefined) {
        menu.position = config.position;
      }
      
      if (config.items !== undefined) {
        menu.items = this.convertMenuItems(config.items);
      }
      
      if (config.enabled !== undefined) {
        menu.isActive = config.enabled;
      }

      // 重新激活菜单
      this.deactivateMenu(menuId);
      if (menu.isActive) {
        this.activateMenu(menuId);
      }

      this.logger.info(`Menu updated: ${menuId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to update menu', error);
      return false;
    }
  }

  /**
   * 显示上下文菜单
   */
  showContextMenu(event: MouseEvent, items: MenuItemConfig[]): void {
    try {
      const menu = new Menu();
      
      for (const item of items) {
        this.addMenuItemToMenu(menu, item);
      }

      if (event instanceof MouseEvent) {
        if (event instanceof MouseEvent) {
        menu.showAtMouseEvent(event);
      } else {
        // 对于键盘事件，在当前光标位置显示菜单
        menu.showAtPosition({ x: 0, y: 0 });
      }
      } else {
        // 对于键盘事件，在当前光标位置显示菜单
        menu.showAtPosition({ x: 0, y: 0 });
      }
      this.logger.debug('Context menu shown');
    } catch (error) {
      this.logger.error('Failed to show context menu', error);
    }
  }

  /**
   * 显示翻译菜单
   */
  showTranslationMenu(event: MouseEvent | KeyboardEvent, selectedText?: string): void {
    try {
      const config = this.configService.getSettings();
      const menu = new Menu();

      // 添加快速翻译选项
      if (selectedText) {
        menu.addItem((item) => {
          item.setTitle('翻译选中文本')
            .setIcon('languages')
            .onClick(async () => {
              await this.translateSelectedText();
            });
        });

        menu.addSeparator();
      }

      // 添加翻译器选项
      const translators = Object.values(TranslatorType);
      for (const translator of translators) {
        if (config.translators[translator]?.enabled) {
          menu.addItem((item) => {
            item.setTitle(`使用 ${this.getTranslatorDisplayName(translator)}`)
              .setIcon('globe')
              .onClick(async () => {
                if (selectedText) {
                  await this.translateWithTranslator(selectedText, translator);
                }
              });
          });
        }
      }

      menu.addSeparator();

      // 添加语言选项
      const languages = this.getSupportedLanguages();
      const languageSubmenu = menu.addItem((item) => {
        item.setTitle('目标语言')
          .setIcon('globe');
      });

      // 创建语言子菜单
      const langMenu = new Menu();
      for (const [code, name] of languages) {
        langMenu.addItem((item) => {
          item.setTitle(name)
            .onClick(async () => {
              if (selectedText) {
                await this.translateToLanguage(selectedText, code);
              }
            });
        });
      }

      if (event instanceof MouseEvent) {
        menu.showAtMouseEvent(event);
      } else {
        // 对于键盘事件，在当前光标位置显示菜单
        menu.showAtPosition({ x: 0, y: 0 });
      }
      this.logger.debug('Translation menu shown');
    } catch (error) {
      this.logger.error('Failed to show translation menu', error);
    }
  }

  /**
   * 获取菜单配置
   */
  getMenuConfig(menuId: string): MenuConfig | null {
    const menu = this.registeredMenus.get(menuId);
    if (!menu) {
      return null;
    }

    return {
      id: menu.id,
      position: menu.position,
      items: this.convertMenuDefinitionsToConfig(menu.items),
      enabled: menu.isActive
    };
  }

  /**
   * 获取所有菜单
   */
  getAllMenus(): MenuConfig[] {
    return Array.from(this.registeredMenus.values()).map(menu => ({
      id: menu.id,
      position: menu.position,
      items: this.convertMenuDefinitionsToConfig(menu.items),
      enabled: menu.isActive
    }));
  }

  /**
   * 启用/禁用菜单
   */
  setMenuEnabled(menuId: string, enabled: boolean): boolean {
    try {
      const menu = this.registeredMenus.get(menuId);
      if (!menu) {
        return false;
      }

      if (menu.isActive === enabled) {
        return true;
      }

      menu.isActive = enabled;
      
      if (enabled) {
        this.activateMenu(menuId);
      } else {
        this.deactivateMenu(menuId);
      }

      this.logger.info(`Menu ${menuId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to set menu enabled state', error);
      return false;
    }
  }

  /**
   * 刷新所有菜单
   */
  refreshMenus(): void {
    try {
      for (const [menuId, menu] of this.registeredMenus) {
        if (menu.isActive) {
          this.deactivateMenu(menuId);
          this.activateMenu(menuId);
        }
      }
      
      this.logger.info('All menus refreshed');
    } catch (error) {
      this.logger.error('Failed to refresh menus', error);
    }
  }

  /**
   * 设置默认菜单
   */
  private async setupDefaultMenus(): Promise<void> {
    // 编辑器右键菜单
    const editorContextMenu: MenuConfig = {
      id: 'editor-context',
      position: MenuPosition.EDITOR_CONTEXT,
      items: [
        {
          id: 'translate-selection',
          title: '翻译选中文本',
          icon: 'languages',
          enabled: true,
          action: () => this.translateSelectedText()
        },
        {
          id: 'translate-replace-selection',
          title: '翻译并替换选中文本',
          icon: 'replace',
          enabled: true,
          action: () => this.translateAndReplaceSelectedText()
        },
        {
          id: 'translate-replace-document',
          title: '翻译并替换本篇文章',
          icon: 'file-text',
          enabled: true,
          action: () => this.translateAndReplaceDocument()
        },
        {
          id: 'translate-current-page',
          title: '翻译当前页面',
          icon: 'monitor',
          enabled: true,
          action: () => this.translateCurrentPage()
        },
        {
          id: 'translate-submenu',
          title: '翻译选项',
          icon: 'globe',
          enabled: true,
          submenu: [
            {
              id: 'translate-openai',
              title: '使用 OpenAI',
              enabled: true,
              action: () => this.translateWithTranslator(undefined, TranslatorType.OPENAI)
            },
            {
              id: 'translate-custom',
              title: '使用自定义接口',
              enabled: true,
              action: () => this.translateWithTranslator(undefined, TranslatorType.CUSTOM)
            }
          ]
        }
      ],
      enabled: true
    };

    // 文件菜单
    const fileMenu: MenuConfig = {
      id: 'file-menu',
      position: MenuPosition.FILE_MENU,
      items: [
        {
          id: 'translate-document',
          title: '翻译整个文档',
          icon: 'file-text',
          enabled: true,
          action: () => this.translateCurrentDocument()
        }
      ],
      enabled: true
    };

    // 注册默认菜单
    this.registerMenu(editorContextMenu);
    this.registerMenu(fileMenu);
  }

  /**
   * 设置上下文菜单处理器
   */
  private setupContextMenuHandlers(): void {
    // 上下文菜单现在通过setupDefaultMenus和activateEditorContextMenu处理
    // 移除重复的editor-menu事件监听器以避免菜单重复
    this.logger.debug('Context menu handlers setup completed (using default menu registration)');
  }

  /**
   * 移除上下文菜单处理器
   */
  private removeContextMenuHandlers(): void {
    // Obsidian的事件监听器会在插件卸载时自动清理
    // 这里清空本地存储的处理器引用
    this.contextMenuHandlers.clear();
  }

  /**
   * 激活菜单
   */
  private activateMenu(menuId: string): void {
    const menu = this.registeredMenus.get(menuId);
    if (!menu) return;

    switch (menu.position) {
      case MenuPosition.EDITOR_CONTEXT:
        this.activateEditorContextMenu(menu);
        break;
      case MenuPosition.FILE_MENU:
        this.activateFileMenu(menu);
        break;
      case MenuPosition.COMMAND_PALETTE:
        this.activateCommandPalette(menu);
        break;
      case MenuPosition.STATUS_BAR:
        this.activateStatusBar(menu);
        break;
    }
  }

  /**
   * 停用菜单
   */
  private deactivateMenu(menuId: string): void {
    const menu = this.registeredMenus.get(menuId);
    if (!menu) return;

    // 移除事件监听器
    if (menu.eventRef) {
      this.app.workspace.offref(menu.eventRef);
      menu.eventRef = undefined;
    }

    // 移除菜单元素
    if (menu.element) {
      menu.element.remove();
      menu.element = undefined;
    }
  }

  /**
   * 激活编辑器上下文菜单
   */
  private activateEditorContextMenu(menu: RegisteredMenu): void {
    // 先移除已存在的事件监听器，避免重复注册
    if (menu.eventRef) {
      this.app.workspace.offref(menu.eventRef);
    }
    
    // 使用Obsidian的editor-menu事件来注册编辑器右键菜单
    menu.eventRef = this.app.workspace.on('editor-menu', (obsidianMenu, editor, view) => {
      for (const item of menu.items) {
        if (item.enabled && item.visible !== false) {
          obsidianMenu.addItem((menuItem) => {
            menuItem.setTitle(item.title);
            if (item.icon) {
              menuItem.setIcon(item.icon);
            }
            if (item.action) {
              menuItem.onClick(() => item.action!());
            }
          });
        }
      }
    });
  }

  /**
   * 激活文件菜单
   */
  private activateFileMenu(menu: RegisteredMenu): void {
    // 先移除已存在的事件监听器，避免重复注册
    if (menu.eventRef) {
      this.app.workspace.offref(menu.eventRef);
    }
    
    // 在文件浏览器中添加菜单项
    menu.eventRef = this.app.workspace.on('file-menu', (fileMenu, file) => {
      for (const item of menu.items) {
        if (item.enabled && item.visible !== false) {
          fileMenu.addItem((menuItem) => {
            menuItem.setTitle(item.title);
            if (item.icon) {
              menuItem.setIcon(item.icon);
            }
            if (item.action) {
              menuItem.onClick(() => item.action!());
            }
          });
        }
      }
    });
  }

  /**
   * 激活命令面板
   */
  private activateCommandPalette(menu: RegisteredMenu): void {
    // TODO: 实现命令面板功能
    // 注意: app.commands 不是标准的 Obsidian API
    this.logger.debug('Command palette activation not implemented');
  }

  /**
   * 激活状态栏
   */
  private activateStatusBar(menu: RegisteredMenu): void {
    // TODO: 实现状态栏功能
    // 注意: app.statusBar 不是标准的 Obsidian API
    this.logger.debug('Status bar activation not implemented');
  }

  /**
   * 移除所有菜单
   */
  private removeAllMenus(): void {
    for (const menuId of this.registeredMenus.keys()) {
      this.deactivateMenu(menuId);
    }
  }

  /**
   * 转换菜单项配置
   */
  private convertMenuItems(items: MenuItemConfig[]): MenuItemDefinition[] {
    return items.map(item => ({
      id: item.id,
      type: this.getMenuItemType(item),
      title: item.title,
      icon: item.icon,
      hotkey: item.hotkey,
      enabled: item.enabled !== false,
      visible: item.visible !== false,
      action: item.action,
      submenu: item.submenu ? this.convertMenuItems(item.submenu) : undefined,
      translatorType: item.translatorType,
      targetLanguage: item.targetLanguage
    }));
  }

  /**
   * 转换菜单定义为配置
   */
  private convertMenuDefinitionsToConfig(items: MenuItemDefinition[]): MenuItemConfig[] {
    return items.map(item => ({
      id: item.id,
      title: item.title,
      icon: item.icon,
      hotkey: item.hotkey,
      enabled: item.enabled,
      visible: item.visible,
      action: item.action,
      submenu: item.submenu ? this.convertMenuDefinitionsToConfig(item.submenu) : undefined,
      translatorType: item.translatorType,
      targetLanguage: item.targetLanguage
    }));
  }

  /**
   * 获取菜单项类型
   */
  private getMenuItemType(item: MenuItemConfig): MenuItemType {
    if (item.submenu) return 'submenu';
    if (item.title === '-' || item.title === 'separator') return 'separator';
    if (item.translatorType) return 'translate';
    return 'action';
  }

  /**
   * 添加菜单项到菜单
   */
  private addMenuItemToMenu(menu: Menu, item: MenuItemConfig): void {
    if (item.title === '-' || item.title === 'separator') {
      menu.addSeparator();
      return;
    }

    menu.addItem((menuItem) => {
      menuItem.setTitle(item.title);
      
      if (item.icon) {
        menuItem.setIcon(item.icon);
      }
      
      if (item.action) {
        menuItem.onClick(item.action);
      }
    });
  }

  /**
   * 翻译选中文本
   */
  private async translateSelectedText(): Promise<void> {
    try {
      const selectedText = this.contentTranslationService.getSelectedText();
      if (!selectedText) {
        new Notice('请先选择要翻译的文本');
        return;
      }
      
      const result = await this.contentTranslationService.translateSelectedText(selectedText);
      if (result && result.translatedText) {
        new Notice(`翻译结果: ${result.translatedText}`);
      }
    } catch (error) {
      this.logger.error('Failed to translate selected text', error);
      new Notice('翻译失败');
    }
  }

  /**
   * 使用指定翻译器翻译
   */
  private async translateWithTranslator(
    text: string | undefined,
    translator: TranslatorType
  ): Promise<void> {
    try {
      if (!text) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        
        text = activeView.editor.getSelection();
        if (!text.trim()) {
          new Notice('请先选择要翻译的文本');
          return;
        }
      }

      const result = await this.contentTranslationService.translateText({
        text,
        sourceLang: LanguageCode.AUTO,
        targetLang: this.configService.getSettings().defaultTargetLang,
        translator
      });
      
      if (result.translatedText) {
        new Notice(`翻译结果: ${result.translatedText}`);
      }
    } catch (error) {
      this.logger.error('Failed to translate with translator', error);
      new Notice('翻译失败');
    }
  }

  /**
   * 翻译到指定语言
   */
  private async translateToLanguage(text: string, targetLanguage: LanguageCode): Promise<void> {
    try {
      const result = await this.contentTranslationService.translateText({
        text,
        sourceLang: LanguageCode.AUTO,
        targetLang: targetLanguage,
        translator: this.configService.getSettings().defaultTranslator
      });
      
      if (result.translatedText) {
        new Notice(`翻译结果: ${result.translatedText}`);
      }
    } catch (error) {
      this.logger.error('Failed to translate to language', error);
      new Notice('翻译失败');
    }
  }

  /**
   * 翻译当前文档
   */
  private async translateCurrentDocument(): Promise<void> {
    try {
      const translatedContent = await this.contentTranslationService.translateDocument();
      
      // 创建新文件或替换当前文件内容
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const newFileName = activeFile.basename + '_translated.md';
        await this.app.vault.create(newFileName, translatedContent);
        new Notice(`翻译完成，已保存为: ${newFileName}`);
      }
    } catch (error) {
      this.logger.error('Failed to translate document', error);
      new Notice('文档翻译失败');
    }
  }

  /**
   * 获取翻译器显示名称
   */
  private getTranslatorDisplayName(translator: TranslatorType): string {
    const names: Record<TranslatorType, string> = {
      [TranslatorType.OPENAI]: 'OpenAI',
      [TranslatorType.CUSTOM]: '自定义接口'
    };
    
    return names[translator] || translator;
  }

  /**
   * 获取支持的语言
   */
  private getSupportedLanguages(): Array<[LanguageCode, string]> {
    return [
      [LanguageCode.ZH_CN, '中文(简体)'],
      [LanguageCode.ZH_TW, '中文(繁体)'],
      [LanguageCode.EN, '英语'],
      [LanguageCode.JA, '日语'],
      [LanguageCode.KO, '韩语'],
      [LanguageCode.FR, '法语'],
      [LanguageCode.DE, '德语'],
      [LanguageCode.ES, '西班牙语'],
      [LanguageCode.RU, '俄语'],
      [LanguageCode.AR, '阿拉伯语']
    ];
  }

  /**
   * 翻译并替换选中文本
   */
  private async translateAndReplaceSelectedText(): Promise<void> {
    try {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) {
        new Notice('请在编辑器中选择文本');
        return;
      }

      const editor = activeView.editor;
      const selectedText = editor.getSelection();
      
      if (!selectedText.trim()) {
        new Notice('请先选择要翻译的文本');
        return;
      }

      // 显示翻译进度
      const notice = new Notice('正在翻译...', 0);
      
      try {
        const result = await this.contentTranslationService.translateText({
          text: selectedText,
          sourceLang: LanguageCode.AUTO,
          targetLang: this.configService.getSettings().defaultTargetLang,
          translator: this.configService.getSettings().defaultTranslator
        });
        
        if (result.translatedText) {
          // 替换选中的文本，保持原有格式
          editor.replaceSelection(result.translatedText);
          notice.hide();
          new Notice('翻译并替换完成');
        } else {
          notice.hide();
          new Notice('翻译失败：未获取到翻译结果');
        }
      } catch (error) {
        notice.hide();
        this.logger.error('Translation failed', error);
        new Notice('翻译失败');
      }
    } catch (error) {
      this.logger.error('Failed to translate and replace selected text', error);
      new Notice('翻译并替换失败');
    }
  }

  /**
   * 翻译并替换整个文档
   */
  private async translateAndReplaceDocument(): Promise<void> {
    try {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) {
        new Notice('请在编辑器中打开文档');
        return;
      }

      const editor = activeView.editor;
      const documentContent = editor.getValue();
      
      if (!documentContent.trim()) {
        new Notice('文档内容为空');
        return;
      }

      // 显示翻译进度
      const notice = new Notice('正在翻译整个文档，请稍候...', 0);
      
      try {
        // 分段翻译以保持格式
        const translatedContent = await this.translateDocumentWithFormatPreservation(documentContent);
        
        if (translatedContent) {
          // 替换整个文档内容
          editor.setValue(translatedContent);
          notice.hide();
          new Notice('文档翻译并替换完成');
        } else {
          notice.hide();
          new Notice('翻译失败：未获取到翻译结果');
        }
      } catch (error) {
        notice.hide();
        this.logger.error('Document translation failed', error);
        new Notice('文档翻译失败');
      }
    } catch (error) {
      this.logger.error('Failed to translate and replace document', error);
      new Notice('文档翻译并替换失败');
    }
  }

  /**
   * 保持格式的文档翻译
   */
  private async translateDocumentWithFormatPreservation(content: string): Promise<string> {
    // 分割文档为段落，保持Markdown格式
    const lines = content.split('\n');
    const translatedLines: string[] = [];
    
    for (const line of lines) {
      // 跳过空行和纯Markdown语法行
      if (!line.trim() || this.isMarkdownSyntaxLine(line)) {
        translatedLines.push(line);
        continue;
      }
      
      // 提取文本内容进行翻译
      const textToTranslate = this.extractTextFromMarkdownLine(line);
      if (textToTranslate.trim()) {
        try {
          const result = await this.contentTranslationService.translateText({
            text: textToTranslate,
            sourceLang: LanguageCode.AUTO,
            targetLang: this.configService.getSettings().defaultTargetLang,
            translator: this.configService.getSettings().defaultTranslator
          });
          
          if (result.translatedText) {
            // 重新组装带格式的行
            const translatedLine = this.reconstructMarkdownLine(line, textToTranslate, result.translatedText);
            translatedLines.push(translatedLine);
          } else {
            translatedLines.push(line);
          }
        } catch (error) {
          this.logger.warn('Failed to translate line, keeping original', { line, error });
          translatedLines.push(line);
        }
      } else {
        translatedLines.push(line);
      }
    }
    
    return translatedLines.join('\n');
  }

  /**
   * 检查是否为纯Markdown语法行
   */
  private isMarkdownSyntaxLine(line: string): boolean {
    const trimmed = line.trim();
    // 检查各种Markdown语法
    return (
      trimmed.startsWith('---') || // 分隔线
      trimmed.startsWith('```') || // 代码块
      !!trimmed.match(/^#{1,6}\s*$/) || // 空标题
      !!trimmed.match(/^\s*[-*+]\s*$/) || // 空列表项
      !!trimmed.match(/^\s*\d+\.\s*$/) || // 空有序列表项
      !!trimmed.match(/^\s*>\s*$/) || // 空引用
      (!!trimmed.match(/^\s*\|.*\|\s*$/) && !!trimmed.match(/^\s*\|[-\s:]*\|\s*$/)) // 表格分隔行
    );
  }

  /**
   * 从Markdown行中提取文本内容
   */
  private extractTextFromMarkdownLine(line: string): string {
    // 移除Markdown格式，保留文本内容
    let text = line;
    
    // 移除标题标记
    text = text.replace(/^#{1,6}\s*/, '');
    
    // 移除列表标记
    text = text.replace(/^\s*[-*+]\s*/, '');
    text = text.replace(/^\s*\d+\.\s*/, '');
    
    // 移除引用标记
    text = text.replace(/^\s*>\s*/, '');
    
    // 移除链接和图片语法，保留文本
    text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    
    // 移除行内代码
    text = text.replace(/`([^`]*)`/g, '$1');
    
    // 移除粗体和斜体标记
    text = text.replace(/\*\*([^*]*)\*\*/g, '$1');
    text = text.replace(/\*([^*]*)\*/g, '$1');
    text = text.replace(/__([^_]*)__/g, '$1');
    text = text.replace(/_([^_]*)_/g, '$1');
    
    return text.trim();
  }

  /**
   * 重新组装带格式的Markdown行
   */
  private reconstructMarkdownLine(originalLine: string, originalText: string, translatedText: string): string {
    // 简单替换原文本为翻译文本，保持格式
    return originalLine.replace(originalText, translatedText);
  }

  /**
   * 翻译当前页面
   */
  private async translateCurrentPage(): Promise<void> {
    try {
      const pageText = this.getCurrentPageText();
      
      if (!pageText || pageText.trim().length === 0) {
        new Notice('当前页面没有可翻译的文本内容');
        return;
      }

      this.logger.info('Translating current page text:', pageText.substring(0, 100) + (pageText.length > 100 ? '...' : ''));
      
      // 显示加载提示
      const notice = new Notice('正在翻译当前页面...', 0);
      
      try {
        const config = this.configService.getSettings();
        const result = await this.contentTranslationService.translateText({
          text: pageText,
          sourceLang: LanguageCode.AUTO,
          targetLang: config.defaultTargetLang || LanguageCode.ZH_CN,
          translator: config.defaultTranslator || TranslatorType.OPENAI
        });
        
        notice.hide();
        
        if (result.translatedText) {
          // 动态导入GlobalTranslationResultModal
          const { GlobalTranslationResultModal } = await import('../ui/global-translation-modal');
          
          // 显示翻译结果弹窗
          const resultModal = new GlobalTranslationResultModal(
            this.app,
            pageText,
            result.translatedText
          );
          resultModal.open();
        } else {
          new Notice('翻译失败：未获取到翻译结果');
        }
      } catch (error) {
        notice.hide();
        this.logger.error('Current page translation failed', error);
        new Notice('翻译当前页面失败');
      }

    } catch (error) {
      this.logger.error('Failed to translate current page', error);
      new Notice('翻译当前页面失败');
    }
  }

  /**
   * 获取当前页面的文本内容
   */
  private getCurrentPageText(): string {
    try {
      // 首先尝试从编辑器获取内容
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.editor) {
        const content = activeView.editor.getValue();
        if (content && content.trim().length > 0) {
          return content;
        }
      }
      
      // 如果不是编辑器视图，尝试从DOM获取可见文本
      const contentEl = document.querySelector('.workspace-leaf.mod-active .view-content');
      if (contentEl) {
        // 获取所有文本节点的内容
        const textContent = this.extractTextFromElement(contentEl as HTMLElement);
        return textContent;
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
    
    // 递归遍历所有子节点
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过脚本和样式标签
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 跳过隐藏元素
          if (parent && window.getComputedStyle(parent).display === 'none') {
            return NodeFilter.FILTER_REJECT;
          }
          
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          
          return NodeFilter.FILTER_REJECT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text && text.length > 0) {
        textParts.push(text);
      }
    }
    
    return textParts.join(' ').trim();
  }
}