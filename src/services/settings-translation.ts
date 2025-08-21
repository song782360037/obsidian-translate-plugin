import { ISettingsTranslationService } from '../interfaces';
import {
  TranslationRequest,
  TranslationResponse,
  TranslationStatus,
  TranslatorType,
  LanguageCode
} from '../types';
import { TranslatorFactory } from '../translator';
import { ConfigService } from './config';
import { utils } from '../utils';
import { App, Setting, SettingTab } from 'obsidian';

/**
 * 设置项翻译配置
 */
interface SettingTranslationConfig {
  enabled: boolean;
  targetLanguage: LanguageCode;
  translator: TranslatorType;
  autoTranslate: boolean;
  cacheTranslations: boolean;
  translateDescriptions: boolean;
  translatePlaceholders: boolean;
}

/**
 * 翻译的设置项
 */
interface TranslatedSetting {
  originalName: string;
  translatedName: string;
  originalDesc?: string;
  translatedDesc?: string;
  element: HTMLElement;
  setting: Setting;
}

/**
 * 设置页翻译服务实现
 */
export class SettingsTranslationService implements ISettingsTranslationService {
  private app: App;
  private configService: ConfigService;
  private translatorFactory: TranslatorFactory;
  private translatedSettings: Map<string, TranslatedSetting> = new Map();
  private translationCache: Map<string, string> = new Map();
  private observer: MutationObserver | null = null;
  private logger = utils.logger.createChild('SettingsTranslationService');
  private isInitialized = false;
  private currentConfig: SettingTranslationConfig;

