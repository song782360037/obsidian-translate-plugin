import { ITranslator } from '../interfaces';
import {
  TranslatorType,
  LanguageCode,
  TranslationRequest,
  TranslationResponse,
  TranslatorConfig,
  TranslationError,
  TranslationStatus
} from '../types';
import { utils } from '../utils';

/**
 * 翻译器抽象基类
 */
export abstract class BaseTranslator implements ITranslator {
  protected config: TranslatorConfig;
  protected logger = utils.logger.createChild('BaseTranslator');
  protected isInitialized = false;

  /**
   * 翻译器类型（子类必须实现）
   */
  abstract get type(): string;

  /**
   * 翻译器名称（子类必须实现）
   */
  abstract get name(): string;

  constructor(config: TranslatorConfig) {
    this.config = { ...config };
  }

  /**
   * 获取翻译器类型
   */
  abstract getType(): TranslatorType;

  /**
   * 获取翻译器名称
   */
  abstract getName(): string;

  /**
   * 获取支持的语言列表
   */
  abstract getSupportedLanguages(): LanguageCode[];

  /**
   * 执行翻译的核心方法（子类实现）
   */
  protected abstract doTranslate(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode
  ): Promise<string>;

  /**
   * 验证配置（子类必须重写）
   */
  public validateConfig(): boolean {
    if (!this.config) {
      this.logger.error('Configuration is missing');
      return false;
    }

    // 基类只检查配置对象是否存在
    // 具体的配置验证逻辑由子类实现
    return true;
  }

  /**
   * 初始化翻译器
   */
  async initialize(config?: TranslatorConfig): Promise<void> {
    try {
      // 如果提供了新配置，则更新配置
      if (config) {
        this.config = { ...config };
      }
      
      this.logger.info(`Initializing ${this.getName()} translator`);
      
      if (!this.validateConfig()) {
        throw new Error('Configuration validation failed');
      }

      // 执行子类特定的初始化逻辑
      await this.doInitialize();
      
      this.isInitialized = true;
      this.logger.info(`${this.getName()} translator initialized successfully`);
    } catch (error) {
      this.logger.error('Failed to initialize translator', error);
      throw error;
    }
  }

  /**
   * 子类特定的初始化逻辑（可选重写）
   */
  protected async doInitialize(): Promise<void> {
    // 默认实现为空，子类可以重写
  }

  /**
   * 翻译文本
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const startTime = performance.now();
    
    try {
      this.logger.debug('Translation request received', {
        textLength: request.text.length,
        sourceLanguage: request.sourceLang!,
        targetLanguage: request.targetLang
      });

      // 检查初始化状态
      if (!this.isInitialized) {
        throw new Error('Translator not initialized');
      }

      // 验证请求
      this.validateRequest(request);

      // 预处理文本
      const preprocessedText = this.preprocessText(request.text);
      
      // 执行翻译
      const translatedText = await this.doTranslate(
        preprocessedText,
        request.sourceLang!,
        request.targetLang
      );

      // 后处理文本
      const postprocessedText = this.postprocessText(translatedText);

      const duration = performance.now() - startTime;
      
      this.logger.info('Translation completed', {
        duration: `${duration.toFixed(2)}ms`,
        originalLength: request.text.length,
        translatedLength: postprocessedText.length
      });

      return {
        originalText: request.text,
        translatedText: postprocessedText,
        sourceLang: request.sourceLang!,
        targetLang: request.targetLang,
        translator: this.getType(),
        status: 'success' as TranslationStatus,
        timestamp: Date.now()
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.logger.error('Translation failed', {
        error,
        duration: `${duration.toFixed(2)}ms`,
        request
      });

      throw this.createTranslationError(error as Error, request);
    }
  }

  /**
   * 验证翻译请求
   */
  protected validateRequest(request: TranslationRequest): void {
    if (!request.text || !utils.validation.validateText(request.text)) {
      throw new Error('Invalid text for translation');
    }

    if (!request.sourceLang || !utils.validation.validateLanguageCode(request.sourceLang)) {
      throw new Error('Invalid source language code');
    }

    if (!utils.validation.validateLanguageCode(request.targetLang)) {
      throw new Error('Invalid target language code');
    }

    if (request.sourceLang === request.targetLang) {
      throw new Error('Source and target languages cannot be the same');
    }

    const supportedLanguages = this.getSupportedLanguages();
    
    if (!supportedLanguages.includes(request.sourceLang)) {
      throw new Error(`Source language ${request.sourceLang} is not supported`);
    }

    if (!supportedLanguages.includes(request.targetLang)) {
      throw new Error(`Target language ${request.targetLang} is not supported`);
    }
  }

