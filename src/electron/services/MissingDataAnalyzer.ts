/**
 * MissingDataAnalyzer.ts
 * 누락된 제품 데이터 분석 서비스
 */

import { 
  findMissingProductDetails,
  findIncompletePages,
  getTableComparisonSummary
} from '../database.js';
import { logger } from '../../shared/utils/Logger.js';
import type { 
  MissingProduct, 
  IncompletePage, 
  MissingDataAnalysis 
} from '../../../types.js';

/**
 * 누락된 제품 데이터를 분석하는 서비스 클래스
 */
export class MissingDataAnalyzer {
  constructor() {
    // No database path needed since we use the existing database connection
  }

  /**
   * products와 products_details 테이블 간 차이 분석
   */
  async analyzeTableDifferences(totalPages: number = 466): Promise<MissingDataAnalysis> {
    try {
      logger.info("[MissingDataAnalyzer] Starting missing data analysis", "MissingDataAnalyzer");
      logger.info(`[MissingDataAnalyzer] Using total pages: ${totalPages}`, "MissingDataAnalyzer");

      // 병렬로 모든 분석 실행
      const [missingDetails, incompletePages, summary] = await Promise.all([
        findMissingProductDetails(),
        findIncompletePages(),
        getTableComparisonSummary()
      ]);

      const analysis: MissingDataAnalysis = {
        missingDetails: [...missingDetails], // Convert readonly to mutable array
        incompletePages: [...incompletePages], // Convert readonly to mutable array
        totalMissingDetails: missingDetails.length,
        totalIncompletePages: incompletePages.length,
        summary,
        totalPages // 실제 총 페이지 수 포함
      };

      logger.info(
        `[MissingDataAnalyzer] Analysis completed: ${analysis.totalMissingDetails} missing details, ${analysis.totalIncompletePages} incomplete pages`,
        "MissingDataAnalyzer"
      );

      return analysis;
    } catch (error) {
      logger.error("[MissingDataAnalyzer] Error during analysis", "MissingDataAnalyzer", error as Error);
      throw error;
    }
  }

  /**
   * 누락된 제품 상세 정보만 조회
   */
  async findMissingDetails(): Promise<MissingProduct[]> {
    try {
      logger.info("[MissingDataAnalyzer] Finding missing product details", "MissingDataAnalyzer");
      const missingDetails = await findMissingProductDetails();
      logger.info(`[MissingDataAnalyzer] Found ${missingDetails.length} missing product details`, "MissingDataAnalyzer");
      return [...missingDetails];
    } catch (error) {
      logger.error("[MissingDataAnalyzer] Error finding missing product details", "MissingDataAnalyzer", error as Error);
      throw error;
    }
  }

  /**
   * 불완전한 페이지들만 조회
   */
  async findIncompletePagesList(): Promise<IncompletePage[]> {
    try {
      logger.info("[MissingDataAnalyzer] Finding incomplete pages", "MissingDataAnalyzer");
      const incompletePages = await findIncompletePages();
      logger.info(`[MissingDataAnalyzer] Found ${incompletePages.length} incomplete pages`, "MissingDataAnalyzer");
      return [...incompletePages];
    } catch (error) {
      logger.error("[MissingDataAnalyzer] Error finding incomplete pages", "MissingDataAnalyzer", error as Error);
      throw error;
    }
  }

  /**
   * 간단한 테이블 비교 요약
   */
  async getComparisonSummary() {
    try {
      logger.info("[MissingDataAnalyzer] Getting table comparison summary", "MissingDataAnalyzer");
      const summary = await getTableComparisonSummary();
      logger.info(
        `[MissingDataAnalyzer] Summary - Products: ${summary.productsCount}, Product Details: ${summary.productDetailsCount}, Difference: ${summary.difference}`,
        "MissingDataAnalyzer"
      );
      return summary;
    } catch (error) {
      logger.error("[MissingDataAnalyzer] Error getting comparison summary", "MissingDataAnalyzer", error as Error);
      throw error;
    }
  }
}
