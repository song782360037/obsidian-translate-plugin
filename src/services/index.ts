export { ConfigService } from './config';
export { ContentTranslationService } from './content-translation';
export { SettingsTranslationService } from './settings-translation';
export { MenuManagementService } from './menu-management';
export * from '../interfaces/services';

/**
 * 服务管理器
 */
export class ServiceManager {
  private services: Map<string, any> = new Map();
  private logger = console; // TODO: 实现日志记录器

  /**
   * 注册服务
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
    this.logger.info(`Service registered: ${name}`);
  }

  /**
   * 获取服务
   */
  get<T>(name: string): T | undefined {
    return this.services.get(name);
  }

  /**
   * 移除服务
   */
  remove(name: string): boolean {
    const removed = this.services.delete(name);
    if (removed) {
      this.logger.info(`Service removed: ${name}`);
    }
    return removed;
  }

  /**
   * 初始化所有服务
   */
  async initializeAll(): Promise<void> {
    for (const [name, service] of this.services) {
      if (service.initialize && typeof service.initialize === 'function') {
        try {
          await service.initialize();
          this.logger.info(`Service initialized: ${name}`);
        } catch (error) {
          this.logger.error(`Failed to initialize service ${name}`, error);
        }
      }
    }
  }

  /**
   * 销毁所有服务
   */
  async destroyAll(): Promise<void> {
    for (const [name, service] of this.services) {
      if (service.destroy && typeof service.destroy === 'function') {
        try {
          await service.destroy();
          this.logger.info(`Service destroyed: ${name}`);
        } catch (error) {
          this.logger.error(`Failed to destroy service ${name}`, error);
        }
      }
    }
    this.services.clear();
  }

  /**
   * 检查服务是否存在
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * 获取所有服务名称
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}

// 默认服务管理器实例
export const serviceManager = new ServiceManager();