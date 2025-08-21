// 翻译器模块导出
export { BaseTranslator } from './base';
export { TranslatorFactory } from './factory';

// 导出类型定义
export * from '../types';
export * from '../interfaces';

// 翻译器适配器
export * from './adapters';

import { TranslatorFactory } from './factory';
import { OpenAITranslator, CustomTranslator } from './adapters';
import { TranslatorType } from '../types';
import { utils } from '../utils';

const logger = utils.logger.createChild('TranslatorModule');

/**
 * 初始化翻译器模块
 */
export async function initializeTranslators(): Promise<void> {
  try {
    const factory = TranslatorFactory.getInstance();
    
    // 注册OpenAI翻译器
    factory.registerTranslatorFull(
      TranslatorType.OPENAI,
      OpenAITranslator,
      'OpenAI Translator',
      'OpenAI GPT-based translation service'
    );
    
    // 注册自定义翻译器
    factory.registerTranslatorFull(
      TranslatorType.CUSTOM,
      CustomTranslator,
      'Custom Translator',
      'Custom translation service'
    );
    
    logger.info('All translators initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize translators', error);
    throw error;
  }
}

/**
 * 清理翻译器模块
 */
export async function cleanupTranslators(): Promise<void> {
  try {
    const factory = TranslatorFactory.getInstance();
    await factory.destroyAllInstances();
    logger.info('All translator instances cleaned up');
  } catch (error) {
    logger.error('Failed to cleanup translators', error);
    throw error;
  }
}