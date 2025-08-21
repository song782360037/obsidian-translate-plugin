/**
 * 核心类型定义
 */

// 翻译服务提供商枚举
export enum TranslatorType {
  OPENAI = 'openai',
  CUSTOM = 'custom'
}

// 语言代码枚举
export enum LanguageCode {
  AUTO = 'auto',
  ZH_CN = 'zh-CN',
  ZH_TW = 'zh-TW',
  EN = 'en',
  JA = 'ja',
  KO = 'ko',
  FR = 'fr',
  DE = 'de',
  ES = 'es',
  RU = 'ru',
  IT = 'it',
  PT = 'pt',
  AR = 'ar',
  TH = 'th',
  VI = 'vi',
  ID = 'id',
  MS = 'ms',
  NL = 'nl',
  PL = 'pl',
  TR = 'tr',
  SV = 'sv',
  DA = 'da',
  NO = 'no',
  FI = 'fi',
  CS = 'cs',
  HU = 'hu',
  RO = 'ro',
  BG = 'bg',
  HR = 'hr',
  SK = 'sk',
  SL = 'sl',
  ET = 'et',
  LV = 'lv',
  LT = 'lt',
  UK = 'uk',
  EL = 'el',
  HE = 'he',
  FA = 'fa',
  HI = 'hi',
  BN = 'bn',
  UR = 'ur',
  TA = 'ta',
  TE = 'te',
  ML = 'ml',
  KN = 'kn',
  GU = 'gu',
  PA = 'pa',
  MR = 'mr',
  NE = 'ne',
  SI = 'si',
  MY = 'my',
  KM = 'km',
  LO = 'lo',
  KA = 'ka',
  AM = 'am',
  SW = 'sw',
  ZU = 'zu',
  AF = 'af',
  SQ = 'sq',
  AZ = 'az',
  BE = 'be',
  BS = 'bs',
  EU = 'eu',
  CA = 'ca',
  CY = 'cy',
  EO = 'eo',
  GL = 'gl',
  IS = 'is',
  GA = 'ga',
  MT = 'mt',
  MK = 'mk',
  LA = 'la',
  MI = 'mi',
  SM = 'sm',
  SN = 'sn',
  ST = 'st',
  TL = 'tl',
  TO = 'to',
  XH = 'xh',
  YO = 'yo',
  HAW = 'haw',
  CEB = 'ceb',
  NY = 'ny',
  CO = 'co',
  FY = 'fy',
  GD = 'gd',
  HMN = 'hmn',
  LB = 'lb',
  PS = 'ps',
  SD = 'sd',
  UZ = 'uz',
  KK = 'kk',
  KY = 'ky',
  TG = 'tg',
  MN = 'mn',
  YI = 'yi'
}

// 翻译结果状态
export type TranslationStatus = 'pending' | 'success' | 'error' | 'cancelled';

// 显示模式
export type DisplayMode = 'popup' | 'sidebar' | 'inline' | 'replace';

// 翻译请求
export interface TranslationRequest {
  text: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  translator: TranslatorType;
  maxTokens?: number;
}

// 翻译响应
export interface TranslationResponse {
  originalText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  translator: TranslatorType;
  status: TranslationStatus;
  error?: string;
  timestamp: number;
}

// 翻译器配置
export interface TranslatorConfig {
  type: TranslatorType;
  name: string;
  enabled: boolean;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  retryCount?: number;
  customHeaders?: Record<string, string>;
}

// 插件设置
export interface PluginSettings {
  // 默认翻译器
  defaultTranslator: TranslatorType;
  // 默认目标语言
  defaultTargetLang: LanguageCode;
  // 默认显示模式
  defaultDisplayMode: DisplayMode;
  // 翻译器配置
  translators: Record<TranslatorType, TranslatorConfig>;
  // 快捷键
  hotkeys: {
    translate: string;
    translateAndReplace: string;
    showSidebar: string;
  };
  // 高级设置
  advanced: {
    enableCache: boolean;
    cacheExpiry: number;
    enableLogging: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    maxTokens: number;
  };
}

// 选择的文本信息
export interface SelectedText {
  text: string;
  element: HTMLElement;
  range: Range;
  rect: DOMRect;
}

// 菜单位置
export enum MenuPosition {
  CONTEXT_MENU = 'context-menu',
  COMMAND_PALETTE = 'command-palette',
  EDITOR_CONTEXT = 'editor-context',
  FILE_MENU = 'file-menu',
  STATUS_BAR = 'status-bar'
}

// 菜单项配置
export interface MenuItemConfig {
  id: string;
  title: string;
  icon?: string;
  action?: () => void;
  enabled?: boolean;
  visible?: boolean;
  hotkey?: string;
  submenu?: MenuItemConfig[];
  translatorType?: TranslatorType;
  targetLanguage?: LanguageCode;
}

// 菜单配置
export interface MenuConfig {
  id?: string;
  position: MenuPosition;
  items: MenuItemConfig[];
  enabled?: boolean;
}

// 错误类型
export interface TranslationError {
  code: string;
  message: string;
  details?: any;
  timestamp: number;
}

// 事件类型
export type PluginEvent = 
  | 'translation-started'
  | 'translation-completed'
  | 'translation-failed'
  | 'settings-changed'
  | 'translator-changed';

// 事件数据
export interface EventData {
  type: PluginEvent;
  data?: any;
  timestamp: number;
}

// 翻译历史记录
export interface TranslationHistory {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: LanguageCode;
  targetLang: LanguageCode;
  translator: TranslatorType;
  timestamp: number;
}

// 批量翻译进度
export interface BatchTranslationProgress {
  total: number;
  completed: number;
  failed: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled';
}