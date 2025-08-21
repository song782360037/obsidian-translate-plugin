import { IValidationUtils } from '../interfaces';
import { TranslatorType, LanguageCode } from '../types';

/**
 * 验证工具类
 */
export class ValidationUtils implements IValidationUtils {
  /**
   * 验证API密钥格式
   */
  validateApiKey(apiKey: string, type: TranslatorType): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // 移除空白字符
    const trimmedKey = apiKey.trim();
    
    if (trimmedKey.length === 0) {
      return false;
    }

    switch (type) {
      case TranslatorType.OPENAI:
        // OpenAI API密钥格式: sk-开头，长度通常为51字符
        return /^sk-[a-zA-Z0-9]{48}$/.test(trimmedKey);
      
      case TranslatorType.CUSTOM:
        // 自定义接口，基本验证：非空且长度合理
        return trimmedKey.length >= 8 && trimmedKey.length <= 200;
      
      default:
        return false;
    }
  }

  /**
   * 验证语言代码
   */
  validateLanguageCode(code: string): boolean {
    if (!code || typeof code !== 'string') {
      return false;
    }

    // 检查是否为有效的语言代码
    return Object.values(LanguageCode).includes(code as LanguageCode);
  }

  /**
   * 验证URL格式
   */
  validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 验证文本内容
   */
  validateText(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    const trimmedText = text.trim();
    
    // 检查文本长度（只检查是否为空，不限制最大长度）
    if (trimmedText.length === 0) {
      return false;
    }

    // 检查是否包含有效字符（不全是空白字符、特殊符号）
    const hasValidContent = /[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(trimmedText);
    
    return hasValidContent;
  }

  /**
   * 验证配置对象
   */
  validateConfig(config: any, schema?: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('配置对象无效');
      return { valid: false, errors };
    }

    // 检查必需的配置项
    const requiredFields = ['translatorType', 'sourceLanguage', 'targetLanguage'];
    
    for (const field of requiredFields) {
      if (!(field in config)) {
        errors.push(`缺少必需字段: ${field}`);
      }
    }

    // 验证翻译器类型
    if (config.translatorType && !Object.values(TranslatorType).includes(config.translatorType)) {
      errors.push('无效的翻译器类型');
    }

    // 验证语言代码
    if (config.sourceLanguage && !this.validateLanguageCode(config.sourceLanguage)) {
      errors.push('无效的源语言代码');
    }
    
    if (config.targetLanguage && !this.validateLanguageCode(config.targetLanguage)) {
      errors.push('无效的目标语言代码');
    }

    // 验证API密钥（如果存在）
    if (config.apiKey && config.translatorType && !this.validateApiKey(config.apiKey, config.translatorType)) {
      errors.push('无效的API密钥格式');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证数字范围
   */
  validateNumberRange(value: any, min: number, max: number): boolean {
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }

    return value >= min && value <= max;
  }

  /**
   * 验证邮箱格式
   */
  validateEmail(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * 验证JSON格式
   */
  validateJson(jsonString: string): boolean {
    if (!jsonString || typeof jsonString !== 'string') {
      return false;
    }

    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证文件扩展名
   */
  validateFileExtension(filename: string, allowedExtensions: string[]): boolean {
    if (!filename || typeof filename !== 'string') {
      return false;
    }

    if (!allowedExtensions || !Array.isArray(allowedExtensions)) {
      return false;
    }

    const extension = filename.toLowerCase().split('.').pop();
    
    if (!extension) {
      return false;
    }

    return allowedExtensions.map(ext => ext.toLowerCase()).includes(extension);
  }

  /**
   * 验证正则表达式
   */
  validateRegex(pattern: string): boolean {
    if (!pattern || typeof pattern !== 'string') {
      return false;
    }

    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理和验证HTML内容
   */
  sanitizeHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // 移除潜在危险的标签和属性
    const dangerousTags = /<script[^>]*>[\s\S]*?<\/script>/gi;
    const dangerousAttributes = /\s(on\w+|javascript:)[^>]*/gi;
    
    return html
      .replace(dangerousTags, '')
      .replace(dangerousAttributes, '')
      .trim();
  }

  /**
   * 清理和验证文本输入
   */
  sanitizeText(text: string, maxLength?: number): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // 移除前后空白字符
    let sanitized = text.trim();

    // 移除潜在的危险字符
    sanitized = sanitized.replace(/[<>"'&]/g, '');

    // 限制长度
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * 验证对象是否为空
   */
  isEmpty(value: any): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }

    return false;
  }
}