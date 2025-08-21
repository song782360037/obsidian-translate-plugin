import { ITranslator, ITranslatorFactory } from '../interfaces';
import { TranslatorType, TranslatorConfig } from '../types';
import { utils } from '../utils';
import { BaseTranslator } from './base';

/**
 * 翻译器构造函数类型
 */
type TranslatorConstructor = new (config: TranslatorConfig) => ITranslator;

/**
 * 翻译器注册信息
 */
interface TranslatorRegistration {
  type: TranslatorType;
  constructor: TranslatorConstructor;
  name: string;
  description: string;
}

/**
 * 翻译器工厂类
 */
export class TranslatorFactory implements ITranslatorFactory {
  private static instance: TranslatorFactory;
  private translators = new Map<TranslatorType, TranslatorRegistration>();
  private instances = new Map<string, ITranslator>();
  private logger = utils.logger.createChild('TranslatorFactory');

  private constructor() {
    this.logger.info('TranslatorFactory initialized');
  }

  /**
   * 获取工厂单例实例
   */
  static getInstance(): TranslatorFactory {
    if (!TranslatorFactory.instance) {
      TranslatorFactory.instance = new TranslatorFactory();
    }
    return TranslatorFactory.instance;
  }

  /**
   * 注册翻译器
   */
  registerTranslator(type: string, constructor: new () => ITranslator): void {
    // 注意：这是简化版本以匹配接口，完整版本重命名为registerTranslatorFull
    throw new Error('Use registerTranslatorFull for full registration');
  }

  /**
   * 注册翻译器（完整版本）
   */
  registerTranslatorFull(
    type: TranslatorType,
    constructor: TranslatorConstructor,
    name: string,
    description: string
  ): void {
    if (this.translators.has(type)) {
      this.logger.warn(`Translator ${type} is already registered, overwriting`);
    }

    this.translators.set(type, {
      type,
      constructor,
      name,
      description
    });

    this.logger.info(`Translator registered: ${name} (${type})`);
  }

  /**
   * 注销翻译器
   */
  unregisterTranslator(type: TranslatorType): void {
    if (!this.translators.has(type)) {
      this.logger.warn(`Translator ${type} is not registered`);
      return;
    }

    // 销毁所有该类型的实例
    const instancesToDestroy: string[] = [];
    for (const [key, instance] of this.instances) {
      // 从实例ID中提取类型信息 (格式: type_timestamp)
      const instanceType = key.split('_')[0] as TranslatorType;
      if (instanceType === type) {
        instancesToDestroy.push(key);
      }
    }

    for (const key of instancesToDestroy) {
      this.destroyInstance(key);
    }

    this.translators.delete(type);
    this.logger.info(`Translator unregistered: ${type}`);
  }

  /**
   * 创建翻译器实例
   */
  createTranslator(type: string, config: TranslatorConfig): ITranslator {
    // 注意：这是同步版本以匹配接口，异步版本重命名为createTranslatorAsync
    throw new Error('Use createTranslatorAsync for async creation');
  }

  /**
   * 创建翻译器实例（异步版本）
   */
  async createTranslatorAsync(
    type: TranslatorType,
    config: TranslatorConfig,
    instanceId?: string
  ): Promise<ITranslator> {
    try {
      const registration = this.translators.get(type);
      if (!registration) {
        throw new Error(`Translator type ${type} is not registered`);
      }

      // 验证配置
      if (!utils.validation.validateConfig({ ...config, translatorType: type })) {
        throw new Error('Invalid translator configuration');
      }

      // 生成实例ID
      const id = instanceId || this.generateInstanceId(type);
      
      // 检查是否已存在相同ID的实例
      if (this.instances.has(id)) {
        this.logger.warn(`Instance ${id} already exists, destroying old instance`);
        await this.destroyInstance(id);
      }

      // 创建新实例
      const instance = new registration.constructor(config);
      
      // 初始化实例
      await instance.initialize(config);
      
      // 存储实例
      this.instances.set(id, instance);
      
      this.logger.info(`Translator instance created: ${registration.name} (${id})`);
      
      return instance;
    } catch (error) {
      this.logger.error(`Failed to create translator instance for ${type}`, error);
      throw error;
    }
  }

  /**
   * 获取翻译器实例
   */
  getInstance(instanceId: string): ITranslator | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * 获取所有实例
   */
  getAllInstances(): Map<string, ITranslator> {
    return new Map(this.instances);
  }

