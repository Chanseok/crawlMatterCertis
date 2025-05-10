/**
 * @deprecated This module is deprecated and its functionality has been merged into
 * src/electron/ConfigManager.ts. Please use configManager.getConfig() from 
 * 'src/electron/ConfigManager.js' instead.
 * This file can be safely removed once all imports are updated.
 */
import { CrawlerConfig } from '../../../../types.js'; // Or resolve path from types.d.ts

// Re-export CrawlerConfig type for any remaining direct type usages during transition.
// It's recommended to import types directly from '.../../types.js' or the project's type definition file.
export type { CrawlerConfig };

console.warn(
  '[DEPRECATED] src/electron/crawler/core/config.ts is deprecated and should no longer be used. ' +
  'Its functionality has been consolidated into src/electron/ConfigManager.ts. ' +
  'Please update imports to use the global configManager instance.'
);

// All functional code (constants, defaultConfig, getConfig, updateCurrentConfig, resetToDefaultConfig, etc.)
// has been removed from this file.
//
// If your code was importing symbols like getConfig, defaultConfig, updateCurrentConfig, 
// or resetToDefaultConfig from this file, you need to refactor it:
//
// 1. Import the central configManager:
//    import { configManager } from '../../../ConfigManager.js'; // Adjust the relative path as necessary
//
// 2. Replace usages:
//    - Old: const cfg = getConfig();
//      New: const cfg = configManager.getConfig();
//
//    - Old: updateCurrentConfig(newValues);
//      New: configManager.updateConfig(newValues); // Note: updateConfig returns the new config
//
//    - Old: resetToDefaultConfig();
//      New: configManager.resetConfig(); // Note: resetConfig returns the new config
//
//    - Old: Direct use of defaultConfig from this file.
//      New: Access specific default values if needed via configManager.getConfig() after a reset,
//           or by understanding that configManager now handles all defaults internally.
//
// This file is now effectively empty of runtime logic to prevent accidental use
// and to encourage migration to the centralized ConfigManager.