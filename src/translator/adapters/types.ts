import { TranslatorConfig, LanguageCode } from '../../types';

/**
 * OpenAI翻译器配置
 */
export interface OpenAIConfig extends TranslatorConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
}



/**
 * 自定义翻译器配置
 */
export interface CustomConfig extends TranslatorConfig {
  endpoint: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  requestTemplate?: string;
  responseTemplate?: string;
  textField?: string;
  fromField?: string;
  toField?: string;
  resultField?: string;
  errorField?: string;
  supportedLanguages?: LanguageCode[];
}