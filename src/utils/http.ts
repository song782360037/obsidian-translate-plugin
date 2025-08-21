import { IHttpUtils } from '../interfaces';

/**
 * HTTP请求配置接口
 */
export interface HttpRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  validateStatus?: (status: number) => boolean;
}

/**
 * HTTP响应接口
 */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * HTTP错误类
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * 网络请求工具类
 */
export class HttpUtils implements IHttpUtils {
  private readonly defaultTimeout = 30000; // 30秒
  private readonly defaultRetries = 3;
  private readonly defaultRetryDelay = 1000; // 1秒
  private defaultHeaders: Record<string, string> = {};
  private currentTimeout = this.defaultTimeout;
  private activeRequests = new Map<string, AbortController>();

  /**
   * 发送HTTP请求
   */
  async request<T = any>(
    url: string,
    config: HttpRequestConfig = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.currentTimeout,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      validateStatus = (status) => status >= 200 && status < 300
    } = config;

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const requestInit: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...this.defaultHeaders,
            ...headers
          },
          signal: controller.signal
        };

        if (body && method !== 'GET') {
          requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(url, requestInit);
        clearTimeout(timeoutId);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let responseData: T;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text() as any;
        }

        if (!validateStatus(response.status)) {
          throw new HttpError(
            `Request failed with status ${response.status}: ${response.statusText}`,
            response.status,
            responseData
          );
        }

        return {
          data: responseData,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        };

      } catch (error) {
        lastError = error as Error;
        
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === retries) {
          break;
        }

        // 如果是网络错误或超时，进行重试
        if (this.shouldRetry(error as Error)) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // 指数退避
          continue;
        }

        // 其他错误直接抛出
        throw error;
      }
    }

    throw lastError!;
  }

  /**
   * GET请求
   */
  async get<T = any>(
    url: string,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  /**
   * POST请求
   */
  async post<T = any>(
    url: string,
    data?: any,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'POST', body: data });
  }

  /**
   * PUT请求
   */
  async put<T = any>(
    url: string,
    data?: any,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PUT', body: data });
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(
    url: string,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }

  /**
   * 上传文件
   */
  async upload<T = any>(
    url: string,
    file: File | Blob,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<HttpResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    const uploadConfig = {
      ...config,
      headers: {
        ...config.headers
        // 不设置Content-Type，让浏览器自动设置multipart/form-data边界
      }
    };

    return this.request<T>(url, {
      ...uploadConfig,
      method: 'POST',
      body: formData
    });
  }

  /**
   * 下载文件
   */
  async download(
    url: string,
    config: Omit<HttpRequestConfig, 'method' | 'body'> = {}
  ): Promise<Blob> {
    const response = await this.request<ArrayBuffer>(url, {
      ...config,
      method: 'GET'
    });

    return new Blob([response.data]);
  }

  /**
   * 检查网络连接
   */
  async checkConnection(url = 'https://www.google.com'): Promise<boolean> {
    try {
      await this.get(url, {
        timeout: 5000,
        retries: 0
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 批量请求
   */
  async batch<T = any>(
    requests: Array<{ url: string; config?: HttpRequestConfig }>
  ): Promise<Array<HttpResponse<T> | Error>> {
    const promises = requests.map(({ url, config }) => 
      this.request<T>(url, config).catch(error => error)
    );

    return Promise.all(promises);
  }

  /**
   * 创建请求拦截器
   */
  createInterceptor({
    request,
    response,
    error
  }: {
    request?: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>;
    response?: <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>;
    error?: (error: Error) => Error | Promise<Error>;
  }) {
    return {
      request: request || ((config) => config),
      response: response || ((response) => response),
      error: error || ((error) => error)
    };
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    // 网络错误
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }

    // 超时错误
    if (error.name === 'AbortError') {
      return true;
    }

    // HTTP错误
    if (error instanceof HttpError) {
      // 5xx服务器错误可以重试
      return error.status ? error.status >= 500 : false;
    }

    return false;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 构建查询字符串
   */
  buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    });

    return searchParams.toString();
  }

  /**
   * 解析URL
   */
  parseUrl(url: string): {
    protocol: string;
    host: string;
    pathname: string;
    search: string;
    hash: string;
  } {
    try {
      const urlObj = new URL(url);
      return {
        protocol: urlObj.protocol,
        host: urlObj.host,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash
      };
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * 设置默认请求头
   */
  setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * 设置默认超时时间
   */
  setDefaultTimeout(timeout: number): void {
    this.currentTimeout = timeout;
  }

  /**
   * 取消请求
   */
  cancelRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * 检查网络连接状态
   */
  async checkNetworkStatus(): Promise<boolean> {
    return this.checkConnection();
  }
}