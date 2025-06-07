/**
 * Mock Electron Module
 * 
 * This module provides mock implementations of Electron APIs for testing
 * outside of the Electron environment.
 */

// Mock app object
const app = {
  getPath: (pathName) => {
    if (pathName === 'userData') {
      return './mock-user-data';
    }
    return './mock-path';
  },
  getName: () => 'MockElectronApp',
  getVersion: () => '1.0.0-mock',
};

// Mock BrowserWindow
class BrowserWindow {
  constructor(options) {
    this.options = options;
    this.isVisible = false;
    this.isDestroyed = false;
    this.webContents = {
      send: (channel, ...args) => {
        console.log(`[Mock BrowserWindow] Channel: ${channel}, Args:`, args);
      },
    };
  }

  loadURL(url) {
    console.log(`[Mock BrowserWindow] Loading URL: ${url}`);
    return Promise.resolve();
  }

  show() {
    this.isVisible = true;
  }

  hide() {
    this.isVisible = false;
  }

  destroy() {
    this.isDestroyed = true;
  }
}

// Mock ipcMain
const ipcMain = {
  on: (channel, listener) => {
    console.log(`[Mock ipcMain] Registered listener for channel: ${channel}`);
  },
  handle: (channel, handler) => {
    console.log(`[Mock ipcMain] Registered handler for channel: ${channel}`);
  },
  removeAllListeners: (channel) => {
    console.log(`[Mock ipcMain] Removed all listeners for channel: ${channel}`);
  },
};

// Mock dialog
const dialog = {
  showOpenDialog: (options) => {
    console.log('[Mock dialog] showOpenDialog called with options:', options);
    return Promise.resolve({ canceled: false, filePaths: ['./mock-selected-file.json'] });
  },
  showSaveDialog: (options) => {
    console.log('[Mock dialog] showSaveDialog called with options:', options);
    return Promise.resolve({ canceled: false, filePath: './mock-save-file.json' });
  },
};

// Export the mock objects
export default {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
};

// Also provide named exports for ESM imports
export {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
};