  /**
   * 销毁翻译器实例
   */
  async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn(`Instance ${instanceId} not found`);
      return;
    }

    try {
      if (instance.destroy) {
        await instance.destroy();
      }
      
      this.instances.delete(instanceId);
      this.logger.info(`Translator instance destroyed: ${instanceId}`);
    } catch (error) {
      this.logger.error(`Failed to destroy instance ${instanceId}`, error);
      throw error;
    }
  }

  /**
   * 销毁所有实例
   */
  async destroyAllInstances(): Promise<void> {
    const instanceIds = Array.from(this.instances.keys());
    
    for (const id of instanceIds) {
      try {
        await this.destroyInstance(id);
      } catch (error) {
        this.logger.error(`Failed to destroy instance ${id}`, error);
      }
    }
    
    this.logger.info('All translator instances destroyed');
  }

  /**
   * 获取支持的翻译器类型
   */
  getSupportedTypes(): TranslatorType[] {
    return Array.from(this.translators.keys());
  }

  /**
   * 获取翻译器信息
   */
  getTranslatorInfo(type: TranslatorType): TranslatorRegistration | undefined {
    return this.translators.get(type);
  }

  /**
   * 获取所有翻译器信息
   */
  getAllTranslatorInfo(): TranslatorRegistration[] {
    return Array.from(this.translators.values());
  }

  /**
   * 检查翻译器类型是否支持
   */
  isSupported(type: TranslatorType): boolean {
    return this.translators.has(type);
  }

  /**
   * 创建默认翻译器实例
   */
  async createDefaultTranslator(
    type: TranslatorType,
    apiKey: string,
    options: Partial<TranslatorConfig> = {}
  ): Promise<ITranslator> {
    const defaultConfig: TranslatorConfig = {
      type: type,
      name: type,
      enabled: true,
      apiKey,
      timeout: 30000,
      retryCount: 3,
      ...options
    };

    return this.createTranslatorAsync(type, defaultConfig);
  }

  /**
   * 批量创建翻译器实例
   */
  async createMultipleTranslators(
    configs: Array<{ type: TranslatorType; config: TranslatorConfig; instanceId?: string }>
  ): Promise<Map<string, ITranslator>> {
    const results = new Map<string, ITranslator>();
    const errors: Array<{ type: TranslatorType; error: Error }> = [];

    for (const { type, config, instanceId } of configs) {
      try {
        const instance = await this.createTranslatorAsync(type, config, instanceId);
        const id = instanceId || this.generateInstanceId(type);
        results.set(id, instance);
      } catch (error) {
        errors.push({ type, error: error as Error });
        this.logger.error(`Failed to create translator ${type}`, error);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`${errors.length} translators failed to create`, errors);
    }

    return results;
  }

  /**
   * 获取可用的翻译器实例
   */
  async getAvailableInstances(): Promise<Map<string, ITranslator>> {
    const available = new Map<string, ITranslator>();

    for (const [id, instance] of this.instances) {
      try {
        if (instance.isAvailable && await instance.isAvailable()) {
          available.set(id, instance);
        }
      } catch (error) {
        this.logger.warn(`Failed to check availability for instance ${id}`, error);
      }
    }

    return available;
  }

  /**
   * 重新初始化实例
   */
  async reinitializeInstance(instanceId: string, config?: TranslatorConfig): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    try {
      if (instance.destroy) {
        await instance.destroy();
      }
      
      if (config) {
        await instance.initialize(config);
      } else {
        await instance.initialize();
      }
      
      this.logger.info(`Instance ${instanceId} reinitialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to reinitialize instance ${instanceId}`, error);
      throw error;
    }
  }

  /**
   * 生成实例ID
   */
  private generateInstanceId(type: TranslatorType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * 获取工厂统计信息
   */
  getStats(): {
    registeredTypes: number;
    activeInstances: number;
    instancesByType: Record<string, number>;
  } {
    const instancesByType: Record<string, number> = {};
    
    // 暂时无法获取实例类型，因为ITranslator接口中没有getType方法
    // 可以考虑在创建实例时记录类型信息
    for (const [instanceId] of this.instances) {
      const type = instanceId.split('_')[0]; // 从实例ID中提取类型
      instancesByType[type] = (instancesByType[type] || 0) + 1;
    }

    return {
      registeredTypes: this.translators.size,
      activeInstances: this.instances.size,
      instancesByType
    };
  }

  /**
   * 清理工厂
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up TranslatorFactory');
    
    await this.destroyAllInstances();
    this.translators.clear();
    
    this.logger.info('TranslatorFactory cleanup completed');
  }
}

// 导出工厂单例
export const translatorFactory = TranslatorFactory.getInstance();