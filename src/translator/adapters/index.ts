// 翻译器适配器导出
export { OpenAITranslator } from './openai';
export { default as CustomTranslator } from './custom';

// 导出适配器配置类型
export type {
  OpenAIConfig,
  CustomConfig
} from './types';