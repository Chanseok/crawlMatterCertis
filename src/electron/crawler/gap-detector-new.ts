/**
 * gap-detector.ts
 * 누락된 제품 탐지 및 수집을 위한 갭 분석 시스템
 */

import { getDatabaseSummaryFromDb } from "../database.js";
import { configManager } from "../ConfigManager.js";
import { logger } from "../../shared/utils/Logger.js";
import type { CrawlerConfig } from "../../../types.js";
import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';
import { AxiosCrawlerStrategy } from './strategies/axios-crawler.js';

// SQLite 데이터베이스 초기화 - 앱 사용자 데이터 경로 사용
const dbPath = path.join(app.getPath('userData'), 'dev-database.sqlite');
const db = new sqlite3.Database(dbPath);

/**
 * 페이지별 갭 정보
 */
export interface PageGap {
  pageId: number;
  missingIndices: number[];
  expectedCount: number;
  actualCount: number;
  completenessRatio: number; // 0.0 ~ 1.0
}

/**
 * 크롤링 페이지 범위 정보
 */
export interface CrawlingPageRange {
  startPage: number; // 사이트 페이지 번호 시작
  endPage: number;   // 사이트 페이지 번호 끝
  missingPageIds: number[]; // 이 범위에 포함된 누락 pageId들
  reason: string; // 이 범위가 생성된 이유
  priority: number; // 우선순위 (1: 높음, 2: 보통, 3: 낮음)
  estimatedProducts: number; // 예상 수집 제품 수
}

/**
 * 갭 탐지 결과 (확장됨)
 */
export interface GapDetectionResult {
  totalMissingProducts: number;
  missingPages: PageGap[];
  completelyMissingPageIds: number[];
  partiallyMissingPageIds: number[];
  summary: {
    totalExpectedProducts: number;
    totalActualProducts: number;
    completionPercentage: number;
  };
  // 새로 추가: 크롤링 범위 정보
  crawlingRanges: CrawlingPageRange[];
  totalSitePages: number; // 사이트의 총 페이지 수
  batchInfo: {
    totalBatches: number; // 총 배치 수
    estimatedTime: number; // 예상 소요 시간 (분)
    recommendedConcurrency: number; // 권장 동시 실행 수
  };
}

/**
 * 갭 탐지 및 분석을 위한 유틸리티 클래스
 */
export class GapDetector {
  
