import { BaseTranslator } from '../base';
import {
  TranslatorType,
  TranslatorConfig,
  TranslationRequest,
  TranslationResponse,
  TranslationStatus,
  LanguageCode
} from '../../types';
import { utils } from '../../utils';

import type { CustomConfig } from './types';

/**
 * 请求模板变量
 */
interface TemplateVariables {
  text: string;
  from: string;
  to: string;
  apiKey: string;
  [key: string]: any;
}

/**
 * 自定义翻译器实现
 */
export class CustomTranslator extends BaseTranslator {
  public readonly type = TranslatorType.CUSTOM;
  public readonly name = 'Custom Translator';
  private endpoint: string;
  private method: 'GET' | 'POST';
  private headers: Record<string, string>;
  private requestTemplate: string;
  private responseTemplate: string;
  private textField: string;
  private fromField: string;
  private toField: string;
  private resultField: string;
  private errorField: string;
  private supportedLanguages: LanguageCode[];
  protected logger = utils.logger.createChild('CustomTranslator');

  constructor(config: TranslatorConfig) {
    super(config);
    
    const customConfig = config as CustomConfig;
    this.endpoint = customConfig.endpoint;
    this.method = customConfig.method || 'POST';
    this.headers = customConfig.headers || {};
    this.requestTemplate = customConfig.requestTemplate || '';
    this.responseTemplate = customConfig.responseTemplate || '';
    this.textField = customConfig.textField || 'text';
    this.fromField = customConfig.fromField || 'from';
    this.toField = customConfig.toField || 'to';
    this.resultField = customConfig.resultField || 'result';
    this.errorField = customConfig.errorField || 'error';
    this.supportedLanguages = customConfig.supportedLanguages || this.getDefaultSupportedLanguages();
  }

  /**
   * 获取翻译器类型
   */
  getType(): TranslatorType {
    return TranslatorType.CUSTOM;
  }

  /**
   * 获取翻译器名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): LanguageCode[] {
    return this.supportedLanguages;
  }

  /**
   * 获取默认支持的语言列表
   */
  private getDefaultSupportedLanguages(): LanguageCode[] {
    return [
      LanguageCode.AUTO,
      LanguageCode.ZH_CN,
      LanguageCode.ZH_TW,
      LanguageCode.EN,
      LanguageCode.JA,
      LanguageCode.KO,
      LanguageCode.FR,
      LanguageCode.DE,
      LanguageCode.ES,
      LanguageCode.IT,
      LanguageCode.PT,
      LanguageCode.RU,
      LanguageCode.AR,
      LanguageCode.TH,
      LanguageCode.VI,
      LanguageCode.ID,
      LanguageCode.MS,
      LanguageCode.TR,
      LanguageCode.PL,
      LanguageCode.NL,
      LanguageCode.SV,
      LanguageCode.DA,
      LanguageCode.NO,
      LanguageCode.FI,
      LanguageCode.CS,
      LanguageCode.HU,
      LanguageCode.RO,
      LanguageCode.BG,
      LanguageCode.HR,
      LanguageCode.SK,
      LanguageCode.SL,
      LanguageCode.ET,
      LanguageCode.LV,
      LanguageCode.LT,
      LanguageCode.CA,
      LanguageCode.EL,
      LanguageCode.HE,
      LanguageCode.HI
    ];
  }

  /**
   * 验证配置
   */
  public validateConfig(): boolean {
    const config = this.config as CustomConfig;
    
    if (!super.validateConfig()) {
      return false;
    }

    if (!config.endpoint || !utils.validation.validateUrl(config.endpoint)) {
      this.logger.error('Invalid custom endpoint URL');
      return false;
    }

    if (config.method && !['GET', 'POST'].includes(config.method)) {
      this.logger.error('Invalid HTTP method, only GET and POST are supported');
      return false;
    }

    return true;
  }

  /**
   * 检查服务可用性
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 发送一个简单的测试请求
      const result = await this.doTranslate('Hello', LanguageCode.EN, LanguageCode.ZH_CN);
      return !!result;
    } catch (error) {
      this.logger.warn('Custom service availability check failed', error);
      return false;
    }
  }

  /**
   * 执行翻译
   */
  protected async doTranslate(text: string, from: LanguageCode, to: LanguageCode): Promise<string> {
    try {
      // 构建请求
      const apiRequest = this.buildRequest(text, from, to);
      
      // 发送API请求
      const response = await this.callCustomAPI(apiRequest);
      
      // 解析响应
      const translatedText = this.parseResponse(response);
      
      this.logger.info('Translation completed');
      
      return translatedText;
    } catch (error) {
      this.logger.error('Translation failed', error);
      throw error;
    }
  }

