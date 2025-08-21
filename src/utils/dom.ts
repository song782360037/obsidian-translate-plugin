import { SelectedText } from '../types';
import { IDOMUtils } from '../interfaces';

/**
 * DOM操作工具类
 */
export class DOMUtils implements IDOMUtils {
  /**
   * 获取当前选中的文本
   */
  getSelectedText(): SelectedText | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    
    if (!text) {
      return null;
    }

    // 获取选中文本的容器元素
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement 
      : container as HTMLElement;

    if (!element) {
      return null;
    }

    // 特殊处理设置页面的文本选择
     const isInSettings = element.closest('.modal-content') ||
                          element.closest('.workspace-leaf-content[data-type="settings"]') ||
                          element.closest('.setting-item');
    
    if (isInSettings) {
      // 尝试获取完整的设置项文本
      const settingItem = element.closest('.setting-item');
       if (settingItem) {
         // 如果选择的是设置项中的文本，优先使用完整的设置项文本
         const nameEl = settingItem.querySelector('.setting-item-name');
         const descEl = settingItem.querySelector('.setting-item-description');
         
         let fullText = '';
         if (nameEl?.textContent?.trim()) {
           fullText += nameEl.textContent.trim();
         }
         if (descEl?.textContent?.trim()) {
           if (fullText) fullText += '\n';
           fullText += descEl.textContent.trim();
         }
         
         // 如果选择的文本是设置项的一部分，返回完整的设置项文本
         if (fullText && (fullText.includes(text) || text.includes(fullText))) {
           return {
             text: fullText,
             element: settingItem as HTMLElement,
             range,
             rect: range.getBoundingClientRect()
           };
         }
       }
     }

    // 获取选中区域的边界矩形
    const rect = range.getBoundingClientRect();

    return {
      text,
      element,
      range: range.cloneRange(),
      rect
    };
  }

  /**
   * 查找包含指定文本的元素
   */
  findElementByText(text: string, container?: HTMLElement): HTMLElement | null {
    const searchContainer = container || document.body;
    const walker = document.createTreeWalker(
      searchContainer,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while (node = walker.nextNode()) {
      if (node.textContent && node.textContent.includes(text)) {
        return node.parentElement;
      }
    }

    return null;
  }

  /**
   * 安全地更新元素文本内容
   */
  updateElementText(element: HTMLElement, newText: string, preserveFormatting = false): void {
    if (!element) {
      return;
    }

    // 保存原始文本以便恢复
    if (!element.dataset.originalText) {
      element.dataset.originalText = element.textContent || '';
    }

    if (preserveFormatting) {
      // 保持格式，只替换文本节点
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node: Node | null;
      while (node = walker.nextNode()) {
        textNodes.push(node as Text);
      }

      if (textNodes.length === 1) {
        textNodes[0].textContent = newText;
      } else {
        // 多个文本节点，替换第一个，清空其他
        textNodes[0].textContent = newText;
        for (let i = 1; i < textNodes.length; i++) {
          textNodes[i].textContent = '';
        }
      }
    } else {
      // 直接替换文本内容
      element.textContent = newText;
    }
  }

  /**
   * 创建文本高亮
   */
  highlightText(element: HTMLElement, text: string, className: string): void {
    if (!element || !text) {
      return;
    }

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while (node = walker.nextNode()) {
      if (node.textContent && node.textContent.includes(text)) {
        textNodes.push(node as Text);
      }
    }

    textNodes.forEach(textNode => {
      const content = textNode.textContent || '';
      const index = content.indexOf(text);
      if (index !== -1) {
        const before = content.substring(0, index);
        const highlighted = content.substring(index, index + text.length);
        const after = content.substring(index + text.length);

        const fragment = document.createDocumentFragment();
        
        if (before) {
          fragment.appendChild(document.createTextNode(before));
        }

        const highlightSpan = document.createElement('span');
        highlightSpan.className = className;
        highlightSpan.textContent = highlighted;
        fragment.appendChild(highlightSpan);

        if (after) {
          fragment.appendChild(document.createTextNode(after));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });
  }

  /**
   * 移除文本高亮
   */
  removeHighlight(element: HTMLElement, className?: string): void {
    if (!element) {
      return;
    }

    const selector = className ? `.${className}` : '[class*="highlight"]';
    const highlightElements = element.querySelectorAll(selector);

    highlightElements.forEach(highlightEl => {
      const parent = highlightEl.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlightEl.textContent || ''), highlightEl);
        parent.normalize(); // 合并相邻的文本节点
      }
    });
  }

  /**
   * 获取元素的绝对位置
   */
  getElementPosition(element: HTMLElement): { x: number; y: number; width: number; height: number } {
    const rect = element.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    return {
      x: rect.left + scrollLeft,
      y: rect.top + scrollTop,
      width: rect.width,
      height: rect.height
    };
  }

  /**
   * 检查元素是否在视口内
   */
  isElementInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  /**
   * 滚动到指定元素
   */
  scrollToElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    element.scrollIntoView({
      behavior,
      block: 'center',
      inline: 'nearest'
    });
  }

  /**
   * 创建DOM元素
   */
  createElement(
    tagName: string, 
    attributes?: Record<string, string>, 
    children?: (HTMLElement | string)[]
  ): HTMLElement {
    const element = document.createElement(tagName);

    // 设置属性
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
          element.className = value;
        } else if (key === 'innerHTML') {
          element.innerHTML = value;
        } else {
          element.setAttribute(key, value);
        }
      });
    }

    // 添加子元素
    if (children) {
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      });
    }

    return element;
  }

  /**
   * 添加CSS样式
   */
  addStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(element.style, styles);
  }

  /**
   * 恢复元素的原始文本
   */
  restoreOriginalText(element: HTMLElement): void {
    const originalText = element.dataset.originalText;
    if (originalText !== undefined) {
      element.textContent = originalText;
      delete element.dataset.originalText;
    }
  }

  /**
   * 检查元素是否已被翻译
   */
  isElementTranslated(element: HTMLElement): boolean {
    return element.dataset.originalText !== undefined;
  }

  /**
   * 获取元素的所有文本内容（包括子元素）
   */
  getAllTextContent(element: HTMLElement): string {
    return element.textContent || '';
  }

  /**
   * 查找所有包含文本的元素
   */
  findAllTextElements(container: HTMLElement): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Node) => {
          const element = node as HTMLElement;
          // 排除脚本、样式等不需要翻译的元素
          const excludeTags = ['SCRIPT', 'STYLE', 'CODE', 'PRE'];
          if (excludeTags.includes(element.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // 只选择有直接文本内容的元素
          const hasDirectText = Array.from(element.childNodes).some(
            child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
          );
          
          return hasDirectText ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node: Node | null;
    while (node = walker.nextNode()) {
      elements.push(node as HTMLElement);
    }

    return elements;
  }
}