import { PluginSettings, TranslationRequest, TranslationResponse, SelectedText, MenuItemConfig, EventData } from '../types';

/**
 * 配置管理服务接口
 */
export interface IConfigService {
  /**
   * 加载配置
   */
  loadSettings(): Promise<PluginSettings>;

  /**
   * 保存配置
   * @param settings 插件设置
   */
  saveSettings(settings: PluginSettings): Promise<void>;

  /**
   * 获取当前配置
   */
  getSettings(): PluginSettings;

  /**
   * 更新配置
   * @param updates 配置更新
   */
  updateSettings(updates: Partial<PluginSettings>): Promise<void>;

  /**
   * 重置配置为默认值
   */
  resetSettings(): Promise<void>;

  /**
   * 加密敏感数据
   * @param data 要加密的数据
   */
  encryptSensitiveData(data: string): string;

  /**
   * 解密敏感数据
   * @param encryptedData 加密的数据
   */
  decryptSensitiveData(encryptedData: string): string;
}

/**
 * 内容翻译服务接口
 */
export interface IContentTranslationService {
  /**
   * 翻译选中的文本
   * @param selectedText 选中的文本信息
   */
  translateSelectedText(selectedText: SelectedText): Promise<TranslationResponse>;

  /**
   * 翻译并替换选中的文本
   * @param selectedText 选中的文本信息
   */
  translateAndReplace(selectedText: SelectedText): Promise<void>;

  /**
   * 翻译指定文本
   * @param request 翻译请求
   */
  translateText(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * 获取当前选中的文本
   */
  getSelectedText(): SelectedText | null;

  /**
   * 批量翻译文本
   * @param requests 翻译请求数组
   */
  batchTranslate(requests: TranslationRequest[]): Promise<TranslationResponse[]>;

  /**
   * 翻译整个文档
   * @param file 文档文件
   */
  translateDocument(file?: any): Promise<string>;

  /**
   * 清除翻译缓存
   */
  clearTranslationCache(): Promise<void>;
}

/**
 * 设置页翻译服务接口
 */
export interface ISettingsTranslationService {
  /**
   * 翻译设置页面
   * @param container 设置页面容器元素
   */
  translateSettingsPage(container: HTMLElement): Promise<void>;

  /**
   * 翻译指定元素的文本内容
   * @param element 要翻译的元素
   */
  translateElement(element: HTMLElement): Promise<void>;

  /**
   * 恢复设置页面的原始文本
   * @param container 设置页面容器元素
   */
  restoreOriginalText(container: HTMLElement): void;

  /**
   * 检查元素是否已翻译
   * @param element 要检查的元素
   */
  isElementTranslated(element: HTMLElement): boolean;
}

/**
 * 菜单管理服务接口
 */
export interface IMenuService {
  /**
   * 注册右键菜单项
   */
  registerContextMenu(): void;

  /**
   * 注销右键菜单项
   */
  unregisterContextMenu(): void;

  /**
   * 更新菜单项状态
   * @param menuItems 菜单项配置
   */
  updateMenuItems(menuItems: MenuItemConfig[]): void;

  /**
   * 显示菜单
   * @param x 鼠标X坐标
   * @param y 鼠标Y坐标
   * @param selectedText 选中的文本
   */
  showMenu(x: number, y: number, selectedText: SelectedText): void;

  /**
   * 隐藏菜单
   */
  hideMenu(): void;
}

/**
 * 事件管理服务接口
 */
export interface IEventService {
  /**
   * 订阅事件
   * @param event 事件类型
   * @param callback 回调函数
   */
  on(event: string, callback: (data: EventData) => void): void;

  /**
   * 取消订阅事件
   * @param event 事件类型
   * @param callback 回调函数
   */
  off(event: string, callback: (data: EventData) => void): void;

  /**
   * 触发事件
   * @param event 事件类型
   * @param data 事件数据
   */
  emit(event: string, data?: any): void;

  /**
   * 一次性订阅事件
   * @param event 事件类型
   * @param callback 回调函数
   */
  once(event: string, callback: (data: EventData) => void): void;

  /**
   * 清除所有事件监听器
   */
  clear(): void;
}