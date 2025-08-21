import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { PluginSettings, TranslatorConfig, TranslatorType, LanguageCode } from '../types';
import { ConfigService } from '../services';
import { utils } from '../utils';
import { TranslatePlugin } from '../main';

/**
 * 插件设置页面
 */
export class TranslateSettingTab extends PluginSettingTab {
  private plugin: TranslatePlugin;
  private configService: ConfigService;
  private translatorFactory: any; // TranslatorFactory类型
  private logger = utils.logger.createChild('TranslateSettingTab');
  
  // 临时配置存储
  private tempConfig: PluginSettings;
  private hasUnsavedChanges = false;

  constructor(app: App, plugin: TranslatePlugin, configService: ConfigService) {
    super(app, plugin);
    this.plugin = plugin;
    this.configService = configService;
    this.translatorFactory = plugin.getTranslatorFactory();
    this.tempConfig = JSON.parse(JSON.stringify(this.configService.getConfig()));
  }

  /**
   * 显示设置页面
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    // 页面标题
    containerEl.createEl('h1', { text: 'Translate Plugin Settings' });
    
    // 创建各个设置区域
    this.createGeneralSettings(containerEl);
    this.createTranslatorSettings(containerEl);
    this.createAdvancedSettings(containerEl);
    this.createActionButtons(containerEl);
    
    this.logger.info('Settings page displayed');
  }

  /**
   * 创建通用设置
   */
  private createGeneralSettings(containerEl: HTMLElement): void {
    const section = containerEl.createDiv('setting-section');
    section.createEl('h2', { text: '通用设置' });
    
    // 默认源语言
    new Setting(section)
      .setName('默认源语言')
      .setDesc('翻译时的默认源语言，设置为 auto 可自动检测')
      .addDropdown(dropdown => {
        const languages = this.getSupportedLanguages();
        languages.forEach(lang => {
          dropdown.addOption(lang.code, lang.name);
        });
        dropdown.setValue('auto'); // 源语言暂时固定为自动检测
        dropdown.onChange(value => {
          // 暂时不保存源语言设置
          this.markAsChanged();
        });
      });
    
    // 默认目标语言
    new Setting(section)
      .setName('默认目标语言')
      .setDesc('翻译时的默认目标语言')
      .addDropdown(dropdown => {
        const languages = this.getSupportedLanguages().filter(lang => lang.code !== 'auto');
        languages.forEach(lang => {
          dropdown.addOption(lang.code, lang.name);
        });
        dropdown.setValue(this.tempConfig.defaultTargetLang || 'zh-CN');
        dropdown.onChange(value => {
          this.tempConfig.defaultTargetLang = value as LanguageCode;
          this.markAsChanged();
        });
      });
    
    // 默认翻译器
    new Setting(section)
      .setName('默认翻译器')
      .setDesc('默认使用的翻译服务')
      .addDropdown(dropdown => {
        const translators = this.getAvailableTranslators();
        translators.forEach(translator => {
          dropdown.addOption(translator.type, translator.name);
        });
        dropdown.setValue(this.tempConfig.defaultTranslator || 'openai');
        dropdown.onChange(value => {
          this.tempConfig.defaultTranslator = value as TranslatorType;
          this.markAsChanged();
        });
      });
    
    // 显示模式
    new Setting(section)
      .setName('默认显示模式')
      .setDesc('翻译结果的默认显示方式')
      .addDropdown(dropdown => {
        dropdown.addOption('popup', '弹窗');
        dropdown.addOption('sidebar', '侧边栏');
        dropdown.addOption('inline', '内联');
        dropdown.addOption('replace', '替换');
        dropdown.setValue(this.tempConfig.defaultDisplayMode || 'popup');
        dropdown.onChange(value => {
          this.tempConfig.defaultDisplayMode = value as any;
          this.markAsChanged();
        });
      });
  }

