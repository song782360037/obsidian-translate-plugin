import { ICryptoUtils } from '../interfaces';

/**
 * 加密工具类
 */
export class CryptoUtils implements ICryptoUtils {
  private readonly defaultKey = 'obsidian-translate-plugin';

  /**
   * 简单的XOR加密
   */
  encrypt(text: string, key?: string): string {
    const encryptionKey = key || this.defaultKey;
    let result = '';
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const keyChar = encryptionKey.charCodeAt(i % encryptionKey.length);
      result += String.fromCharCode(charCode ^ keyChar);
    }
    
    return this.base64Encode(result);
  }

  /**
   * 简单的XOR解密
   */
  decrypt(encryptedText: string, key?: string): string {
    try {
      const encryptionKey = key || this.defaultKey;
      const decodedText = this.base64Decode(encryptedText);
      let result = '';
      
      for (let i = 0; i < decodedText.length; i++) {
        const charCode = decodedText.charCodeAt(i);
        const keyChar = encryptionKey.charCodeAt(i % encryptionKey.length);
        result += String.fromCharCode(charCode ^ keyChar);
      }
      
      return result;
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  /**
   * 生成随机密钥
   */
  generateKey(length = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  /**
   * 计算简单哈希值
   */
  hash(text: string, algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256'): string {
    // 简单的哈希实现（生产环境建议使用crypto库）
    let hash = 0;
    
    if (text.length === 0) {
      return hash.toString();
    }
    
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Base64编码
   */
  base64Encode(text: string): string {
    try {
      return btoa(unescape(encodeURIComponent(text)));
    } catch (error) {
      console.error('Base64 encoding failed:', error);
      return text;
    }
  }

  /**
   * Base64解码
   */
  base64Decode(encodedText: string): string {
    try {
      return decodeURIComponent(escape(atob(encodedText)));
    } catch (error) {
      console.error('Base64 decoding failed:', error);
      return encodedText;
    }
  }

  /**
   * 生成UUID
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 安全比较字符串（防止时序攻击）
   */
  safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * 生成随机盐值
   */
  generateSalt(length = 16): string {
    const array = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      // 降级方案
      for (let i = 0; i < length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}