  /**
   * 데이터베이스에서 누락된 제품을 탐지합니다
   * @param providedConfig 설정 객체 (선택적)
   * @returns 갭 탐지 결과
   */
  public static async detectMissingProducts(providedConfig?: CrawlerConfig): Promise<GapDetectionResult> {
    const config = providedConfig || configManager.getConfig();
    const productsPerPage = config.productsPerPage || 12;
    
    try {
      // 1. 데이터베이스 요약 정보 가져오기
      const dbSummary = await getDatabaseSummaryFromDb();
      logger.info(`[GapDetector] 현재 DB 제품 수: ${dbSummary.productCount}`);
      
      // 2. 최대 pageId 계산
      const maxPageId = await this.getMaxPageId();
      logger.info(`[GapDetector] 최대 pageId: ${maxPageId}`);
      
      // 3. 사이트의 총 페이지 수 가져오기
      const totalSitePages = await this.getTotalSitePages();
      logger.info(`[GapDetector] 사이트 총 페이지 수: ${totalSitePages}`);
      
      // 4. 각 페이지별 제품 수 집계
      const pageProductCounts = await this.getProductCountsByPage();
      
      // 5. 누락 분석
      const missingPages: PageGap[] = [];
      const completelyMissingPageIds: number[] = [];
      const partiallyMissingPageIds: number[] = [];
      let totalMissingProducts = 0;
      let totalExpectedProducts = 0;
      
      // 0부터 maxPageId까지 모든 페이지 검사
      for (let pageId = 0; pageId <= maxPageId; pageId++) {
        const actualCount = pageProductCounts.get(pageId) || 0;
        const expectedCount = productsPerPage; // 모든 페이지는 12개 제품 예상
        const completenessRatio = expectedCount > 0 ? actualCount / expectedCount : 1.0;
        
        totalExpectedProducts += expectedCount;
        
        if (actualCount === 0) {
          // 완전히 누락된 페이지
          completelyMissingPageIds.push(pageId);
          totalMissingProducts += expectedCount;
          
          missingPages.push({
            pageId,
            missingIndices: Array.from({ length: expectedCount }, (_, i) => i),
            expectedCount,
            actualCount: 0,
            completenessRatio: 0.0
          });
        } else if (actualCount < expectedCount) {
          // 부분적으로 누락된 페이지
          partiallyMissingPageIds.push(pageId);
          const missingCount = expectedCount - actualCount;
          totalMissingProducts += missingCount;
          
          // 실제 존재하는 인덱스 찾기
          const existingIndices = await this.getExistingIndicesForPage(pageId);
          const missingIndices = Array.from({ length: expectedCount }, (_, i) => i)
            .filter(i => !existingIndices.has(i));
          
          missingPages.push({
            pageId,
            missingIndices,
            expectedCount,
            actualCount,
            completenessRatio
          });
        }
      }
      
      // 6. 크롤링 범위 생성
      const allMissingPageIds = [...completelyMissingPageIds, ...partiallyMissingPageIds];
      const crawlingRanges = await this.generateCrawlingRanges(allMissingPageIds, totalSitePages);
      
      // 7. 배치 정보 생성
      const batchInfo = this.generateBatchInfo(crawlingRanges);
      
      const completionPercentage = totalExpectedProducts > 0 
        ? ((totalExpectedProducts - totalMissingProducts) / totalExpectedProducts) * 100 
        : 100;
      
      const result: GapDetectionResult = {
        totalMissingProducts,
        missingPages,
        completelyMissingPageIds,
        partiallyMissingPageIds,
        summary: {
          totalExpectedProducts,
          totalActualProducts: totalExpectedProducts - totalMissingProducts,
          completionPercentage
        },
        crawlingRanges,
        totalSitePages,
        batchInfo
      };
      
      // 결과 로깅
      logger.info(`[GapDetector] 갭 탐지 완료:`);
      logger.info(`  - 총 누락 제품 수: ${totalMissingProducts}`);
      logger.info(`  - 완전히 누락된 pageId: ${completelyMissingPageIds.length}개`);
      logger.info(`  - 부분적으로 누락된 pageId: ${partiallyMissingPageIds.length}개`);
      logger.info(`  - 크롤링 범위: ${crawlingRanges.length}개 범위`);
      logger.info(`  - 예상 배치 수: ${batchInfo.totalBatches}개`);
      logger.info(`  - 예상 소요 시간: ${batchInfo.estimatedTime}분`);
      logger.info(`  - 수집 완료율: ${completionPercentage.toFixed(2)}%`);
      
      return result;
      
    } catch (error) {
      logger.error("[GapDetector] 갭 탐지 중 오류 발생", "GapDetector", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 특정 pageId 범위의 누락된 제품만 탐지
   * @param startPageId 시작 페이지 ID
   * @param endPageId 종료 페이지 ID
   * @param providedConfig 설정 객체 (선택적)
   * @returns 범위 내 갭 탐지 결과
   */
  public static async detectMissingProductsInRange(
    startPageId: number, 
    endPageId: number,
    providedConfig?: CrawlerConfig
  ): Promise<GapDetectionResult> {
    const config = providedConfig || configManager.getConfig();
    const productsPerPage = config.productsPerPage || 12;
    
    try {
      const missingPages: PageGap[] = [];
      const completelyMissingPageIds: number[] = [];
      const partiallyMissingPageIds: number[] = [];
      let totalMissingProducts = 0;
      let totalExpectedProducts = 0;
      
      // 범위 내 각 페이지 검사
      for (let pageId = startPageId; pageId <= endPageId; pageId++) {
        const actualCount = await this.getProductCountForPage(pageId);
        const expectedCount = productsPerPage;
        
        totalExpectedProducts += expectedCount;
        
        if (actualCount === 0) {
          completelyMissingPageIds.push(pageId);
          totalMissingProducts += expectedCount;
          
          missingPages.push({
            pageId,
            missingIndices: Array.from({ length: expectedCount }, (_, i) => i),
            expectedCount,
            actualCount: 0,
            completenessRatio: 0.0
          });
        } else if (actualCount < expectedCount) {
          partiallyMissingPageIds.push(pageId);
          const missingCount = expectedCount - actualCount;
          totalMissingProducts += missingCount;
          
          const existingIndices = await this.getExistingIndicesForPage(pageId);
          const missingIndices = Array.from({ length: expectedCount }, (_, i) => i)
            .filter(i => !existingIndices.has(i));
          
          const completenessRatio = expectedCount > 0 ? actualCount / expectedCount : 1.0;
          
          missingPages.push({
            pageId,
            missingIndices,
            expectedCount,
            actualCount,
            completenessRatio
          });
        }
      }
      
      // 사이트의 총 페이지 수 가져오기
      const totalSitePages = await this.getTotalSitePages();
      
      // 크롤링 범위 생성
      const allMissingPageIds = [...completelyMissingPageIds, ...partiallyMissingPageIds];
      const crawlingRanges = await this.generateCrawlingRanges(allMissingPageIds, totalSitePages);
      
      // 배치 정보 생성
      const batchInfo = this.generateBatchInfo(crawlingRanges);
      
      const completionPercentage = totalExpectedProducts > 0 
        ? ((totalExpectedProducts - totalMissingProducts) / totalExpectedProducts) * 100 
        : 100;
      
      return {
        totalMissingProducts,
        missingPages,
        completelyMissingPageIds,
        partiallyMissingPageIds,
        summary: {
          totalExpectedProducts,
          totalActualProducts: totalExpectedProducts - totalMissingProducts,
          completionPercentage
        },
        crawlingRanges,
        totalSitePages,
        batchInfo
      };
      
    } catch (error) {
      logger.error(`[GapDetector] 범위 ${startPageId}-${endPageId} 갭 탐지 중 오류`, "GapDetector", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 갭 탐지 결과를 상세히 출력
   * @param result 갭 탐지 결과
   */
  public static printGapReport(result: GapDetectionResult): void {
    console.log('\n==================== 제품 수집 갭 분석 보고서 ====================');
    console.log(`총 누락 제품 수: ${result.totalMissingProducts}개`);
    console.log(`수집 완료율: ${result.summary.completionPercentage.toFixed(2)}%`);
    console.log(`예상 총 제품 수: ${result.summary.totalExpectedProducts}개`);
    console.log(`실제 수집 제품 수: ${result.summary.totalActualProducts}개`);
    
    if (result.completelyMissingPageIds.length > 0) {
      console.log(`\n완전히 누락된 페이지 (${result.completelyMissingPageIds.length}개):`);
      console.log(`  PageID: ${result.completelyMissingPageIds.join(', ')}`);
    }
    
    if (result.partiallyMissingPageIds.length > 0) {
      console.log(`\n부분적으로 누락된 페이지 (${result.partiallyMissingPageIds.length}개):`);
      result.missingPages
        .filter(page => page.actualCount > 0)
        .forEach(page => {
          console.log(`  PageID ${page.pageId}: ${page.actualCount}/${page.expectedCount} 수집됨, 누락 인덱스: [${page.missingIndices.join(', ')}]`);
        });
    }
    
    if (result.crawlingRanges.length > 0) {
      console.log(`\n크롤링 범위 정보 (${result.crawlingRanges.length}개 범위):`);
      result.crawlingRanges.forEach((range, index) => {
        console.log(`  범위 ${index + 1}: 사이트 페이지 ${range.startPage}-${range.endPage} (우선순위: ${range.priority}, ${range.reason})`);
        console.log(`    누락 pageId: [${range.missingPageIds.join(', ')}], 예상 수집: ${range.estimatedProducts}개`);
      });
    }
    
    console.log(`\n배치 처리 정보:`);
    console.log(`  총 배치 수: ${result.batchInfo.totalBatches}개`);
    console.log(`  예상 소요 시간: ${result.batchInfo.estimatedTime}분`);
    console.log(`  권장 동시 실행 수: ${result.batchInfo.recommendedConcurrency}개`);
    
    console.log('================================================================\n');
  }
  
  /**
   * 사이트의 총 페이지 수를 가져옵니다
   * AxiosCrawlerStrategy를 사용하여 실제 사이트에서 총 페이지 수를 확인
   */
  private static async getTotalSitePages(): Promise<number> {
    try {
      const config = configManager.getConfig();
      const axiosCrawler = new AxiosCrawlerStrategy(config);
      
      // 총 페이지 수 가져오기
      const sitePageInfo = await axiosCrawler.fetchTotalPages();
      const totalPages = sitePageInfo.totalPages;
      
      logger.info(`[GapDetector] 사이트 총 페이지 수: ${totalPages}`, "GapDetector");
      return totalPages;
    } catch (error) {
      logger.warn(`[GapDetector] 사이트 총 페이지 수 확인 실패, 기본값 사용: ${error}`, "GapDetector");
      // 실패 시 데이터베이스의 최대 pageId를 기준으로 추정
      const maxPageId = await this.getMaxPageId();
      return maxPageId + 50; // 여유분 추가
    }
  }

  /**
   * 크롤링 범위 생성
   * 누락된 pageId들을 기반으로 연속적인 사이트 페이지 범위를 생성하고,
   * 각 누락 pageId 주변의 인접 페이지들도 포함시킵니다.
   */
  private static async generateCrawlingRanges(
    missingPageIds: number[],
    totalSitePages: number
  ): Promise<CrawlingPageRange[]> {
    if (missingPageIds.length === 0) {
      return [];
    }

    // pageId를 사이트 페이지 번호로 변환하는 맵핑
    const pageIdToSitePageMap = new Map<number, number>();
    for (const pageId of missingPageIds) {
      const sitePage = totalSitePages - pageId + 1; // 수정된 공식 적용
      if (sitePage >= 1 && sitePage <= totalSitePages) {
        pageIdToSitePageMap.set(pageId, sitePage);
      }
    }

    // 사이트 페이지 번호로 정렬
    const sortedSitePages = Array.from(pageIdToSitePageMap.values()).sort((a, b) => a - b);
    
    if (sortedSitePages.length === 0) {
      logger.warn("[GapDetector] 유효한 사이트 페이지 번호가 없습니다", "GapDetector");
      return [];
    }

    const ranges: CrawlingPageRange[] = [];
    let currentStart = sortedSitePages[0];
    let currentEnd = sortedSitePages[0];
    let currentMissingPageIds: number[] = [];

    // 현재 범위에 포함된 누락 pageId들 찾기
    const findMissingPageIdsInRange = (startPage: number, endPage: number): number[] => {
      const result: number[] = [];
      for (const [pageId, sitePage] of pageIdToSitePageMap.entries()) {
        if (sitePage >= startPage && sitePage <= endPage) {
          result.push(pageId);
        }
      }
      return result.sort((a, b) => a - b);
    };

    for (let i = 0; i < sortedSitePages.length; i++) {
      const currentPage = sortedSitePages[i];
      
      // 연속적인 페이지인지 확인 (간격이 3 이하면 연속으로 처리)
      if (currentPage <= currentEnd + 3) {
        currentEnd = Math.max(currentEnd, currentPage);
      } else {
        // 이전 범위 완료 - 인접 페이지 포함하여 범위 추가
        const expandedStart = Math.max(1, currentStart - 1);
        const expandedEnd = Math.min(totalSitePages, currentEnd + 1);
        currentMissingPageIds = findMissingPageIdsInRange(expandedStart, expandedEnd);
        
        const reason = this.generateRangeReason(currentMissingPageIds, pageIdToSitePageMap);
        const priority = this.calculateRangePriority(currentMissingPageIds);
        const estimatedProducts = this.estimateProductsInRange(expandedStart, expandedEnd);

        ranges.push({
          startPage: expandedStart,
          endPage: expandedEnd,
          missingPageIds: currentMissingPageIds,
          reason,
          priority,
          estimatedProducts
        });

        // 새 범위 시작
        currentStart = currentPage;
        currentEnd = currentPage;
      }
    }

    // 마지막 범위 추가
    const expandedStart = Math.max(1, currentStart - 1);
    const expandedEnd = Math.min(totalSitePages, currentEnd + 1);
    currentMissingPageIds = findMissingPageIdsInRange(expandedStart, expandedEnd);
    
    const reason = this.generateRangeReason(currentMissingPageIds, pageIdToSitePageMap);
    const priority = this.calculateRangePriority(currentMissingPageIds);
    const estimatedProducts = this.estimateProductsInRange(expandedStart, expandedEnd);

    ranges.push({
      startPage: expandedStart,
      endPage: expandedEnd,
      missingPageIds: currentMissingPageIds,
      reason,
      priority,
      estimatedProducts
    });

    // 우선순위별로 정렬 (1: 높음이 먼저)
    ranges.sort((a, b) => a.priority - b.priority);

    logger.info(`[GapDetector] 생성된 크롤링 범위: ${ranges.length}개`, "GapDetector");
    ranges.forEach((range, index) => {
      logger.debug(`  범위 ${index + 1}: 사이트 페이지 ${range.startPage}-${range.endPage} (우선순위: ${range.priority}, ${range.reason})`, "GapDetector");
    });

    return ranges;
  }

  /**
   * 범위 생성 이유 텍스트 생성
   */
  private static generateRangeReason(missingPageIds: number[], pageIdToSitePageMap: Map<number, number>): string {
    if (missingPageIds.length === 0) {
      return "주변 페이지 포함";
    }

    const sitePages = missingPageIds
      .map(pageId => pageIdToSitePageMap.get(pageId))
      .filter(page => page !== undefined)
      .sort((a, b) => a! - b!);

    if (sitePages.length === 1) {
      return `pageId ${missingPageIds[0]} 주변`;
    } else if (sitePages.length <= 3) {
      return `pageId ${missingPageIds.sort((a, b) => a - b).join(', ')} 주변`;
    } else {
      return `${missingPageIds.length}개 누락 pageId 포함`;
    }
  }

  /**
   * 범위의 우선순위 계산
   */
  private static calculateRangePriority(missingPageIds: number[]): number {
    if (missingPageIds.length === 0) {
      return 3; // 낮음 (주변 페이지만)
    } else if (missingPageIds.length >= 5) {
      return 1; // 높음 (많은 누락)
    } else {
      return 2; // 보통
    }
  }

  /**
   * 범위 내 예상 제품 수 계산
   */
  private static estimateProductsInRange(startPage: number, endPage: number): number {
    const pageCount = endPage - startPage + 1;
    return pageCount * 12; // 페이지당 12개 제품 가정
  }

  /**
   * 배치 정보 생성
   */
  private static generateBatchInfo(crawlingRanges: CrawlingPageRange[]): {
    totalBatches: number;
    estimatedTime: number;
    recommendedConcurrency: number;
  } {
    const totalPages = crawlingRanges.reduce((sum, range) => sum + (range.endPage - range.startPage + 1), 0);
    
    // 배치 크기는 최대 10페이지로 제한
    const maxPagesPerBatch = 10;
    const totalBatches = Math.ceil(totalPages / maxPagesPerBatch);
    
    // 예상 시간: 페이지당 5초, 배치 간 1초 대기
    const estimatedTime = Math.ceil((totalPages * 5 + totalBatches * 1) / 60); // 분 단위
    
    // 권장 동시 실행 수: 총 배치의 1/3, 최소 1개, 최대 5개
    const recommendedConcurrency = Math.min(5, Math.max(1, Math.ceil(totalBatches / 3)));
    
    return {
      totalBatches,
      estimatedTime,
      recommendedConcurrency
    };
  }
  
  /**
   * 데이터베이스에서 최대 pageId 가져오기
   */
  private static async getMaxPageId(): Promise<number> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT MAX(pageId) as maxPageId FROM products`,
        (err, row: { maxPageId: number | null }) => {
          if (err) {
            return reject(err);
          }
          resolve(row.maxPageId || 0);
        }
      );
    });
  }
  
  /**
   * 모든 페이지의 제품 수 집계
   */
  private static async getProductCountsByPage(): Promise<Map<number, number>> {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT pageId, COUNT(*) as count FROM products GROUP BY pageId`,
        (err, rows: Array<{ pageId: number; count: number }>) => {
          if (err) {
            return reject(err);
          }
          
          const countMap = new Map<number, number>();
          rows.forEach(row => {
            countMap.set(row.pageId, row.count);
          });
          resolve(countMap);
        }
      );
    });
  }
  
  /**
   * 특정 페이지의 제품 수 가져오기
   */
  private static async getProductCountForPage(pageId: number): Promise<number> {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM products WHERE pageId = ?`,
        [pageId],
        (err, row: { count: number }) => {
          if (err) {
            return reject(err);
          }
          resolve(row.count);
        }
      );
    });
  }

  /**
   * 특정 페이지에서 존재하는 제품 인덱스들을 가져옵니다
   */
  private static async getExistingIndicesForPage(pageId: number): Promise<Set<number>> {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT indexInPage FROM products WHERE pageId = ? ORDER BY indexInPage`,
        [pageId],
        (err, rows: Array<{ indexInPage: number }>) => {
          if (err) {
            return reject(err);
          }
          
          const indices = new Set<number>();
          rows.forEach(row => {
            indices.add(row.indexInPage);
          });
          resolve(indices);
        }
      );
    });
  }
}
