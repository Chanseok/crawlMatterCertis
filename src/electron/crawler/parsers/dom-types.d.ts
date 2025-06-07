/**
 * Declaration file for DOM types used in MatterProductParser
 * This file helps TypeScript understand DOM operations in the Electron context
 */

// Add DOM types to the global namespace
declare global {
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

  interface NodeListOf<T extends Element> {
    length: number;
    item(index: number): T | null;
    forEach(callbackfn: (value: T, key: number, parent: NodeListOf<T>) => void, thisArg?: any): void;
    [index: number]: T;
  }

  var document: Document;
}

// This ensures this file is treated as a module
export {};
