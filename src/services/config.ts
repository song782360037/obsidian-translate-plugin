import { IConfigService } from '../interfaces';
import { TranslatorType, LanguageCode, PluginSettings, TranslatorConfig } from '../types';
import { utils } from '../utils';
import { App } from 'obsidian';

/**
 * 配置存储键名
 */
const CONFIG_KEYS = {
  MAIN: 'obsidian-translate-plugin-config',
  ENCRYPTED: 'obsidian-translate-plugin-encrypted',
  BACKUP: 'obsidian-translate-plugin-backup'
} as const;

/**
 * 默认配置
 */
const DEFAULT_CONFIG: PluginSettings = {
  // 默认翻译器
  defaultTranslator: TranslatorType.OPENAI,
  // 默认目标语言
  defaultTargetLang: LanguageCode.ZH_CN,
  // 默认显示模式
  defaultDisplayMode: 'popup',
  // 翻译器配置
  translators: {
    [TranslatorType.OPENAI]: {
      type: TranslatorType.OPENAI,
      name: 'OpenAI',
      enabled: false,
      timeout: 30000,
      retryCount: 3
    },
    [TranslatorType.CUSTOM]: {
      type: TranslatorType.CUSTOM,
      name: 'Custom',
      enabled: false,
      timeout: 30000,
      retryCount: 3
    }
  },
  // 快捷键
  hotkeys: {
    translate: 'Ctrl+Shift+T',
    translateAndReplace: 'Ctrl+Shift+R',
    showSidebar: 'Ctrl+Shift+S'
  },
  // 高级设置
  advanced: {
    enableCache: true,
    cacheExpiry: 24 * 60 * 60 * 1000, // 24小时
    enableLogging: true,
    logLevel: 'info',
    maxTokens: 128000
  }
};

/**
 * 配置管理服务实现
 */
export class ConfigService implements IConfigService {
  private app: App;
  private config: PluginSettings;
  private encryptedData: Record<string, string> = {};
  private logger = console; // TODO: 实现日志记录器
  private configChangeListeners: Array<(config: PluginSettings) => void> = [];
  private backupTimer?: NodeJS.Timeout;

