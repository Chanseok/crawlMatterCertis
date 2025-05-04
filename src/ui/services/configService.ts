import type { CrawlerConfig } from '../../../types';

/**
 * 설정 관련 서비스
 * - 크롤링 설정 가져오기/업데이트/초기화 기능 제공
 */

/**
 * 현재 설정을 가져옵니다.
 */
export async function getConfig(): Promise<CrawlerConfig> {
  try {
    const response = await window.electron.getConfig();
    if (response.success && response.config) {
      return response.config;
    }
    throw new Error('설정을 가져오는데 실패했습니다.');
  } catch (error) {
    console.error('설정을 가져오는 중 오류 발생:', error);
    // 기본값 반환
    return {
      pageRangeLimit: 10,
      productListRetryCount: 9,
      productDetailRetryCount: 9,
      productsPerPage: 12  // 필수 필드 추가
    };
  }
}

/**
 * 설정을 업데이트합니다.
 */
export async function updateConfig(config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
  try {
    const response = await window.electron.updateConfig(config);
    if (response.success && response.config) {
      return response.config;
    }
    throw new Error('설정을 업데이트하는데 실패했습니다.');
  } catch (error) {
    console.error('설정을 업데이트하는 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 설정을 초기화합니다.
 */
export async function resetConfig(): Promise<CrawlerConfig> {
  try {
    const response = await window.electron.resetConfig();
    if (response.success && response.config) {
      return response.config;
    }
    throw new Error('설정을 초기화하는데 실패했습니다.');
  } catch (error) {
    console.error('설정을 초기화하는 중 오류 발생:', error);
    throw error;
  }
}