// 工具层统一导出
export { DOMUtils } from './dom';
export { CryptoUtils } from './crypto';
export { ValidationUtils } from './validation';
export { HttpUtils, HttpError, type HttpRequestConfig, type HttpResponse } from './http';
export { LoggerUtils, ChildLogger, type LogEntry, type LoggerConfig } from './logger';

// 导入工具类用于实例化
import { DOMUtils } from './dom';
import { CryptoUtils } from './crypto';
import { ValidationUtils } from './validation';
import { HttpUtils } from './http';
import { LoggerUtils } from './logger';

// 创建工具实例的工厂函数
export const createUtils = () => {
  return {
    dom: new DOMUtils(),
    crypto: new CryptoUtils(),
    validation: new ValidationUtils(),
    http: new HttpUtils(),
    logger: new LoggerUtils()
  };
};

// 默认工具实例
export const utils = createUtils();