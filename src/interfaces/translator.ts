import { TranslationRequest, TranslationResponse, TranslatorConfig } from '../types';

/**
 * 翻译器接口
 */
export interface ITranslator {
  /**
   * 翻译器类型
   */
  readonly type: string;

  /**
   * 翻译器名称
   */
  readonly name: string;

  /**
   * 初始化翻译器
   * @param config 翻译器配置（可选）
   */
  initialize(config?: TranslatorConfig): Promise<void>;

  /**
   * 翻译文本
   * @param request 翻译请求
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * 验证配置
   * @param config 翻译器配置
   */
  validateConfig(config: TranslatorConfig): boolean;

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): string[];

  /**
   * 检查翻译器是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 销毁翻译器
   */
  destroy(): void;
}

/**
 * 翻译器工厂接口
 */
export interface ITranslatorFactory {
  /**
   * 创建翻译器实例
   * @param type 翻译器类型
   * @param config 翻译器配置
   */
  createTranslator(type: string, config: TranslatorConfig): ITranslator;

  /**
   * 获取所有支持的翻译器类型
   */
  getSupportedTypes(): string[];

  /**
   * 注册翻译器
   * @param type 翻译器类型
   * @param constructor 翻译器构造函数
   */
  registerTranslator(type: string, constructor: new () => ITranslator): void;
}