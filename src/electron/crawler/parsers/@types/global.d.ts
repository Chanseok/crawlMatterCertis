/**
 * Type definitions for document and DOM elements used in the MatterProductParser
 */

// Ensure this is treated as a module
export {};

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
    forEach(callbackfn: (value: T, key: number, parent: NodeListOf<T>) => void): void;
    item(index: number): T | null;
    [index: number]: T;
  }

  var document: Document;

  interface ArrayConstructor {
    from<T>(arrayLike: ArrayLike<T>): T[];
  }
}
