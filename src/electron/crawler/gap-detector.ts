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

// Database connection for direct queries
const dbPath = path.join(app.getPath('userData'), 'dev-database.sqlite');
const db = new sqlite3.Database(dbPath);

/**
 * 페이지 갭 정보
 */
export interface PageGap {
  pageId: number;
  missingIndices: number[];
  expectedCount: number;
  actualCount: number;
}

/**
 * 갭 탐지 결과
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
      
      // 3. 각 페이지별 제품 수 집계
      const pageProductCounts = await this.getProductCountsByPage();
      
      // 4. 누락 분석
      const missingPages: PageGap[] = [];
      const completelyMissingPageIds: number[] = [];
      const partiallyMissingPageIds: number[] = [];
      let totalMissingProducts = 0;
      let totalExpectedProducts = 0;
      
      // 0부터 maxPageId까지 모든 페이지 검사
      for (let pageId = 0; pageId <= maxPageId; pageId++) {
        const actualCount = pageProductCounts.get(pageId) || 0;
        const expectedCount = productsPerPage; // 모든 페이지는 12개 제품 예상
        
        totalExpectedProducts += expectedCount;
        
        if (actualCount === 0) {
          // 완전히 누락된 페이지
          completelyMissingPageIds.push(pageId);
          totalMissingProducts += expectedCount;
          
          missingPages.push({
            pageId,
            missingIndices: Array.from({ length: expectedCount }, (_, i) => i),
            expectedCount,
            actualCount: 0
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
            actualCount
          });
        }
      }
      
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
        }
      };
      
      // 결과 로깅
      logger.info(`[GapDetector] 갭 탐지 완료:`);
      logger.info(`  - 총 누락 제품 수: ${totalMissingProducts}`);
      logger.info(`  - 완전히 누락된 페이지: ${completelyMissingPageIds.length}개 (${completelyMissingPageIds.join(', ')})`);
      logger.info(`  - 부분적으로 누락된 페이지: ${partiallyMissingPageIds.length}개 (${partiallyMissingPageIds.join(', ')})`);
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
            actualCount: 0
          });
        } else if (actualCount < expectedCount) {
          partiallyMissingPageIds.push(pageId);
          const missingCount = expectedCount - actualCount;
          totalMissingProducts += missingCount;
          
          const existingIndices = await this.getExistingIndicesForPage(pageId);
          const missingIndices = Array.from({ length: expectedCount }, (_, i) => i)
            .filter(i => !existingIndices.has(i));
          
          missingPages.push({
            pageId,
            missingIndices,
            expectedCount,
            actualCount
          });
        }
      }
      
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
        }
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
    
    console.log('================================================================\n');
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
   * 특정 페이지에 존재하는 indexInPage 값들 가져오기
   */
  private static async getExistingIndicesForPage(pageId: number): Promise<Set<number>> {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT indexInPage FROM products WHERE pageId = ? AND indexInPage IS NOT NULL`,
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
