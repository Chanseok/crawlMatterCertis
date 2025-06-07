/**
 * MissingPageCalculator.ts
 * 누락된 페이지 범위 계산 및 비연속적 페이지 처리 서비스
 */

import { logger } from '../../shared/utils/Logger.js';
import { MissingDataAnalyzer } from './MissingDataAnalyzer.js';
import type { 
  IncompletePage, 
  CrawlingRange 
} from '../../../types.js';

/**
 * 페이지 범위 계산 결과
 */
export interface PageRangeCalculationResult {
  totalIncompletePages: number;
  pageRanges: CrawlingRange[];
  continuousRanges: CrawlingRange[];
  nonContinuousRanges: CrawlingRange[];
  priorityPages: number[];
  skippedPages: number[];
}

/**
 * 누락된 페이지 범위를 계산하고 크롤링 전략을 생성하는 서비스
 */
export class MissingPageCalculator {
  private analyzer: MissingDataAnalyzer;

  constructor() {
    this.analyzer = new MissingDataAnalyzer();
  }

  /**
   * 불완전한 페이지들을 분석하여 크롤링 범위 계산
   */
  async calculateCrawlingRanges(): Promise<PageRangeCalculationResult> {
    try {
      logger.info("[MissingPageCalculator] Starting page range calculation", "MissingPageCalculator");

      // 1. 불완전한 페이지 목록 조회
      const incompletePages = await this.analyzer.findIncompletePagesList();
      
      if (incompletePages.length === 0) {
        logger.info("[MissingPageCalculator] No incomplete pages found", "MissingPageCalculator");
        return {
          totalIncompletePages: 0,
          pageRanges: [],
          continuousRanges: [],
          nonContinuousRanges: [],
          priorityPages: [],
          skippedPages: []
        };
      }

      logger.info(
        `[MissingPageCalculator] Found ${incompletePages.length} incomplete pages`,
        "MissingPageCalculator"
      );

      // 2. 페이지를 심각도별로 분류
      const { priorityPages, skippedPages } = this.classifyPagesByPriority(incompletePages);

      // 3. 연속 및 비연속 범위 계산
      const { continuousRanges, nonContinuousRanges } = this.calculatePageRanges(priorityPages);

      // 4. 전체 범위 통합
      const pageRanges = [...continuousRanges, ...nonContinuousRanges];

      const result: PageRangeCalculationResult = {
        totalIncompletePages: incompletePages.length,
        pageRanges,
        continuousRanges,
        nonContinuousRanges,
        priorityPages,
        skippedPages
      };

      logger.info(
        `[MissingPageCalculator] Range calculation completed: ${continuousRanges.length} continuous + ${nonContinuousRanges.length} non-continuous ranges`,
        "MissingPageCalculator"
      );

      return result;

    } catch (error) {
      logger.error("[MissingPageCalculator] Error during range calculation", "MissingPageCalculator", error as Error);
      throw error;
    }
  }

  /**
   * pageId를 실제 사이트 페이지 번호로 변환
   * pageId는 0부터 시작하므로 실제 페이지 번호는 pageId + 1
   */
  pageIdToPageNumber(pageId: number): number {
    return pageId + 1;
  }

  /**
   * 실제 사이트 페이지 번호를 pageId로 변환
   * 실제 페이지 번호는 1부터 시작하므로 pageId는 pageNumber - 1
   */
  pageNumberToPageId(pageNumber: number): number {
    return pageNumber - 1;
  }

  /**
   * 특정 페이지들의 누락된 인덱스 범위 계산
   */
  async calculateMissingIndicesForPages(pageIds: number[]): Promise<Map<number, number[]>> {
    try {
      logger.info(
        `[MissingPageCalculator] Calculating missing indices for ${pageIds.length} pages`,
        "MissingPageCalculator"
      );

      const incompletePages = await this.analyzer.findIncompletePagesList();
      const missingIndicesMap = new Map<number, number[]>();

      pageIds.forEach(pageId => {
        const incompletePage = incompletePages.find(page => page.pageId === pageId);
        if (incompletePage) {
          missingIndicesMap.set(pageId, [...incompletePage.missingIndices]);
        } else {
          // 페이지가 완전하다면 빈 배열
          missingIndicesMap.set(pageId, []);
        }
      });

      logger.info(
        `[MissingPageCalculator] Missing indices calculated for ${missingIndicesMap.size} pages`,
        "MissingPageCalculator"
      );

      return missingIndicesMap;

    } catch (error) {
      logger.error("[MissingPageCalculator] Error calculating missing indices", "MissingPageCalculator", error as Error);
      throw error;
    }
  }