  /**
   * 构建API请求
   */
  private buildRequest(text: string, from: LanguageCode, to: LanguageCode): {
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    data?: any;
    params?: Record<string, string>;
  } {
    const variables: TemplateVariables = {
      text: text,
      from: from,
      to: to,
      apiKey: this.config.apiKey || ''
    };

    // 处理请求头
    const headers = { ...this.headers };
    for (const [key, value] of Object.entries(headers)) {
      headers[key] = this.replaceVariables(value, variables);
    }

    if (this.method === 'GET') {
      // GET请求，参数放在URL中
      const params: Record<string, string> = {};
      
      if (this.requestTemplate) {
        // 使用自定义模板
        const templateData = JSON.parse(this.replaceVariables(this.requestTemplate, variables));
        Object.assign(params, templateData);
      } else {
        // 使用默认字段映射
        params[this.textField] = text;
        params[this.fromField] = from;
        params[this.toField] = to;
        if (this.config.apiKey) {
          params['apiKey'] = this.config.apiKey;
        }
      }

      return {
        url: this.endpoint,
        method: 'GET',
        headers,
        params
      };
    } else {
      // POST请求，参数放在请求体中
      let data: any;
      
      if (this.requestTemplate) {
        // 使用自定义模板
        const templateString = this.replaceVariables(this.requestTemplate, variables);
        try {
          data = JSON.parse(templateString);
        } catch {
          data = templateString;
        }
      } else {
        // 使用默认字段映射
        data = {
          [this.textField]: text,
          [this.fromField]: from,
          [this.toField]: to
        };
        if (this.config.apiKey) {
          data.apiKey = this.config.apiKey;
        }
      }

      // 设置默认Content-Type
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      return {
        url: this.endpoint,
        method: 'POST',
        headers,
        data
      };
    }
  }

  /**
   * 调用自定义API
   */
  private async callCustomAPI(apiRequest: {
    url: string;
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    data?: any;
    params?: Record<string, string>;
  }): Promise<any> {
    let url = apiRequest.url;
    if (apiRequest.params) {
      const searchParams = new URLSearchParams(apiRequest.params);
      url += (url.includes('?') ? '&' : '?') + searchParams.toString();
    }
    
    const response = await utils.http.request(url, {
      method: apiRequest.method,
      headers: apiRequest.headers,
      body: apiRequest.data,
      timeout: this.config.timeout
    });

    if (!response.data) {
      throw new Error('Empty response from custom API');
    }

    return response.data;
  }

  /**
   * 解析API响应
   */
  private parseResponse(response: any): string {
    // 检查错误
    if (this.errorField && this.getNestedValue(response, this.errorField)) {
      const errorMessage = this.getNestedValue(response, this.errorField);
      throw new Error(`Custom API error: ${errorMessage}`);
    }

    // 获取翻译结果
    let result: string;
    
    if (this.responseTemplate) {
      // 使用自定义响应模板
      result = this.replaceVariables(this.responseTemplate, response);
    } else {
      // 使用默认字段映射
      result = this.getNestedValue(response, this.resultField);
    }

    if (!result) {
      throw new Error('No translation result found in response');
    }

    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  /**
   * 替换模板变量
   */
  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    
    return result;
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 设置支持的语言
   */
  setSupportedLanguages(languages: LanguageCode[]): void {
    this.supportedLanguages = languages;
    this.logger.info(`Updated supported languages: ${languages.join(', ')}`);
  }

  /**
   * 设置请求模板
   */
  setRequestTemplate(template: string): void {
    this.requestTemplate = template;
    this.logger.info('Updated request template');
  }

  /**
   * 设置响应模板
   */
  setResponseTemplate(template: string): void {
    this.responseTemplate = template;
    this.logger.info('Updated response template');
  }

  /**
   * 设置字段映射
   */
  setFieldMapping(mapping: {
    textField?: string;
    fromField?: string;
    toField?: string;
    resultField?: string;
    errorField?: string;
  }): void {
    if (mapping.textField) this.textField = mapping.textField;
    if (mapping.fromField) this.fromField = mapping.fromField;
    if (mapping.toField) this.toField = mapping.toField;
    if (mapping.resultField) this.resultField = mapping.resultField;
    if (mapping.errorField) this.errorField = mapping.errorField;
    
    this.logger.info('Updated field mapping');
  }

  /**
   * 获取翻译器信息
   */
  getInfo(): { name: string; version: string; description: string } {
    return {
      name: 'Custom Translator',
      version: '1.0.0',
      description: 'Configurable translator for custom translation APIs'
    };
  }

  /**
   * 获取配置信息
   */
  getConfig(): CustomConfig {
    return {
      ...this.config,
      endpoint: this.endpoint,
      method: this.method,
      headers: this.headers,
      requestTemplate: this.requestTemplate,
      responseTemplate: this.responseTemplate,
      textField: this.textField,
      fromField: this.fromField,
      toField: this.toField,
      resultField: this.resultField,
      errorField: this.errorField,
      supportedLanguages: this.supportedLanguages
    } as CustomConfig;
  }
}

export default CustomTranslator;