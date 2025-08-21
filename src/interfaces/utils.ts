import { SelectedText } from '../types';

/**
 * DOM操作工具接口
 */
export interface IDOMUtils {
  /**
   * 获取当前选中的文本
   */
  getSelectedText(): SelectedText | null;

  /**
   * 查找包含指定文本的元素
   * @param text 要查找的文本
   * @param container 搜索容器
   */
  findElementByText(text: string, container?: HTMLElement): HTMLElement | null;

  /**
   * 安全地更新元素文本内容
   * @param element 目标元素
   * @param newText 新文本
   * @param preserveFormatting 是否保持格式
   */
  updateElementText(element: HTMLElement, newText: string, preserveFormatting?: boolean): void;

  /**
   * 创建文本高亮
   * @param element 目标元素
   * @param text 要高亮的文本
   * @param className 高亮样式类名
   */
  highlightText(element: HTMLElement, text: string, className: string): void;

  /**
   * 移除文本高亮
   * @param element 目标元素
   * @param className 高亮样式类名
   */
  removeHighlight(element: HTMLElement, className?: string): void;

  /**
   * 获取元素的绝对位置
   * @param element 目标元素
   */
  getElementPosition(element: HTMLElement): { x: number; y: number; width: number; height: number };

  /**
   * 检查元素是否在视口内
   * @param element 目标元素
   */
  isElementInViewport(element: HTMLElement): boolean;

  /**
   * 滚动到指定元素
   * @param element 目标元素
   * @param behavior 滚动行为
   */
  scrollToElement(element: HTMLElement, behavior?: ScrollBehavior): void;

  /**
   * 创建DOM元素
   * @param tagName 标签名
   * @param attributes 属性
   * @param children 子元素
   */
  createElement(tagName: string, attributes?: Record<string, string>, children?: (HTMLElement | string)[]): HTMLElement;

  /**
   * 添加CSS样式
   * @param element 目标元素
   * @param styles 样式对象
   */
  addStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void;
}

/**
 * 加密工具接口
 */
export interface ICryptoUtils {
  /**
   * 加密字符串
   * @param text 要加密的文本
   * @param key 加密密钥
   */
  encrypt(text: string, key?: string): string;

  /**
   * 解密字符串
   * @param encryptedText 加密的文本
   * @param key 解密密钥
   */
  decrypt(encryptedText: string, key?: string): string;

  /**
   * 生成随机密钥
   * @param length 密钥长度
   */
  generateKey(length?: number): string;

  /**
   * 计算文本哈希值
   * @param text 要计算哈希的文本
   * @param algorithm 哈希算法
   */
  hash(text: string, algorithm?: 'md5' | 'sha1' | 'sha256'): string;

  /**
   * Base64编码
   * @param text 要编码的文本
   */
  base64Encode(text: string): string;

  /**
   * Base64解码
   * @param encodedText 编码的文本
   */
  base64Decode(encodedText: string): string;

  /**
   * 生成UUID
   */
  generateUUID(): string;
}

/**
 * 验证工具接口
 */
export interface IValidationUtils {
  /**
   * 验证API密钥格式
   * @param apiKey API密钥
   * @param type 密钥类型
   */
  validateApiKey(apiKey: string, type: string): boolean;

  /**
   * 验证URL格式
   * @param url URL字符串
   */
  validateUrl(url: string): boolean;

  /**
   * 验证语言代码
   * @param langCode 语言代码
   */
  validateLanguageCode(langCode: string): boolean;

  /**
   * 验证配置对象
   * @param config 配置对象
   * @param schema 验证模式
   */
  validateConfig(config: any, schema: any): { valid: boolean; errors: string[] };

  /**
   * 清理和验证文本输入
   * @param text 输入文本
   * @param maxLength 最大长度
   */
  sanitizeText(text: string, maxLength?: number): string;

  /**
   * 清理HTML内容
   * @param html HTML字符串
   */
  sanitizeHtml(html: string): string;

  /**
   * 验证JSON格式
   * @param jsonString JSON字符串
   */
  validateJson(jsonString: string): boolean;
}

/**
 * 网络请求工具接口
 */
export interface IHttpUtils {
  /**
   * 发送GET请求
   * @param url 请求URL
   * @param headers 请求头
   * @param timeout 超时时间
   */
  get(url: string, headers?: Record<string, string>, timeout?: number): Promise<any>;

  /**
   * 发送POST请求
   * @param url 请求URL
   * @param data 请求数据
   * @param headers 请求头
   * @param timeout 超时时间
   */
  post(url: string, data: any, headers?: Record<string, string>, timeout?: number): Promise<any>;

  /**
   * 发送PUT请求
   * @param url 请求URL
   * @param data 请求数据
   * @param headers 请求头
   * @param timeout 超时时间
   */
  put(url: string, data: any, headers?: Record<string, string>, timeout?: number): Promise<any>;

  /**
   * 发送DELETE请求
   * @param url 请求URL
   * @param headers 请求头
   * @param timeout 超时时间
   */
  delete(url: string, headers?: Record<string, string>, timeout?: number): Promise<any>;

  /**
   * 发送通用请求
   * @param url 请求URL
   * @param config 请求配置
   */
  request<T = any>(url: string, config?: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    validateStatus?: (status: number) => boolean;
  }): Promise<{
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
  }>;

  /**
   * 设置默认请求头
   * @param headers 默认请求头
   */
  setDefaultHeaders(headers: Record<string, string>): void;

  /**
   * 设置默认超时时间
   * @param timeout 超时时间(毫秒)
   */
  setDefaultTimeout(timeout: number): void;

  /**
   * 取消请求
   * @param requestId 请求ID
   */
  cancelRequest(requestId: string): void;

  /**
   * 检查网络连接状态
   */
  checkNetworkStatus(): Promise<boolean>;
}

/**
 * 日志工具接口
 */
export interface ILoggerUtils {
  /**
   * 记录调试信息
   * @param message 日志消息
   * @param data 附加数据
   */
  debug(message: string, data?: any): void;

  /**
   * 记录信息
   * @param message 日志消息
   * @param data 附加数据
   */
  info(message: string, data?: any): void;

  /**
   * 记录警告
   * @param message 日志消息
   * @param data 附加数据
   */
  warn(message: string, data?: any): void;

  /**
   * 记录错误
   * @param message 日志消息
   * @param error 错误对象
   */
  error(message: string, error?: any): void;

  /**
   * 设置日志级别
   * @param level 日志级别
   */
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void;

  /**
   * 清空日志
   */
  clear(): void;

  /**
   * 获取日志历史
   */
  getHistory(): any[];
}