  /**
   * 페이지를 심각도별로 분류 (우선순위 vs 건너뛸 페이지)
   */
  private classifyPagesByPriority(incompletePages: IncompletePage[]): {
    priorityPages: number[];
    skippedPages: number[];
  } {
    const priorityPages: number[] = [];
    const skippedPages: number[] = [];

    incompletePages.forEach(page => {
      const missingRatio = page.missingIndices.length / page.expectedCount;
      
      // 50% 이상 누락된 페이지는 우선순위로 처리
      if (missingRatio >= 0.5 || page.missingIndices.length >= 6) {
        priorityPages.push(page.pageId);
      } 
      // 1-2개만 누락된 페이지는 건너뛸 수 있음
      else if (page.missingIndices.length <= 2) {
        skippedPages.push(page.pageId);
      } 
      // 중간 정도 누락은 우선순위로 처리
      else {
        priorityPages.push(page.pageId);
      }
    });

    logger.info(
      `[MissingPageCalculator] Classified pages - Priority: ${priorityPages.length}, Skipped: ${skippedPages.length}`,
      "MissingPageCalculator"
    );

    return { priorityPages: priorityPages.sort((a, b) => a - b), skippedPages };
  }

  /**
   * 페이지 번호들을 연속/비연속 범위로 그룹화
   */
  private calculatePageRanges(pageIds: number[]): {
    continuousRanges: CrawlingRange[];
    nonContinuousRanges: CrawlingRange[];
  } {
    if (pageIds.length === 0) {
      return { continuousRanges: [], nonContinuousRanges: [] };
    }

    const sortedPageIds = [...pageIds].sort((a, b) => a - b);
    const continuousRanges: CrawlingRange[] = [];
    const nonContinuousRanges: CrawlingRange[] = [];

    let currentRangeStart = sortedPageIds[0];
    let currentRangeEnd = sortedPageIds[0];

    for (let i = 1; i < sortedPageIds.length; i++) {
      const currentPage = sortedPageIds[i];
      const previousPage = sortedPageIds[i - 1];

      // 연속된 페이지인지 확인 (차이가 1)
      if (currentPage === previousPage + 1) {
        currentRangeEnd = currentPage;
      } else {
        // 범위 종료 - 현재까지의 범위를 저장
        const totalPages = currentRangeEnd - currentRangeStart + 1;
        const range: CrawlingRange = {
          startPage: this.pageIdToPageNumber(currentRangeStart),
          endPage: this.pageIdToPageNumber(currentRangeEnd),
          reason: `Missing data detected`,
          priority: totalPages >= 3 ? 1 : 2,
          estimatedProducts: totalPages * 12
        };

        // 연속 범위 판단 (3페이지 이상이면 연속으로 간주)
        if (totalPages >= 3) {
          continuousRanges.push(range);
        } else {
          nonContinuousRanges.push(range);
        }

        // 새로운 범위 시작
        currentRangeStart = currentPage;
        currentRangeEnd = currentPage;
      }
    }

    // 마지막 범위 처리
    const lastTotalPages = currentRangeEnd - currentRangeStart + 1;
    const lastRange: CrawlingRange = {
      startPage: this.pageIdToPageNumber(currentRangeStart),
      endPage: this.pageIdToPageNumber(currentRangeEnd),
      reason: `Missing data detected`,
      priority: lastTotalPages >= 3 ? 1 : 2,
      estimatedProducts: lastTotalPages * 12
    };

    if (lastTotalPages >= 3) {
      continuousRanges.push(lastRange);
    } else {
      nonContinuousRanges.push(lastRange);
    }

    logger.info(
      `[MissingPageCalculator] Calculated ranges - Continuous: ${continuousRanges.length}, Non-continuous: ${nonContinuousRanges.length}`,
      "MissingPageCalculator"
    );

    return { continuousRanges, nonContinuousRanges };
  }

  /**
   * 크롤링 범위를 사용자에게 표시할 텍스트로 변환
   */
  formatRangesForDisplay(ranges: CrawlingRange[]): string[] {
    return ranges.map(range => {
      const totalPages = range.endPage - range.startPage + 1;
      if (totalPages === 1) {
        return `Page ${range.startPage}`;
      } else {
        return `Pages ${range.startPage}-${range.endPage} (${totalPages} pages)`;
      }
    });
  }

  /**
   * 크롤링 범위의 예상 처리 시간 계산 (추정)
   */
  estimateProcessingTime(ranges: CrawlingRange[]): {
    totalPages: number;
    estimatedMinutes: number;
    estimatedTimeText: string;
  } {
    const totalPages = ranges.reduce((sum, range) => {
      return sum + (range.endPage - range.startPage + 1);
    }, 0);
    
    // 페이지당 평균 30초 추정 (Stage 1 + Stage 2)
    const estimatedSeconds = totalPages * 30;
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    let estimatedTimeText: string;
    if (estimatedMinutes < 60) {
      estimatedTimeText = `${estimatedMinutes} minutes`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const remainingMinutes = estimatedMinutes % 60;
      estimatedTimeText = `${hours}h ${remainingMinutes}m`;
    }

    return {
      totalPages,
      estimatedMinutes,
      estimatedTimeText
    };
  }
}