  constructor(app: App, configService: ConfigService, translatorFactory: TranslatorFactory) {
    this.app = app;
    this.configService = configService;
    this.translatorFactory = translatorFactory;
    
    // 默认配置
    this.currentConfig = {
      enabled: true,
      targetLanguage: LanguageCode.ZH_CN,
      translator: TranslatorType.OPENAI,
      autoTranslate: true,
      cacheTranslations: true,
      translateDescriptions: true,
      translatePlaceholders: false
    };
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      await this.loadTranslationCache();
      
      if (this.currentConfig.enabled) {
        this.startObservingSettings();
      }
      
      this.isInitialized = true;
      this.logger.info('Settings translation service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize settings translation service', error);
      throw error;
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      this.stopObservingSettings();
      await this.saveTranslationCache();
      this.translatedSettings.clear();
      this.translationCache.clear();
      this.isInitialized = false;
      this.logger.info('Settings translation service destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy settings translation service', error);
    }
  }

  /**
   * 翻译设置页面
   */
  async translateSettingsPage(container: HTMLElement): Promise<void> {
    try {
      if (!this.isInitialized || !this.currentConfig.enabled) {
        return;
      }

      await this.translateSettingsInContainer(container);
      this.logger.info('Settings page translated');
    } catch (error) {
      this.logger.error('Failed to translate settings page', error);
    }
  }

  /**
   * 翻译单个设置项
   */
  async translateSetting(setting: Setting, name: string, description?: string): Promise<void> {
    try {
      if (!this.isInitialized || !this.currentConfig.enabled) {
        return;
      }

      const settingId = this.generateSettingId(setting);
      
      // 翻译名称
      const translatedName = await this.translateText(name);
      
      // 翻译描述（如果启用）
      let translatedDesc: string | undefined;
      if (description && this.currentConfig.translateDescriptions) {
        translatedDesc = await this.translateText(description);
      }

      // 应用翻译
      this.applyTranslationToSetting(setting, {
        originalName: name,
        translatedName,
        originalDesc: description,
        translatedDesc,
        element: setting.settingEl,
        setting
      });

      // 缓存翻译结果
      this.translatedSettings.set(settingId, {
        originalName: name,
        translatedName,
        originalDesc: description,
        translatedDesc,
        element: setting.settingEl,
        setting
      });

      this.logger.debug(`Setting translated: ${name} -> ${translatedName}`);
    } catch (error) {
      this.logger.error('Failed to translate setting', error);
    }
  }

  /**
   * 恢复原始设置文本
   */
  restoreOriginalSettings(): void {
    try {
      for (const [settingId, translatedSetting] of this.translatedSettings) {
        this.restoreSettingText(translatedSetting);
      }
      
      this.translatedSettings.clear();
      this.logger.info('Original settings text restored');
    } catch (error) {
      this.logger.error('Failed to restore original settings', error);
    }
  }

  /**
   * 切换翻译状态
   */
  async toggleTranslation(enabled: boolean): Promise<void> {
    try {
      this.currentConfig.enabled = enabled;
      
      if (enabled) {
        this.startObservingSettings();
        await this.translateCurrentSettings();
      } else {
        this.stopObservingSettings();
        this.restoreOriginalSettings();
      }
      
      await this.saveConfiguration();
      this.logger.info(`Settings translation ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.logger.error('Failed to toggle translation', error);
    }
  }

  /**
   * 更新翻译配置
   */
  async updateConfiguration(config: Partial<SettingTranslationConfig>): Promise<void> {
    try {
      const oldConfig = { ...this.currentConfig };
      this.currentConfig = { ...this.currentConfig, ...config };
      
      // 如果目标语言或翻译器改变，清除缓存并重新翻译
      if (oldConfig.targetLanguage !== this.currentConfig.targetLanguage ||
          oldConfig.translator !== this.currentConfig.translator) {
        this.translationCache.clear();
        this.restoreOriginalSettings();
        
        if (this.currentConfig.enabled) {
          await this.translateCurrentSettings();
        }
      }
      
      await this.saveConfiguration();
      this.logger.info('Translation configuration updated');
    } catch (error) {
      this.logger.error('Failed to update configuration', error);
    }
  }

  /**
   * 获取翻译配置
   */
  getConfiguration(): SettingTranslationConfig {
    return { ...this.currentConfig };
  }

  /**
   * 检查当前是否已翻译
   */
  isTranslated(): boolean {
    return this.translatedSettings.size > 0;
  }

  /**
   * 清除翻译缓存
   */
  async clearTranslationCache(): Promise<void> {
    try {
      this.translationCache.clear();
      await this.saveTranslationCache();
      this.logger.info('Translation cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear translation cache', error);
    }
  }

  /**
   * 获取翻译统计信息
   */
  getTranslationStats(): {
    translatedCount: number;
    cacheSize: number;
    isEnabled: boolean;
  } {
    return {
      translatedCount: this.translatedSettings.size,
      cacheSize: this.translationCache.size,
      isEnabled: this.currentConfig.enabled
    };
  }

  /**
   * 翻译文本
   */
  private async translateText(text: string): Promise<string> {
    try {
      // 检查缓存
      if (this.currentConfig.cacheTranslations) {
        const cacheKey = this.generateCacheKey(text);
        const cached = this.translationCache.get(cacheKey);
        if (cached) {
          return cached;
        }
      }

      // 获取全局配置
      const globalConfig = this.configService.getSettings();
      const maxTokens = globalConfig.advanced?.maxTokens || 128000;

      // 执行翻译
      const request: TranslationRequest = {
        text: utils.validation.sanitizeHtml(text),
        sourceLang: LanguageCode.AUTO,
        targetLang: this.currentConfig.targetLanguage,
        translator: this.currentConfig.translator,
        maxTokens: maxTokens
      };

      // 获取翻译器配置
      const translatorConfig = globalConfig.translators[this.currentConfig.translator];
      if (!translatorConfig) {
        throw new Error(`Translator ${this.currentConfig.translator} not configured`);
      }

      // 将全局maxTokens配置合并到翻译器配置中
      const enhancedTranslatorConfig = {
        ...translatorConfig,
        maxTokens: maxTokens
      };

      // 获取翻译器实例并执行翻译
      const translatorInstance = await this.translatorFactory.createTranslatorAsync(
        this.currentConfig.translator, 
        enhancedTranslatorConfig
      );
      
      if (!translatorInstance) {
        throw new Error(`Translator ${this.currentConfig.translator} not available`);
      }

      const response = await translatorInstance.translate(request);
      
      if (response.status === 'success') {
        // 缓存结果
        if (this.currentConfig.cacheTranslations) {
          const cacheKey = this.generateCacheKey(text);
          this.translationCache.set(cacheKey, response.translatedText);
        }
        
        return response.translatedText;
      } else {
        throw new Error('Translation failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Text translation failed', errorMessage);
      return text; // 返回原文
    }
  }

  /**
   * 开始观察设置变化
   */
  private startObservingSettings(): void {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 检查新添加的设置项
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.classList.contains('setting-item')) {
                this.translateNewSetting(element);
              }
            }
          }
        }
      }
    });

    // 观察设置容器
    const settingsContainer = document.querySelector('.modal-content, .workspace-leaf-content');
    if (settingsContainer) {
      this.observer.observe(settingsContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * 停止观察设置变化
   */
  private stopObservingSettings(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * 获取设置容器
   */
  private getSettingsContainer(settingTab?: SettingTab): HTMLElement | null {
    if (settingTab && settingTab.containerEl) {
      return settingTab.containerEl;
    }
    
    // 尝试找到当前打开的设置页面
    return document.querySelector('.modal-content .setting-item-container, .workspace-leaf-content .setting-item-container');
  }

  /**
   * 翻译容器中的所有设置
   */
  private async translateSettingsInContainer(container: HTMLElement): Promise<void> {
    const settingItems = container.querySelectorAll('.setting-item');
    
    for (const settingItem of Array.from(settingItems)) {
      await this.translateSettingElement(settingItem as HTMLElement);
    }
  }

  /**
   * 翻译设置元素
   */
  private async translateSettingElement(element: HTMLElement): Promise<void> {
    try {
      const nameElement = element.querySelector('.setting-item-name');
      const descElement = element.querySelector('.setting-item-description');
      
      if (!nameElement) {
        return;
      }

      const originalName = nameElement.textContent?.trim() || '';
      const originalDesc = descElement?.textContent?.trim() || '';
      
      if (!originalName) {
        return;
      }

      // 检查是否已经翻译过
      const settingId = this.generateElementId(element);
      if (this.translatedSettings.has(settingId)) {
        return;
      }

      // 翻译名称
      const translatedName = await this.translateText(originalName);
      nameElement.textContent = translatedName;
      
      // 翻译描述
      let translatedDesc: string | undefined;
      if (originalDesc && this.currentConfig.translateDescriptions && descElement) {
        translatedDesc = await this.translateText(originalDesc);
        descElement.textContent = translatedDesc;
      }

      // 翻译占位符（如果启用）
      if (this.currentConfig.translatePlaceholders) {
        await this.translatePlaceholders(element);
      }

      // 记录翻译
      this.translatedSettings.set(settingId, {
        originalName,
        translatedName,
        originalDesc,
        translatedDesc,
        element,
        setting: null as any // 这里没有Setting对象
      });
    } catch (error) {
      this.logger.error('Failed to translate setting element', error);
    }
  }

  /**
   * 翻译新添加的设置
   */
  private async translateNewSetting(element: HTMLElement): Promise<void> {
    if (!this.currentConfig.enabled || !this.currentConfig.autoTranslate) {
      return;
    }

    // 延迟一下，确保元素完全渲染
    setTimeout(() => {
      this.translateSettingElement(element);
    }, 100);
  }

  /**
   * 翻译占位符
   */
  private async translatePlaceholders(element: HTMLElement): Promise<void> {
    const inputs = element.querySelectorAll('input[placeholder], textarea[placeholder]');
    
    for (const input of Array.from(inputs)) {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) {
        const translatedPlaceholder = await this.translateText(placeholder);
        input.setAttribute('placeholder', translatedPlaceholder);
      }
    }
  }

  /**
   * 应用翻译到设置
   */
  private applyTranslationToSetting(setting: Setting, translation: TranslatedSetting): void {
    try {
      // 更新设置名称
      const nameElement = setting.settingEl.querySelector('.setting-item-name');
      if (nameElement) {
        nameElement.textContent = translation.translatedName;
      }

      // 更新设置描述
      if (translation.translatedDesc) {
        const descElement = setting.settingEl.querySelector('.setting-item-description');
        if (descElement) {
          descElement.textContent = translation.translatedDesc;
        }
      }
    } catch (error) {
      this.logger.error('Failed to apply translation to setting', error);
    }
  }

  /**
   * 恢复设置文本
   */
  private restoreSettingText(translation: TranslatedSetting): void {
    try {
      const nameElement = translation.element.querySelector('.setting-item-name');
      if (nameElement) {
        nameElement.textContent = translation.originalName;
      }

      if (translation.originalDesc) {
        const descElement = translation.element.querySelector('.setting-item-description');
        if (descElement) {
          descElement.textContent = translation.originalDesc;
        }
      }
    } catch (error) {
      this.logger.error('Failed to restore setting text', error);
    }
  }

  /**
   * 翻译当前设置
   */
  private async translateCurrentSettings(): Promise<void> {
    const settingsContainer = this.getSettingsContainer();
    if (settingsContainer) {
      await this.translateSettingsInContainer(settingsContainer);
    }
  }

  /**
   * 生成设置ID
   */
  private generateSettingId(setting: Setting): string {
    return utils.crypto.hash(setting.settingEl.outerHTML);
  }

  /**
   * 生成元素ID
   */
  private generateElementId(element: HTMLElement): string {
    const nameElement = element.querySelector('.setting-item-name');
    const name = nameElement?.textContent?.trim() || '';
    return utils.crypto.hash(name + element.outerHTML.substring(0, 100));
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(text: string): string {
    return utils.crypto.hash(`${text}|${this.currentConfig.targetLanguage}|${this.currentConfig.translator}`);
  }

  /**
   * 加载配置
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const config = this.configService.getSettings();
      
      // 从主配置中获取设置翻译配置
      // 优先使用用户当前选择的翻译器，如果没有则使用默认翻译器
      const selectedTranslator = this.getCurrentSelectedTranslator() || config.defaultTranslator;
      
      this.currentConfig = {
        ...this.currentConfig,
        targetLanguage: config.defaultTargetLang || this.currentConfig.targetLanguage,
        translator: selectedTranslator || this.currentConfig.translator
      };
      
      this.logger.debug('Settings translation configuration loaded', {
        targetLanguage: this.currentConfig.targetLanguage,
        translator: this.currentConfig.translator,
        selectedTranslator
      });
    } catch (error) {
      this.logger.error('Failed to load configuration', error);
    }
  }

  /**
   * 获取用户当前选择的翻译器
   * 从设置页面的翻译器选择器中读取当前值
   */
  private getCurrentSelectedTranslator(): TranslatorType | null {
    try {
      // 查找设置页面中的翻译器选择器
      const settingsContainer = this.getSettingsContainer();
      if (!settingsContainer) {
        return null;
      }
      
      // 查找翻译器选择下拉框
      const translatorDropdown = settingsContainer.querySelector('select[data-setting="translator"]') as HTMLSelectElement;
      if (translatorDropdown && translatorDropdown.value) {
        return translatorDropdown.value as TranslatorType;
      }
      
      // 如果没有找到选择器，尝试从设置页面的临时配置中获取
      const settingsPage = (this.app as any).setting?.activeTab;
      if (settingsPage && settingsPage.tempConfig && settingsPage.tempConfig.defaultTranslator) {
        return settingsPage.tempConfig.defaultTranslator;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get current selected translator', error);
      return null;
    }
  }

  /**
   * 保存配置
   */
  private async saveConfiguration(): Promise<void> {
    try {
      // 设置翻译配置已移除UI设置，无需保存额外配置
      this.logger.debug('Settings translation configuration saved');
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
    }
  }

  /**
   * 加载翻译缓存
   */
  private async loadTranslationCache(): Promise<void> {
    try {
      const cacheData = await this.app.vault.adapter.read(
        '.obsidian/plugins/translate-plugin/settings-translation-cache.json'
      );
      
      const cacheArray: Array<[string, string]> = JSON.parse(cacheData);
      this.translationCache = new Map(cacheArray);
      
      this.logger.debug('Settings translation cache loaded');
    } catch (error) {
      if (error instanceof Error && (error as any).code !== 'ENOENT') {
        this.logger.error('Failed to load translation cache', error);
      }
      this.translationCache = new Map();
    }
  }

  /**
   * 保存翻译缓存
   */
  private async saveTranslationCache(): Promise<void> {
    try {
      const configDir = '.obsidian/plugins/translate-plugin';
      
      if (!(await this.app.vault.adapter.exists(configDir))) {
        await this.app.vault.adapter.mkdir(configDir);
      }
      
      const cacheArray = Array.from(this.translationCache.entries());
      await this.app.vault.adapter.write(
        `${configDir}/settings-translation-cache.json`,
        JSON.stringify(cacheArray, null, 2)
      );
      
      this.logger.debug('Settings translation cache saved');
    } catch (error) {
      this.logger.error('Failed to save translation cache', error);
    }
  }

  /**
   * 翻译指定元素的文本内容
   */
  async translateElement(element: HTMLElement): Promise<void> {
    await this.translateSettingElement(element);
  }

  /**
   * 恢复设置页面的原始文本
   */
  restoreOriginalText(container: HTMLElement): void {
    this.restoreOriginalSettings();
  }

  /**
   * 检查元素是否已翻译
   */
  isElementTranslated(element: HTMLElement): boolean {
    const elementId = this.generateElementId(element);
    return this.translatedSettings.has(elementId);
  }
}

// 默认导出
export default SettingsTranslationService;