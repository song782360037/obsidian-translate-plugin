/**
 * UI层组件统一导出
 */

// 翻译弹窗组件
export { TranslationModal } from './translation-modal';

// 翻译侧边栏组件
export { TranslationSidebarView } from './translation-sidebar';

// 内联翻译组件
export { InlineTranslationComponent, InlineTranslationWidget } from './inline-translation';

// 设置页面组件
export { TranslateSettingTab } from './settings-page';

// 导入类型用于接口定义
import type { TranslationModal } from './translation-modal';
import type { TranslationSidebarView } from './translation-sidebar';
import type { InlineTranslationComponent } from './inline-translation';
import type { TranslateSettingTab } from './settings-page';

// UI组件类型定义
export interface IUIComponents {
  modal: TranslationModal;
  sidebar: TranslationSidebarView;
  inline: InlineTranslationComponent;
  settings: TranslateSettingTab;
}

// UI组件管理器
export class UIManager {
  private components: Partial<IUIComponents> = {};
  private logger = console; // 临时使用console，实际应该使用utils.logger

  /**
   * 注册UI组件
   */
  public registerComponent<K extends keyof IUIComponents>(
    type: K,
    component: IUIComponents[K]
  ): void {
    this.components[type] = component;
    this.logger.log(`UI component registered: ${type}`);
  }

  /**
   * 获取UI组件
   */
  public getComponent<K extends keyof IUIComponents>(
    type: K
  ): IUIComponents[K] | undefined {
    return this.components[type];
  }

  /**
   * 移除UI组件
   */
  public unregisterComponent<K extends keyof IUIComponents>(type: K): void {
    if (this.components[type]) {
      delete this.components[type];
      this.logger.log(`UI component unregistered: ${type}`);
    }
  }

  /**
   * 初始化所有UI组件
   */
  public initializeAll(): void {
    Object.entries(this.components).forEach(([type, component]) => {
      if (component && 'onload' in component && typeof component.onload === 'function') {
        try {
          component.onload();
          this.logger.log(`UI component initialized: ${type}`);
        } catch (error) {
          this.logger.error(`Failed to initialize UI component: ${type}`, error);
        }
      }
    });
  }

  /**
   * 销毁所有UI组件
   */
  public destroyAll(): void {
    Object.entries(this.components).forEach(([type, component]) => {
      if (component && 'onunload' in component && typeof component.onunload === 'function') {
        try {
          component.onunload();
          this.logger.log(`UI component destroyed: ${type}`);
        } catch (error) {
          this.logger.error(`Failed to destroy UI component: ${type}`, error);
        }
      }
    });
    this.components = {};
  }

  /**
   * 获取所有已注册的组件类型
   */
  public getRegisteredTypes(): Array<keyof IUIComponents> {
    return Object.keys(this.components) as Array<keyof IUIComponents>;
  }

  /**
   * 检查组件是否已注册
   */
  public isRegistered<K extends keyof IUIComponents>(type: K): boolean {
    return type in this.components && this.components[type] !== undefined;
  }

  /**
   * 获取组件数量
   */
  public getComponentCount(): number {
    return Object.keys(this.components).length;
  }
}

// 默认UI管理器实例
export const uiManager = new UIManager();