  constructor(app: App) {
    this.app = app;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 初始化配置服务
   */
  async initialize(): Promise<void> {
    try {
      await this.loadConfig();
      await this.loadEncryptedData();
      this.startBackupTimer();
      this.logger.info('Config service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize config service', error);
      throw error;
    }
  }

  /**
   * 销毁配置服务
   */
  async destroy(): Promise<void> {
    try {
      this.stopBackupTimer();
      await this.saveConfig();
      await this.saveEncryptedData();
      this.configChangeListeners = [];
      this.logger.info('Config service destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy config service', error);
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): PluginSettings {
    return { ...this.config };
  }

  /**
   * 加载配置 (IConfigService接口方法)
   */
  async loadSettings(): Promise<PluginSettings> {
    await this.loadConfig();
    return this.getSettings();
  }

  /**
   * 保存配置 (IConfigService接口方法)
   */
  async saveSettings(settings: PluginSettings): Promise<void> {
    this.config = { ...settings };
    await this.saveConfig();
    this.notifyConfigChange(this.config);
  }

  /**
   * 获取当前配置 (IConfigService接口方法)
   */
  getSettings(): PluginSettings {
    return { ...this.config };
  }

  /**
   * 更新配置 (IConfigService接口方法)
   */
  async updateSettings(updates: Partial<PluginSettings>): Promise<void> {
    await this.updateConfig(updates);
  }

  /**
   * 重置配置为默认值 (IConfigService接口方法)
   */
  async resetSettings(): Promise<void> {
    await this.resetConfig();
  }

  /**
   * 加密敏感数据 (IConfigService接口方法)
   */
  encryptSensitiveData(data: string): string {
    // TODO: 实现加密功能
    return data;
  }

  /**
   * 解密敏感数据 (IConfigService接口方法)
   */
  decryptSensitiveData(encryptedData: string): string {
    // TODO: 实现解密功能
    return encryptedData;
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: Partial<PluginSettings>): Promise<void> {
    try {
      const oldConfig = { ...this.config };
      this.config = this.mergeConfig(this.config, updates);
      
      await this.saveConfig();
      this.notifyConfigChange(this.config);
      
      this.logger.info('Config updated', { updates });
    } catch (error) {
      this.logger.error('Failed to update config', error);
      throw error;
    }
  }

  /**
   * 重置配置为默认值
   */
  async resetConfig(): Promise<void> {
    try {
      this.config = { ...DEFAULT_CONFIG };
      await this.saveConfig();
      this.notifyConfigChange(this.config);
      this.logger.info('Config reset to defaults');
    } catch (error) {
      this.logger.error('Failed to reset config', error);
      throw error;
    }
  }

  /**
   * 获取翻译器配置
   */
  getTranslatorConfig(type: TranslatorType): TranslatorConfig | undefined {
    return this.config.translators[type];
  }

  /**
   * 更新翻译器配置
   */
  async updateTranslatorConfig(type: TranslatorType, config: TranslatorConfig): Promise<void> {
    try {
      if (!this.config.translators) {
        this.config.translators = { ...DEFAULT_CONFIG.translators };
      }
      
      this.config.translators[type] = { ...config };
      await this.saveConfig();
      this.notifyConfigChange(this.config);
      
      this.logger.info(`Translator config updated for ${type}`);
    } catch (error) {
      this.logger.error(`Failed to update translator config for ${type}`, error);
      throw error;
    }
  }

  /**
   * 删除翻译器配置
   */
  async removeTranslatorConfig(type: TranslatorType): Promise<void> {
    try {
      if (this.config.translators && this.config.translators[type]) {
        delete this.config.translators[type];
        await this.saveConfig();
        this.notifyConfigChange(this.config);
        this.logger.info(`Translator config removed for ${type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove translator config for ${type}`, error);
      throw error;
    }
  }

  /**
   * 加密存储敏感数据
   */
  async setEncryptedValue(key: string, value: string): Promise<void> {
    try {
      const encryptedValue = utils.crypto.encrypt(value);
      this.encryptedData[key] = encryptedValue;
      await this.saveEncryptedData();
      this.logger.info(`Encrypted value set for key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to set encrypted value for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 获取加密存储的数据
   */
  async getEncryptedValue(key: string): Promise<string | undefined> {
    try {
      const encryptedValue = this.encryptedData[key];
      if (!encryptedValue) {
        return undefined;
      }
      
      return utils.crypto.decrypt(encryptedValue);
    } catch (error) {
      this.logger.error(`Failed to get encrypted value for key: ${key}`, error);
      return undefined;
    }
  }

  /**
   * 删除加密存储的数据
   */
  async removeEncryptedValue(key: string): Promise<void> {
    try {
      if (this.encryptedData[key]) {
        delete this.encryptedData[key];
        await this.saveEncryptedData();
        this.logger.info(`Encrypted value removed for key: ${key}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove encrypted value for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 导出配置
   */
  async exportConfig(includeEncrypted: boolean = false): Promise<string> {
    try {
      const exportData: any = {
        config: this.config,
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      if (includeEncrypted) {
        exportData.encrypted = this.encryptedData;
      }
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.logger.error('Failed to export config', error);
      throw error;
    }
  }

  /**
   * 导入配置
   */
  async importConfig(configData: string, mergeMode: boolean = false): Promise<void> {
    try {
      const importData = JSON.parse(configData);
      
      if (!importData.config) {
        throw new Error('Invalid config data format');
      }
      
      // 验证配置数据
      const validatedConfig = this.validateConfig(importData.config);
      
      if (mergeMode) {
        this.config = this.mergeConfig(this.config, validatedConfig);
      } else {
        this.config = validatedConfig;
      }
      
      // 导入加密数据（如果存在）
      if (importData.encrypted) {
        this.encryptedData = { ...this.encryptedData, ...importData.encrypted };
        await this.saveEncryptedData();
      }
      
      await this.saveConfig();
      this.notifyConfigChange(this.config);
      
      this.logger.info('Config imported successfully');
    } catch (error) {
      this.logger.error('Failed to import config', error);
      throw error;
    }
  }

  /**
   * 添加配置变更监听器
   */
  onConfigChange(listener: (config: PluginSettings) => void): () => void {
    this.configChangeListeners.push(listener);
    
    // 返回取消监听的函数
    return () => {
      const index = this.configChangeListeners.indexOf(listener);
      if (index > -1) {
        this.configChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * 创建配置备份
   */
  async createBackup(): Promise<void> {
    try {
      // TODO: Add backupEnabled to PluginSettings.advanced interface
      // if (!this.config.advanced.backupEnabled) {
      //   return;
      // }
      
      const backupData = {
        config: this.config,
        encrypted: this.encryptedData,
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      const backupKey = `${CONFIG_KEYS.BACKUP}-${Date.now()}`;
      await this.app.vault.adapter.write(
        `.obsidian/plugins/translate-plugin/backups/${backupKey}.json`,
        JSON.stringify(backupData, null, 2)
      );
      
      // 清理旧备份
      await this.cleanupOldBackups();
      
      this.logger.info('Config backup created');
    } catch (error) {
      this.logger.error('Failed to create config backup', error);
    }
  }

  /**
   * 恢复配置备份
   */
  async restoreBackup(backupTimestamp: number): Promise<void> {
    try {
      const backupKey = `${CONFIG_KEYS.BACKUP}-${backupTimestamp}`;
      const backupPath = `.obsidian/plugins/translate-plugin/backups/${backupKey}.json`;
      
      const backupData = await this.app.vault.adapter.read(backupPath);
      const parsedData = JSON.parse(backupData);
      
      this.config = this.validateConfig(parsedData.config);
      this.encryptedData = parsedData.encrypted || {};
      
      await this.saveConfig();
      await this.saveEncryptedData();
      this.notifyConfigChange(this.config);
      
      this.logger.info(`Config restored from backup: ${backupTimestamp}`);
    } catch (error) {
      this.logger.error(`Failed to restore backup: ${backupTimestamp}`, error);
      throw error;
    }
  }

  /**
   * 获取可用的备份列表
   */
  async getAvailableBackups(): Promise<Array<{ timestamp: number; size: number }>> {
    try {
      const backupDir = '.obsidian/plugins/translate-plugin/backups';
      const files = await this.app.vault.adapter.list(backupDir);
      
      const backups = [];
      for (const file of files.files) {
        if (file.endsWith('.json')) {
          const match = file.match(new RegExp(`${CONFIG_KEYS.BACKUP}-(\\d+)\\.json`));
          if (match) {
            const timestamp = parseInt(match[1]);
            const stat = await this.app.vault.adapter.stat(file);
            backups.push({
              timestamp,
              size: stat?.size || 0
            });
          }
        }
      }
      
      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger.error('Failed to get available backups', error);
      return [];
    }
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    try {
      const configData = await this.app.vault.adapter.read(
        `.obsidian/plugins/translate-plugin/${CONFIG_KEYS.MAIN}.json`
      );
      
      const parsedConfig = JSON.parse(configData);
      this.config = this.mergeConfig(DEFAULT_CONFIG, this.validateConfig(parsedConfig));
      
      this.logger.info('Config loaded successfully');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // 配置文件不存在，使用默认配置
        this.config = { ...DEFAULT_CONFIG };
        await this.saveConfig();
        this.logger.info('Created default config file');
      } else {
        this.logger.error('Failed to load config', error);
        throw error;
      }
    }
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    try {
      const configDir = '.obsidian/plugins/translate-plugin';
      
      // 确保目录存在
      if (!(await this.app.vault.adapter.exists(configDir))) {
        await this.app.vault.adapter.mkdir(configDir);
      }
      
      await this.app.vault.adapter.write(
        `${configDir}/${CONFIG_KEYS.MAIN}.json`,
        JSON.stringify(this.config, null, 2)
      );
      
      this.logger.debug('Config saved successfully');
    } catch (error) {
      this.logger.error('Failed to save config', error);
      throw error;
    }
  }

  /**
   * 加载加密数据
   */
  private async loadEncryptedData(): Promise<void> {
    try {
      const encryptedData = await this.app.vault.adapter.read(
        `.obsidian/plugins/translate-plugin/${CONFIG_KEYS.ENCRYPTED}.json`
      );
      
      this.encryptedData = JSON.parse(encryptedData);
      this.logger.info('Encrypted data loaded successfully');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // 加密数据文件不存在
        this.encryptedData = {};
        this.logger.info('No encrypted data file found, starting with empty data');
      } else {
        this.logger.error('Failed to load encrypted data', error);
        throw error;
      }
    }
  }

  /**
   * 保存加密数据
   */
  private async saveEncryptedData(): Promise<void> {
    try {
      const configDir = '.obsidian/plugins/translate-plugin';
      
      // 确保目录存在
      if (!(await this.app.vault.adapter.exists(configDir))) {
        await this.app.vault.adapter.mkdir(configDir);
      }
      
      await this.app.vault.adapter.write(
        `${configDir}/${CONFIG_KEYS.ENCRYPTED}.json`,
        JSON.stringify(this.encryptedData, null, 2)
      );
      
      this.logger.debug('Encrypted data saved successfully');
    } catch (error) {
      this.logger.error('Failed to save encrypted data', error);
      throw error;
    }
  }

  /**
   * 验证配置数据
   */
  private validateConfig(config: any): PluginSettings {
    // 基本结构验证
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config format');
    }
    
    // 使用默认配置作为基础，确保所有必需字段都存在
    const validatedConfig = this.mergeConfig(DEFAULT_CONFIG, config);
    
    // 验证枚举值
    if (validatedConfig.defaultTargetLang && 
        !Object.values(LanguageCode).includes(validatedConfig.defaultTargetLang)) {
      validatedConfig.defaultTargetLang = DEFAULT_CONFIG.defaultTargetLang;
    }
    
    if (validatedConfig.defaultTranslator && 
        !Object.values(TranslatorType).includes(validatedConfig.defaultTranslator)) {
      validatedConfig.defaultTranslator = DEFAULT_CONFIG.defaultTranslator;
    }
    
    return validatedConfig;
  }

  /**
   * 深度合并配置对象
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.mergeConfig(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * 通知配置变更
   */
  private notifyConfigChange(config: PluginSettings): void {
    this.configChangeListeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        this.logger.error('Error in config change listener', error);
      }
    });
  }

  /**
   * 启动备份定时器
   */
  private startBackupTimer(): void {
    // TODO: 添加backup配置到PluginSettings接口
    // if (!this.config.advanced.backupEnabled) {
    //   return;
    // }
    
    this.stopBackupTimer();
    
    // 默认每小时备份一次
    this.backupTimer = setInterval(() => {
      this.createBackup().catch(error => {
        this.logger.error('Scheduled backup failed', error);
      });
    }, 60 * 60 * 1000); // 1小时
    
    this.logger.info('Backup timer started');
  }

  /**
   * 停止备份定时器
   */
  private stopBackupTimer(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
      this.logger.info('Backup timer stopped');
    }
  }

  /**
   * 清理旧备份
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.getAvailableBackups();
      // TODO: 添加maxBackupCount配置到PluginSettings接口
      const maxBackupCount = 10; // 默认保留10个备份
      
      if (backups.length > maxBackupCount) {
        const backupsToDelete = backups.slice(maxBackupCount);
        
        for (const backup of backupsToDelete) {
          const backupPath = `.obsidian/plugins/translate-plugin/backups/${CONFIG_KEYS.BACKUP}-${backup.timestamp}.json`;
          await this.app.vault.adapter.remove(backupPath);
        }
        
        this.logger.info(`Cleaned up ${backupsToDelete.length} old backups`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old backups', error);
    }
  }
}