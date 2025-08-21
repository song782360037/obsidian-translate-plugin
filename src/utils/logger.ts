import { ILoggerUtils } from '../interfaces';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  level: LogLevel;
  maxEntries: number;
  enableConsole: boolean;
  enableStorage: boolean;
  prefix: string;
}

/**
 * 日志工具类
 */
export class LoggerUtils implements ILoggerUtils {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];
  private readonly storageKey = 'obsidian-translate-logs';

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      maxEntries: 1000,
      enableConsole: true,
      enableStorage: true,
      prefix: '[Translate Plugin]',
      ...config
    };

    // 从存储中加载历史日志
    this.loadLogsFromStorage();
  }

  /**
   * 记录调试信息
   */
  debug(message: string, data?: any, source?: string): void {
    this.log(LogLevel.DEBUG, message, data, source);
  }

  /**
   * 记录一般信息
   */
  info(message: string, data?: any, source?: string): void {
    this.log(LogLevel.INFO, message, data, source);
  }

  /**
   * 记录警告信息
   */
  warn(message: string, data?: any, source?: string): void {
    this.log(LogLevel.WARN, message, data, source);
  }

  /**
   * 记录错误信息
   */
  error(message: string, error?: any, source?: string): void {
    let errorData = error;
    
    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    this.log(LogLevel.ERROR, message, errorData, source);
  }

  /**
   * 核心日志记录方法
   */
  private log(level: LogLevel, message: string, data?: any, source?: string): void {
    // 检查日志级别
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      source
    };

    // 添加到内存日志
    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }

    // 输出到控制台
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // 保存到存储
    if (this.config.enableStorage) {
      this.saveLogsToStorage();
    }
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: LogEntry): void {
    const { timestamp, level, message, data, source } = entry;
    const prefix = this.config.prefix;
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const sourceStr = source ? `[${source}]` : '';
    const fullMessage = `${prefix} ${timeStr} ${sourceStr} ${message}`;
    
    // 格式化data为字符串，避免输出[object Object]
    let dataStr = '';
    if (data !== undefined && data !== null) {
      if (typeof data === 'string') {
        dataStr = data;
      } else if (typeof data === 'object') {
        try {
          dataStr = JSON.stringify(data, null, 2);
        } catch (error) {
          dataStr = String(data);
        }
      } else {
        dataStr = String(data);
      }
    }

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(fullMessage, dataStr);
        break;
      case LogLevel.INFO:
        console.info(fullMessage, dataStr);
        break;
      case LogLevel.WARN:
        console.warn(fullMessage, dataStr);
        break;
      case LogLevel.ERROR:
        console.error(fullMessage, dataStr);
        break;
    }
  }

  /**
   * 保存日志到存储
   */
  private saveLogsToStorage(): void {
    try {
      const recentLogs = this.logs.slice(-100); // 只保存最近100条
      localStorage.setItem(this.storageKey, JSON.stringify(recentLogs));
    } catch (error) {
      console.error('Failed to save logs to storage:', error);
    }
  }

  /**
   * 从存储加载日志
   */
  private loadLogsFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const logs = JSON.parse(stored) as LogEntry[];
        this.logs = Array.isArray(logs) ? logs : [];
      }
    } catch (error) {
      console.error('Failed to load logs from storage:', error);
      this.logs = [];
    }
  }

  /**
   * 获取所有日志
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level >= level);
    }
    return [...this.logs];
  }

  /**
   * 获取最近的日志
   */
  getRecentLogs(count = 50, level?: LogLevel): LogEntry[] {
    const logs = this.getLogs(level);
    return logs.slice(-count);
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.logs = [];
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear logs from storage:', error);
    }
  }

  /**
   * 清空日志（接口方法）
   */
  clear(): void {
    this.clearLogs();
  }

  /**
   * 获取日志历史（接口方法）
   */
  getHistory(): any[] {
    return this.getLogs();
  }

  /**
   * 设置日志级别
   */
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    const levelMap = {
      'debug': LogLevel.DEBUG,
      'info': LogLevel.INFO,
      'warn': LogLevel.WARN,
      'error': LogLevel.ERROR
    };
    this.config.level = levelMap[level];
    this.info(`Log level changed to ${level}`);
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * 导出日志
   */
  exportLogs(format: 'json' | 'text' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2);
    }

    return this.logs
      .map(entry => {
        const { timestamp, level, message, data, source } = entry;
        const timeStr = new Date(timestamp).toLocaleString();
        const levelStr = LogLevel[level].padEnd(5);
        const sourceStr = source ? `[${source}]` : '';
        const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
        return `${timeStr} ${levelStr} ${sourceStr} ${message}${dataStr}`;
      })
      .join('\n');
  }

  /**
   * 创建子日志器
   */
  createChild(source: string): ChildLogger {
    return new ChildLogger(this, source);
  }

  /**
   * 性能计时开始
   */
  time(label: string): void {
    console.time(`${this.config.prefix} ${label}`);
  }

  /**
   * 性能计时结束
   */
  timeEnd(label: string): void {
    console.timeEnd(`${this.config.prefix} ${label}`);
  }

  /**
   * 记录性能标记
   */
  mark(label: string, data?: any): void {
    this.debug(`Performance mark: ${label}`, data, 'Performance');
  }

  /**
   * 记录函数执行时间
   */
  async measureAsync<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed in ${duration.toFixed(2)}ms`, undefined, 'Performance');
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error, 'Performance');
      throw error;
    }
  }

  /**
   * 记录同步函数执行时间
   */
  measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed in ${duration.toFixed(2)}ms`, undefined, 'Performance');
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error, 'Performance');
      throw error;
    }
  }
}

/**
 * 子日志器类
 */
export class ChildLogger {
  constructor(
    private parent: LoggerUtils,
    private source: string
  ) {}

  debug(message: string, data?: any): void {
    this.parent.debug(message, data, this.source);
  }

  info(message: string, data?: any): void {
    this.parent.info(message, data, this.source);
  }

  warn(message: string, data?: any): void {
    this.parent.warn(message, data, this.source);
  }

  error(message: string, error?: any): void {
    this.parent.error(message, error, this.source);
  }

  time(label: string): void {
    this.parent.time(`${this.source}:${label}`);
  }

  timeEnd(label: string): void {
    this.parent.timeEnd(`${this.source}:${label}`);
  }

  async measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return this.parent.measureAsync(`${this.source}:${label}`, fn);
  }

  measure<T>(label: string, fn: () => T): T {
    return this.parent.measure(`${this.source}:${label}`, fn);
  }
}