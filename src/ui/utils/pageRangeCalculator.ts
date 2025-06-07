/**
 * pageRangeCalculator.ts
 * 페이지 범위 계산 및 관리를 위한 유틸리티
 * 
 * 책임:
 * - 설정 변경이 페이지 범위에 영향을 주는지 확인
 * - 페이지 범위 재계산
 * - 설정 변경 시 자동 재계산 처리
 */

import { crawlingStore } from '../stores/domain/CrawlingStore';
import { Logger } from '../../shared/utils/Logger';
import type { CrawlerConfig } from '../../../types';

const logger = Logger.getInstance();

/**
 * 페이지 범위 계산 결과 인터페이스
 */
export interface PageRangeInfo {
  totalPages: number;
  estimatedProducts: number;
  pageRangeStart: number;
  pageRangeEnd: number;
  actualCrawlPages: number;
  lastCalculated: Date;
}

/**
 * 설정 변경이 페이지 범위에 영향을 주는지 확인
 * @param changedField 변경된 설정 필드
 * @returns 페이지 범위에 영향을 주는 설정인지 여부
 */
export function doesSettingAffectPageRange(changedField: keyof CrawlerConfig): boolean {
  const pageRangeAffectingFields: (keyof CrawlerConfig)[] = [
    'pageRangeLimit',
    'productsPerPage'
  ];
  
  return pageRangeAffectingFields.includes(changedField);
}

/**
 * 현재 크롤링 상태 정보를 기반으로 페이지 범위를 재계산
 * 로컬 DB의 상태를 고려하여 스마트한 페이지 범위 계산 수행
 * @param config 현재 크롤러 설정
 * @returns 계산된 페이지 범위 정보 또는 null (상태 정보가 없는 경우)
 */