  /**
   * 创建翻译器设置
   */
  private createTranslatorSettings(containerEl: HTMLElement): void {
    const section = containerEl.createDiv('setting-section');
    section.createEl('h2', { text: '翻译器配置' });
    
    // 翻译器选择器
    let selectedTranslator = this.tempConfig.defaultTranslator || TranslatorType.OPENAI;
    
    new Setting(section)
      .setName('选择要配置的翻译器')
      .setDesc('选择一个翻译器进行详细配置')
      .addDropdown(dropdown => {
        const translators = this.getAvailableTranslators();
        translators.forEach(translator => {
          dropdown.addOption(translator.type, translator.name);
        });
        dropdown.setValue(selectedTranslator);
        dropdown.onChange(value => {
          selectedTranslator = value as TranslatorType;
          this.showTranslatorConfig(section, selectedTranslator);
        });
      });
    
    // 创建配置容器
    const configContainer = section.createDiv('translator-config-container');
    
    // 初始显示选中的翻译器配置
    this.showTranslatorConfig(section, selectedTranslator);
  }

  /**
   * 显示指定翻译器的配置
   */
  private showTranslatorConfig(sectionEl: HTMLElement, translatorType: TranslatorType): void {
    // 清除现有的配置容器内容
    const existingContainer = sectionEl.querySelector('.translator-config-container');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    // 创建新的配置容器
    const configContainer = sectionEl.createDiv('translator-config-container');
    
    // 根据翻译器类型显示对应配置
    switch (translatorType) {
      case TranslatorType.OPENAI:
        this.createOpenAISettings(configContainer);
        break;
      case TranslatorType.CUSTOM:
        this.createCustomTranslatorSettings(configContainer);
        break;
    }
  }

