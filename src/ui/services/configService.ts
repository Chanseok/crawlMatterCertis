import type { CrawlerConfig } from '../../types.js';

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
    // If success is false, or config is missing, throw an error.
    // The main process (ConfigManager) guarantees a valid config object (loaded or default).
    const errorMessage = response.error || '설정을 가져오는데 실패했습니다. 응답 형식이 올바르지 않습니다.';
    console.error('설정을 가져오는 중 오류 발생 (IPC):', errorMessage);
    throw new Error(errorMessage);
  } catch (error) {
    // Log the error if it's not already logged by the above specific check
    if (!(error instanceof Error && error.message.startsWith('설정을 가져오는 중 오류 발생 (IPC):'))) {
        console.error('설정을 가져오는 중 예기치 않은 오류 발생:', error);
    }
    // Re-throw the original error or a new one
    throw error instanceof Error ? error : new Error(String(error));
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