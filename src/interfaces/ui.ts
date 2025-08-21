import { TranslationResponse, SelectedText, PluginSettings } from '../types';

/**
 * UI组件基础接口
 */
export interface IUIComponent {
  /**
   * 渲染组件
   */
  render(): HTMLElement;

  /**
   * 显示组件
   */
  show(): void;

  /**
   * 隐藏组件
   */
  hide(): void;

  /**
   * 销毁组件
   */
  destroy(): void;

  /**
   * 更新组件内容
   * @param data 更新数据
   */
  update(data: any): void;

  /**
   * 检查组件是否可见
   */
  isVisible(): boolean;
}

/**
 * 翻译结果弹窗接口
 */
export interface ITranslationPopup extends IUIComponent {
  /**
   * 显示翻译结果
   * @param response 翻译响应
   * @param position 显示位置
   */
  showTranslation(response: TranslationResponse, position: { x: number; y: number }): void;

  /**
   * 设置加载状态
   * @param loading 是否加载中
   */
  setLoading(loading: boolean): void;

  /**
   * 显示错误信息
   * @param error 错误信息
   */
  showError(error: string): void;

  /**
   * 设置弹窗大小
   * @param width 宽度
   * @param height 高度
   */
  setSize(width: number, height: number): void;
}

/**
 * 翻译侧边栏接口
 */
export interface ITranslationSidebar extends IUIComponent {
  /**
   * 添加翻译记录
   * @param response 翻译响应
   */
  addTranslation(response: TranslationResponse): void;

  /**
   * 清空翻译记录
   */
  clearTranslations(): void;

  /**
   * 设置侧边栏宽度
   * @param width 宽度
   */
  setWidth(width: number): void;

  /**
   * 获取翻译历史
   */
  getTranslationHistory(): TranslationResponse[];

  /**
   * 搜索翻译记录
   * @param query 搜索关键词
   */
  searchTranslations(query: string): TranslationResponse[];
}

/**
 * 内联翻译显示接口
 */
export interface IInlineTranslation extends IUIComponent {
  /**
   * 在指定位置显示翻译
   * @param response 翻译响应
   * @param selectedText 选中的文本信息
   */
  showInline(response: TranslationResponse, selectedText: SelectedText): void;

  /**
   * 设置内联样式
   * @param styles CSS样式
   */
  setStyles(styles: Partial<CSSStyleDeclaration>): void;

  /**
   * 设置动画效果
   * @param animation 动画类型
   */
  setAnimation(animation: 'fade' | 'slide' | 'none'): void;
}

/**
 * 设置页面接口
 */
export interface ISettingsPage extends IUIComponent {
  /**
   * 加载设置
   * @param settings 插件设置
   */
  loadSettings(settings: PluginSettings): void;

  /**
   * 保存设置
   */
  saveSettings(): Promise<PluginSettings>;

  /**
   * 验证设置
   */
  validateSettings(): boolean;

  /**
   * 重置设置
   */
  resetSettings(): void;

  /**
   * 测试翻译器连接
   * @param translatorType 翻译器类型
   */
  testTranslatorConnection(translatorType: string): Promise<boolean>;

  /**
   * 显示设置保存状态
   * @param success 是否成功
   * @param message 状态消息
   */
  showSaveStatus(success: boolean, message?: string): void;
}

/**
 * 加载指示器接口
 */
export interface ILoadingIndicator extends IUIComponent {
  /**
   * 设置加载文本
   * @param text 加载文本
   */
  setText(text: string): void;

  /**
   * 设置进度
   * @param progress 进度百分比 (0-100)
   */
  setProgress(progress: number): void;

  /**
   * 设置加载类型
   * @param type 加载类型
   */
  setType(type: 'spinner' | 'progress' | 'dots'): void;
}

/**
 * 通知接口
 */
export interface INotification extends IUIComponent {
  /**
   * 显示通知
   * @param message 通知消息
   * @param type 通知类型
   * @param duration 显示时长(毫秒)
   */
  showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number): void;

  /**
   * 设置通知位置
   * @param position 位置
   */
  setPosition(position: 'top' | 'bottom' | 'center'): void;
}