  /**
   * 创建 OpenAI 设置
   */
  private createOpenAISettings(containerEl: HTMLElement): void {
    const subsection = containerEl.createDiv('setting-subsection');
    subsection.createEl('h3', { text: 'OpenAI 配置' });
    
    const openaiConfig = this.tempConfig.translators?.[TranslatorType.OPENAI] || {};
    
    // API Key
    new Setting(subsection)
      .setName('API Key')
      .setDesc('OpenAI API 密钥')
      .addText(text => {
        text.setPlaceholder('sk-...');
        text.setValue(openaiConfig.apiKey || '');
        text.inputEl.type = 'password';
        text.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.OPENAI, 'apiKey', value);
        });
      });
    
    // 模型选择
    new Setting(subsection)
      .setName('模型选择')
      .setDesc('选择预设模型或使用自定义模型')
      .addDropdown(dropdown => {
        const models = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'custom'];
        models.forEach(model => {
          dropdown.addOption(model, model === 'custom' ? '自定义模型' : model);
        });
        const currentModel = (openaiConfig as any).model || 'gpt-3.5-turbo';
        const isCustomModel = !['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'].includes(currentModel);
        dropdown.setValue(isCustomModel ? 'custom' : currentModel);
        dropdown.onChange(value => {
          if (value !== 'custom') {
            this.updateTranslatorConfig(TranslatorType.OPENAI, 'model', value);
          }
          // 显示/隐藏自定义模型输入框
          const customModelSetting = subsection.querySelector('.custom-model-setting') as HTMLElement;
          if (customModelSetting) {
            customModelSetting.style.display = value === 'custom' ? 'block' : 'none';
          }
        });
      });

    // 自定义模型输入框
    const customModelSetting = new Setting(subsection)
      .setName('自定义模型名称')
      .setDesc('输入自定义的模型名称（如 gpt-4-32k, claude-3-opus 等）')
      .addText(text => {
        text.setPlaceholder('输入模型名称');
        const currentModel = (openaiConfig as any).model || 'gpt-3.5-turbo';
        const isCustomModel = !['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'].includes(currentModel);
        text.setValue(isCustomModel ? currentModel : '');
        text.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.OPENAI, 'model', value);
        });
      });
    
    // 添加CSS类以便控制显示/隐藏
    customModelSetting.settingEl.addClass('custom-model-setting');
    
    // 初始化显示状态
    const currentModel = (openaiConfig as any).model || 'gpt-3.5-turbo';
    const isCustomModel = !['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'].includes(currentModel);
    customModelSetting.settingEl.style.display = isCustomModel ? 'block' : 'none';
    
    // Base URL
    new Setting(subsection)
      .setName('Base URL')
      .setDesc('自定义 API 端点（可选）')
      .addText(text => {
        text.setPlaceholder('https://api.openai.com/v1');
        text.setValue((openaiConfig as any).baseURL || '');
        text.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.OPENAI, 'baseURL', value);
        });
      });
    
    // 温度
    new Setting(subsection)
      .setName('温度')
      .setDesc('控制翻译的创造性（0-1）')
      .addSlider(slider => {
        slider.setLimits(0, 1, 0.1);
        slider.setValue((openaiConfig as any).temperature || 0.3);
        slider.setDynamicTooltip();
        slider.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.OPENAI, 'temperature', value);
        });
      });
    
    // 测试连接按钮
    new Setting(subsection)
      .setName('测试连接')
      .setDesc('测试 OpenAI API 连接是否正常')
      .addButton(button => {
        button.setButtonText('测试');
        button.onClick(() => this.testTranslatorConnection(TranslatorType.OPENAI));
      });
  }





  /**
   * 创建自定义翻译器设置
   */
  private createCustomTranslatorSettings(containerEl: HTMLElement): void {
    const subsection = containerEl.createDiv('setting-subsection');
    subsection.createEl('h3', { text: '自定义翻译器配置' });
    
    const customConfig = this.tempConfig.translators?.[TranslatorType.CUSTOM] || {};
    
    // API 端点
    new Setting(subsection)
      .setName('API 端点')
      .setDesc('自定义翻译 API 的 URL')
      .addText(text => {
        text.setPlaceholder('https://api.example.com/translate');
        text.setValue((customConfig as any).endpoint || '');
        text.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.CUSTOM, 'endpoint', value);
        });
      });
    
    // 请求方法
    new Setting(subsection)
      .setName('请求方法')
      .setDesc('HTTP 请求方法')
      .addDropdown(dropdown => {
        ['GET', 'POST', 'PUT'].forEach(method => {
          dropdown.addOption(method, method);
        });
        dropdown.setValue((customConfig as any).method || 'POST');
        dropdown.onChange(value => {
          this.updateTranslatorConfig(TranslatorType.CUSTOM, 'method', value);
        });
      });
    
    // 请求头
    new Setting(subsection)
      .setName('请求头')
      .setDesc('JSON 格式的请求头配置')
      .addTextArea(text => {
        text.setPlaceholder('{\n  "Authorization": "Bearer your-token",\n  "Content-Type": "application/json"\n}');
        text.setValue(JSON.stringify((customConfig as any).headers || {}, null, 2));
        text.onChange(value => {
          try {
            const headers = JSON.parse(value);
            this.updateTranslatorConfig(TranslatorType.CUSTOM, 'headers', headers);
          } catch (error) {
            // 忽略无效的 JSON
          }
        });
      });
    
    // 测试连接按钮
    new Setting(subsection)
      .setName('测试连接')
      .setDesc('测试自定义翻译 API 连接是否正常')
      .addButton(button => {
        button.setButtonText('测试');
        button.onClick(() => this.testTranslatorConnection(TranslatorType.CUSTOM));
      });
  }



  /**
   * 创建高级设置
   */
  private createAdvancedSettings(containerEl: HTMLElement): void {
    const section = containerEl.createDiv('setting-section');
    section.createEl('h2', { text: '高级设置' });
    
    // 启用缓存
    new Setting(section)
      .setName('启用翻译缓存')
      .setDesc('缓存翻译结果以提高性能')
      .addToggle(toggle => {
        toggle.setValue(this.tempConfig.advanced?.enableCache !== false);
        toggle.onChange(value => {
          if (!this.tempConfig.advanced) {
            this.tempConfig.advanced = {
              enableCache: true,
              cacheExpiry: 24 * 60 * 60 * 1000, // 24小时
              enableLogging: false,
              logLevel: 'info' as const,
              maxTokens: 128000
            };
          }
          this.tempConfig.advanced.enableCache = value;
          this.markAsChanged();
        });
      });
    
    // 缓存过期时间
    new Setting(section)
      .setName('缓存过期时间')
      .setDesc('缓存条目的过期时间（小时）')
      .addSlider(slider => {
        slider.setLimits(1, 168, 1); // 1小时到7天
        const currentExpiry = this.tempConfig.advanced?.cacheExpiry || (24 * 60 * 60 * 1000);
        slider.setValue(Math.round(currentExpiry / (60 * 60 * 1000))); // 转换为小时
        slider.setDynamicTooltip();
        slider.onChange(value => {
          if (!this.tempConfig.advanced) {
            this.tempConfig.advanced = {
              enableCache: true,
              cacheExpiry: 24 * 60 * 60 * 1000, // 24小时
              enableLogging: false,
              logLevel: 'info' as const,
              maxTokens: 128000
            };
          }
          this.tempConfig.advanced.cacheExpiry = value * 60 * 60 * 1000; // 转换为毫秒
          this.markAsChanged();
        });
      });
    
    // 最大Token数量
    new Setting(section)
      .setName('最大Token数量')
      .setDesc('单次翻译请求的最大token数量限制')
      .addText(text => {
        text.setPlaceholder('128000');
        const currentMaxTokens = this.tempConfig.advanced?.maxTokens || 128000;
        text.setValue(currentMaxTokens.toString());
        text.onChange(value => {
          const numValue = parseInt(value);
          if (!isNaN(numValue) && numValue > 0) {
            if (!this.tempConfig.advanced) {
              this.tempConfig.advanced = {
                enableCache: true,
                cacheExpiry: 24 * 60 * 60 * 1000,
                enableLogging: false,
                logLevel: 'info',
                maxTokens: 128000
              };
            }
            this.tempConfig.advanced.maxTokens = numValue;
            this.markAsChanged();
          }
        });
      });
    
    // 启用日志
    new Setting(section)
      .setName('启用日志记录')
      .setDesc('记录插件运行日志')
      .addToggle(toggle => {
        toggle.setValue(this.tempConfig.advanced?.enableLogging === true);
        toggle.onChange(value => {
          if (!this.tempConfig.advanced) {
            this.tempConfig.advanced = {
              enableCache: true,
              cacheExpiry: 24 * 60 * 60 * 1000,
              enableLogging: false,
              logLevel: 'info' as const,
              maxTokens: 128000
            };
          }
          this.tempConfig.advanced.enableLogging = value;
          this.markAsChanged();
        });
      });
    
    // 日志级别
    new Setting(section)
      .setName('日志级别')
      .setDesc('设置日志记录的详细程度')
      .addDropdown(dropdown => {
        dropdown.addOption('debug', '调试');
        dropdown.addOption('info', '信息');
        dropdown.addOption('warn', '警告');
        dropdown.addOption('error', '错误');
        dropdown.setValue(this.tempConfig.advanced?.logLevel || 'info');
        dropdown.onChange(value => {
          if (!this.tempConfig.advanced) {
            this.tempConfig.advanced = {
              enableCache: true,
              cacheExpiry: 24 * 60 * 60 * 1000,
              enableLogging: false,
              logLevel: 'info' as const,
              maxTokens: 128000
            };
          }
          this.tempConfig.advanced.logLevel = value as 'debug' | 'info' | 'warn' | 'error';
          this.markAsChanged();
        });
      });
  }

  /**
   * 创建操作按钮
   */
  private createActionButtons(containerEl: HTMLElement): void {
    const section = containerEl.createDiv('setting-section');
    const buttonContainer = section.createDiv('setting-buttons');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--background-modifier-border);
    `;
    
    // 保存按钮
    const saveBtn = buttonContainer.createEl('button', {
      text: '保存设置',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', () => this.saveSettings());
    
    // 重置按钮
    const resetBtn = buttonContainer.createEl('button', {
      text: '重置为默认'
    });
    resetBtn.addEventListener('click', () => this.resetSettings());
    
    // 导出配置按钮
    const exportBtn = buttonContainer.createEl('button', {
      text: '导出配置'
    });
    exportBtn.addEventListener('click', () => this.exportConfig());
    
    // 导入配置按钮
    const importBtn = buttonContainer.createEl('button', {
      text: '导入配置'
    });
    importBtn.addEventListener('click', () => this.importConfig());
    
    // 清除缓存按钮
    const clearCacheBtn = buttonContainer.createEl('button', {
      text: '清除缓存'
    });
    clearCacheBtn.addEventListener('click', () => this.clearCache());
  }

  /**
   * 获取翻译器名称
   */
  private getTranslatorName(translatorType: TranslatorType): string {
    switch (translatorType) {
      case TranslatorType.OPENAI:
        return 'OpenAI';
      case TranslatorType.CUSTOM:
        return '自定义接口';
      default:
        return '未知翻译器';
    }
  }

  /**
   * 更新翻译器配置
   */
  private updateTranslatorConfig(translatorType: TranslatorType, key: string, value: any): void {
    if (!this.tempConfig.translators) {
      this.tempConfig.translators = {
        [TranslatorType.OPENAI]: { type: TranslatorType.OPENAI, name: 'OpenAI', enabled: false },
        [TranslatorType.CUSTOM]: { type: TranslatorType.CUSTOM, name: '自定义接口', enabled: false }
      };
    }
    if (!this.tempConfig.translators[translatorType]) {
      this.tempConfig.translators[translatorType] = {
        type: translatorType,
        name: this.getTranslatorName(translatorType),
        enabled: false
      };
    }
    
    (this.tempConfig.translators[translatorType] as any)[key] = value;
    this.markAsChanged();
  }



  /**
   * 标记为已更改
   */
  private markAsChanged(): void {
    this.hasUnsavedChanges = true;
  }

  /**
   * 保存设置
   */
  private async saveSettings(): Promise<void> {
    try {
      await this.configService.updateConfig(this.tempConfig);
      this.hasUnsavedChanges = false;
      new Notice('设置已保存');
      this.logger.info('Settings saved successfully');
    } catch (error) {
      new Notice('保存设置失败');
      this.logger.error('Failed to save settings', error);
    }
  }

  /**
   * 重置设置
   */
  private async resetSettings(): Promise<void> {
    if (confirm('确定要重置所有设置为默认值吗？此操作不可撤销。')) {
      try {
        await this.configService.resetConfig();
        this.tempConfig = JSON.parse(JSON.stringify(this.configService.getConfig()));
        this.hasUnsavedChanges = false;
        this.display(); // 重新显示页面
        new Notice('设置已重置');
        this.logger.info('Settings reset to default');
      } catch (error) {
        new Notice('重置设置失败');
        this.logger.error('Failed to reset settings', error);
      }
    }
  }

  /**
   * 导出配置
   */
  private async exportConfig(): Promise<void> {
    try {
      const config = await this.configService.exportConfig();
      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `translate-plugin-config-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      new Notice('配置已导出');
    } catch (error) {
      new Notice('导出配置失败');
      this.logger.error('Failed to export config', error);
    }
  }

  /**
   * 导入配置
   */
  private importConfig(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        await this.configService.importConfig(text);
        this.tempConfig = JSON.parse(JSON.stringify(this.configService.getConfig()));
        this.hasUnsavedChanges = false;
        this.display(); // 重新显示页面
        new Notice('配置已导入');
      } catch (error) {
        new Notice('导入配置失败');
        this.logger.error('Failed to import config', error);
      }
    };
    input.click();
  }

  /**
   * 清除缓存
   */
  private async clearCache(): Promise<void> {
    if (confirm('确定要清除所有翻译缓存吗？')) {
      try {
        // 这里需要调用缓存清除方法
        // await this.cacheService.clearAll();
        new Notice('缓存已清除');
        this.logger.info('Cache cleared');
      } catch (error) {
        new Notice('清除缓存失败');
        this.logger.error('Failed to clear cache', error);
      }
    }
  }

  /**
   * 测试翻译器连接
   */
  private async testTranslatorConnection(translatorType: TranslatorType): Promise<void> {
    const notice = new Notice(`正在测试 ${translatorType} 连接...`, 0);
    
    try {
      // 获取当前翻译器配置
      const translatorConfig = this.tempConfig.translators?.[translatorType];
      if (!translatorConfig) {
        notice.hide();
        new Notice(`${translatorType} 配置不存在`);
        return;
      }

      // 检查必要的配置项（根据不同翻译器类型）
      let configValid = false;
      let missingField = '';
      
      switch (translatorType) {
        case TranslatorType.OPENAI:
          configValid = !!(translatorConfig as any).apiKey;
          missingField = 'API Key';
          break;
        case TranslatorType.CUSTOM:
          const customConfig = translatorConfig as any;
          configValid = !!(customConfig.endpoint);
          missingField = 'API 端点';
          break;
        default:
          configValid = !!(translatorConfig as any).apiKey;
          missingField = 'API Key';
      }
      
      if (!configValid) {
        notice.hide();
        new Notice(`${translatorType} ${missingField} 未配置`);
        return;
      }

      // 创建临时翻译器实例进行测试
      const tempInstanceId = `test_${translatorType}_${Date.now()}`;
      let translator;
      
      try {
        // 合并全局maxTokens配置到翻译器配置中
        const enhancedTranslatorConfig = {
          ...translatorConfig,
          maxTokens: this.tempConfig.advanced?.maxTokens || 128000
        };
        
        translator = await this.translatorFactory.createTranslatorAsync(
          translatorType,
          enhancedTranslatorConfig,
          tempInstanceId
        );
        
        // 初始化翻译器
        await translator.initialize();
        
        // 测试可用性
        const isAvailable = await translator.isAvailable();
        
        notice.hide();
        if (isAvailable) {
          new Notice(`${translatorType} 连接测试成功`);
        } else {
          new Notice(`${translatorType} 连接测试失败：服务不可用`);
        }
      } finally {
        // 清理临时实例
        if (translator) {
          try {
            await this.translatorFactory.destroyInstance(tempInstanceId);
          } catch (cleanupError) {
            this.logger.warn(`Failed to cleanup test instance for ${translatorType}`, cleanupError);
          }
        }
      }
    } catch (error) {
      notice.hide();
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      new Notice(`${translatorType} 连接测试失败：${errorMessage}`);
      this.logger.error(`Failed to test ${translatorType} connection`, error);
    }
  }

  /**
   * 获取支持的语言列表
   */
  private getSupportedLanguages(): Array<{ code: string; name: string }> {
    return [
      { code: 'auto', name: '自动检测' },
      { code: 'zh-CN', name: '中文（简体）' },
      { code: 'zh-TW', name: '中文（繁体）' },
      { code: 'en', name: 'English' },
      { code: 'ja', name: '日本語' },
      { code: 'ko', name: '한국어' },
      { code: 'fr', name: 'Français' },
      { code: 'de', name: 'Deutsch' },
      { code: 'es', name: 'Español' },
      { code: 'ru', name: 'Русский' },
      { code: 'it', name: 'Italiano' },
      { code: 'pt', name: 'Português' },
      { code: 'ar', name: 'العربية' },
      { code: 'hi', name: 'हिन्दी' },
      { code: 'th', name: 'ไทย' },
      { code: 'vi', name: 'Tiếng Việt' }
    ];
  }

  /**
   * 获取可用的翻译器列表
   */
  private getAvailableTranslators(): Array<{ type: TranslatorType; name: string }> {
    return [
      { type: TranslatorType.OPENAI, name: 'OpenAI GPT' },
      { type: TranslatorType.CUSTOM, name: '自定义接口' }
    ];
  }

  /**
   * 页面隐藏时的处理
   */
  hide(): void {
    if (this.hasUnsavedChanges) {
      if (confirm('有未保存的更改，是否保存？')) {
        this.saveSettings();
      }
    }
    super.hide();
  }
}