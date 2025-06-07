/**
 * Type declaration file for DOM operations in the MatterProductParser
 */

// Add DOM declarations for TypeScript
interface Document {
  querySelector(selectors: string): Element | null;
  querySelectorAll(selectors: string): NodeListOf<Element>;
  body: {
    textContent: string | null;
  };
}

interface Element {
  querySelector(selectors: string): Element | null;
  querySelectorAll(selectors: string): NodeListOf<Element>;
  textContent: string | null;
  parentElement: Element | null;
}

// Make document available globally
declare const document: Document;

// Type declarations for NodeList operations
interface NodeListOf<T> {
  length: number;
  item(index: number): T | null;
  forEach(callbackfn: (value: T, key: number, parent: NodeListOf<T>) => void): void;
  [index: number]: T;
}

// Used by Array.from
interface ArrayConstructor {
  from<T>(iterable: Iterable<T> | ArrayLike<T>): T[];
}