  /**
   * 文本预处理
   */
  protected preprocessText(text: string): string {
    // 移除多余的空白字符
    let processed = text.trim().replace(/\s+/g, ' ');
    
    // 处理特殊字符
    processed = processed.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 移除零宽字符
    
    return processed;
  }

  /**
   * 文本后处理
   */
  protected postprocessText(text: string): string {
    // 基本的后处理：去除首尾空白
    return text.trim();
  }

  /**
   * 创建翻译错误对象
   */
  protected createTranslationError(error: Error, request: TranslationRequest): TranslationError {
    return {
      message: error.message,
      code: this.getErrorCode(error),
      timestamp: Date.now(),
      details: {
        translatorType: this.getType(),
        originalText: request.text,
        sourceLanguage: request.sourceLang!,
        targetLanguage: request.targetLang,
        stack: error.stack
      }
    };
  }

  /**
   * 获取错误代码
   */
  protected getErrorCode(error: Error): string {
    if (error.message.includes('API key')) {
      return 'INVALID_API_KEY';
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    if (error.message.includes('rate limit')) {
      return 'RATE_LIMIT_EXCEEDED';
    }
    if (error.message.includes('quota')) {
      return 'QUOTA_EXCEEDED';
    }
    if (error.message.includes('language')) {
      return 'UNSUPPORTED_LANGUAGE';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * 检查翻译器是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        return false;
      }

      // 执行简单的连通性测试
      await this.doAvailabilityCheck();
      return true;
    } catch (error) {
      this.logger.warn('Availability check failed', error);
      return false;
    }
  }

  /**
   * 子类特定的可用性检查（可选重写）
   */
  protected async doAvailabilityCheck(): Promise<void> {
    // 默认实现：尝试翻译一个简单的测试文本
    const testRequest: TranslationRequest = {
      text: 'test',
      sourceLang: LanguageCode.EN,
      targetLang: LanguageCode.ZH_CN,
      translator: this.getType()
    };

    await this.doTranslate(
      testRequest.text,
      testRequest.sourceLang!,
      testRequest.targetLang
    );
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<TranslatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Configuration updated');
    
    // 如果配置发生重大变化，可能需要重新初始化
    if (newConfig.apiKey || newConfig.apiUrl) {
      this.isInitialized = false;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TranslatorConfig {
    return { ...this.config };
  }

  /**
   * 销毁翻译器
   */
  async destroy(): Promise<void> {
    try {
      this.logger.info(`Destroying ${this.getName()} translator`);
      
      // 执行子类特定的清理逻辑
      await this.doDestroy();
      
      this.isInitialized = false;
      this.logger.info(`${this.getName()} translator destroyed`);
    } catch (error) {
      this.logger.error('Failed to destroy translator', error);
      throw error;
    }
  }

  /**
   * 子类特定的销毁逻辑（可选重写）
   */
  protected async doDestroy(): Promise<void> {
    // 默认实现为空，子类可以重写
  }

  /**
   * 获取翻译器统计信息
   */
  getStats(): {
    type: TranslatorType;
    name: string;
    isInitialized: boolean;
    supportedLanguages: LanguageCode[];
  } {
    return {
      type: this.getType(),
      name: this.getName(),
      isInitialized: this.isInitialized,
      supportedLanguages: this.getSupportedLanguages()
    };
  }
}