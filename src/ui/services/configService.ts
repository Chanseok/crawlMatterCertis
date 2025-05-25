/**
 * @deprecated This module is deprecated and its functionality has been moved to
 * ConfigurationService in src/ui/services/domain/ConfigurationService.ts.
 * Please use serviceFactory.getConfigurationService() instead.
 * 
 * This file will be removed in a future release once all dependencies are migrated.
 */

// Import from the root types directly
import type { CrawlerConfig } from '../../../types';

console.warn(
  '[DEPRECATED] src/ui/services/configService.ts is deprecated and should no longer be used. ' +
  'Its functionality has been replaced by ConfigurationService. ' +
  'Please update imports to use serviceFactory.getConfigurationService().'
);

/**
 * @deprecated 설정 관련 서비스 - Use ConfigurationService instead
 * - 크롤링 설정 가져오기/업데이트/초기화 기능 제공
 */

/**
 * @deprecated 현재 설정을 가져옵니다. Use ConfigurationService.getConfig() instead.
 */
export async function getConfig(): Promise<CrawlerConfig> {
  console.warn('[DEPRECATED] getConfig() is deprecated. Use serviceFactory.getConfigurationService().getConfig() instead.');
  throw new Error('This function has been deprecated. Please use ConfigurationService instead.');
}

/**
 * @deprecated 설정을 업데이트합니다. Use ConfigurationService.updateConfig() instead.
 */
export async function updateConfig(_config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
  console.warn('[DEPRECATED] updateConfig() is deprecated. Use serviceFactory.getConfigurationService().updateConfig() instead.');
  throw new Error('This function has been deprecated. Please use ConfigurationService instead.');
}

/**
 * @deprecated 설정을 초기화합니다. Use ConfigurationService.resetConfig() instead.
 */
export async function resetConfig(): Promise<CrawlerConfig> {
  console.warn('[DEPRECATED] resetConfig() is deprecated. Use serviceFactory.getConfigurationService().resetConfig() instead.');
  throw new Error('This function has been deprecated. Please use ConfigurationService instead.');
}