export function recalculatePageRange(config: CrawlerConfig): PageRangeInfo | null {
  try {
    const statusSummary = crawlingStore.statusSummary;
    
    console.log('[PageRangeCalculator] 🔍 recalculatePageRange called with:', {
      statusSummary,
      config: {
        pageRangeLimit: config?.pageRangeLimit,
        productsPerPage: config?.productsPerPage
      }
    });
    
    if (!statusSummary) {
      logger.warn('상태 정보가 없어 페이지 범위를 계산할 수 없습니다.');
      return null;
    }

    // statusSummary에서 실제 필드명 사용: siteTotalPages, siteProductCount
    const totalPages = statusSummary.siteTotalPages || statusSummary.totalPages;
    const totalProducts = statusSummary.siteProductCount || statusSummary.totalProducts;
    const dbProductCount = statusSummary.dbProductCount || 0;
    
    console.log('[PageRangeCalculator] 🔍 Status values:', {
      siteTotalPages: statusSummary.siteTotalPages,
      siteProductCount: statusSummary.siteProductCount,
      dbProductCount: statusSummary.dbProductCount,
      totalPages,
      totalProducts,
      pageRangeLimit: config.pageRangeLimit,
      productsPerPage: config.productsPerPage
    });
    
    console.log('[PageRangeCalculator] 🔍 Raw statusSummary object:', statusSummary);
    console.log('[PageRangeCalculator] 🔍 statusSummary keys:', Object.keys(statusSummary));
    console.log('[PageRangeCalculator] 🔍 dbProductCount value check:', {
      raw: statusSummary.dbProductCount,
      type: typeof statusSummary.dbProductCount,
      isUndefined: statusSummary.dbProductCount === undefined,
      isNull: statusSummary.dbProductCount === null,
      final: dbProductCount
    });
    
    if (!totalPages || totalPages === 0) {
      logger.warn('총 페이지 수가 0이므로 페이지 범위를 계산할 수 없습니다.');
      return null;
    }

    const productsPerPage = Number(config.productsPerPage) || 12;
    const pageRangeLimit = Number(config.pageRangeLimit) || totalPages;
    
    // 스마트 페이지 범위 계산 - PageIndexManager 로직 적용
    let pageRangeStart: number;
    let pageRangeEnd: number;
    let actualCrawlPages: number;
    
    console.log('[PageRangeCalculator] 🔍 DB product count check:', {
      dbProductCount,
      isZero: dbProductCount === 0,
      isUndefined: dbProductCount === undefined,
      isEmpty: !dbProductCount
    });
    
    if (!dbProductCount || dbProductCount === 0) {
      // 로컬 DB가 비어있는 경우: 마지막 페이지부터 시작
      console.log('[PageRangeCalculator] 🔍 DB가 비어있음. 마지막 페이지부터 시작');
      pageRangeStart = totalPages;
      pageRangeEnd = Math.max(1, totalPages - pageRangeLimit + 1);
      actualCrawlPages = pageRangeStart - pageRangeEnd + 1;
    } else {
      // 로컬 DB에 데이터가 있는 경우: 이미 수집된 페이지를 고려한 계산
      const collectedPages = Math.ceil(dbProductCount / productsPerPage);
      console.log('[PageRangeCalculator] 🔍 이미 수집된 페이지 수:', collectedPages);
      
      // 수집되지 않은 페이지 범위에서 시작
      pageRangeStart = Math.max(1, totalPages - collectedPages);
      
      // 사용자 설정 페이지 수에 따른 종료 페이지 결정
      const pagesToCollect = Math.min(pageRangeLimit, totalPages - collectedPages);
      pageRangeEnd = Math.max(1, pageRangeStart - pagesToCollect + 1);
      actualCrawlPages = pageRangeStart - pageRangeEnd + 1;
      
      console.log('[PageRangeCalculator] 🔍 추가 크롤링이 필요한 범위:', {
        collectedPages,
        remainingPages: totalPages - collectedPages,
        pagesToCollect,
        calculatedStart: pageRangeStart,
        calculatedEnd: pageRangeEnd
      });
    }
    
    // 예상 제품 수 계산
    const estimatedProducts = Math.min(
      totalProducts || 0,
      actualCrawlPages * productsPerPage
    );
    
    console.log('[PageRangeCalculator] 🔍 Calculated values:', {
      pageRangeStart,
      pageRangeEnd,
      actualCrawlPages,
      estimatedProducts,
      pageRangeLimit,
      productsPerPage,
      dbProductCount
    });

    const result: PageRangeInfo = {
      totalPages,
      estimatedProducts,
      pageRangeStart,
      pageRangeEnd,
      actualCrawlPages,
      lastCalculated: new Date()
    };

    logger.info(`페이지 범위 재계산 완료: ${result.actualCrawlPages}페이지 (${result.pageRangeStart}~${result.pageRangeEnd}), 예상 제품 ${result.estimatedProducts}개`);
    return result;
    
  } catch (error) {
    logger.error(`페이지 범위 계산 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 설정 변경 시 페이지 범위 재계산 처리
 * @param changedField 변경된 설정 필드
 * @param newConfig 새로운 설정
 * @returns 계산된 페이지 범위 정보 또는 null
 */
export function handleConfigChangeForPageRange(
  changedField: keyof CrawlerConfig,
  newConfig: CrawlerConfig
): PageRangeInfo | null {
  // 페이지 범위에 영향을 주는 설정인지 확인
  if (!doesSettingAffectPageRange(changedField)) {
    logger.debug(`설정 '${changedField}' 변경은 페이지 범위에 영향을 주지 않습니다.`);
    return null;
  }

  // 크롤링 중인지 확인
  if (crawlingStore.isRunning) {
    logger.debug('크롤링 중에는 페이지 범위를 재계산하지 않습니다.');
    return null;
  }

  logger.info(`설정 '${changedField}' 변경으로 인한 페이지 범위 재계산 시작`);
  return recalculatePageRange(newConfig);
}

/**
 * 현재 페이지 범위 정보를 가져옴
 * @param config 현재 크롤러 설정
 * @returns 현재 페이지 범위 정보 또는 null
 */
export function getCurrentPageRangeInfo(config: CrawlerConfig): PageRangeInfo | null {
  return recalculatePageRange(config);
}

/**
 * 페이지 범위 정보를 사용자 친화적인 문자열로 변환
 * @param pageRangeInfo 페이지 범위 정보
 * @returns 포맷된 문자열
 */
export function formatPageRangeInfo(pageRangeInfo: PageRangeInfo): string {
  const { pageRangeStart, pageRangeEnd, actualCrawlPages, estimatedProducts, totalPages } = pageRangeInfo;
  
  return `페이지 ${pageRangeStart}-${pageRangeEnd} (총 ${actualCrawlPages}페이지, 전체 ${totalPages}페이지 중) / 예상 제품: ${estimatedProducts}개`;
}
