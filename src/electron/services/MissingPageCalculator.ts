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
      const { continuousRanges, nonContinuousRanges } = this.calculatePageRanges(incompletePages.map(p => p.pageId));

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
   * 464페이지 시스템에서 역순 매핑: 사이트페이지 = 464 - pageId
   * 예시: pageId 198 → 사이트 페이지 266 (464 - 198 = 266)
   */
  pageIdToPageNumber(pageId: number, totalPages: number = 464): number {
    return totalPages - pageId;
  }

  /**
   * 실제 사이트 페이지 번호를 pageId로 변환
   * 464페이지 시스템에서 역순 매핑: pageId = 464 - 사이트페이지
   */
  pageNumberToPageId(pageNumber: number, totalPages: number = 464): number {
    return totalPages - pageNumber;
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
   * pageId들을 사이트 페이지로 변환한 후 연속 범위 계산
   */
  private calculatePageRanges(pageIds: number[]): {
    continuousRanges: CrawlingRange[];
    nonContinuousRanges: CrawlingRange[];
  } {
    if (pageIds.length === 0) {
      return { continuousRanges: [], nonContinuousRanges: [] };
    }

    // 1. 모든 pageId를 사이트 페이지들로 변환
    const allSitePages = this.pageIdsToSitePages(pageIds);
    
    logger.info(
      `[MissingPageCalculator] DEBUG: ALL pageIds: [${pageIds.join(', ')}]`,
      "MissingPageCalculator"
    );
    logger.info(
      `[MissingPageCalculator] DEBUG: ALL converted site pages: [${allSitePages.join(', ')}]`,
      "MissingPageCalculator"
    );
    
    // 2. 사이트 페이지들을 오름차순으로 정렬 (연속 범위 계산을 위해)
    const sortedSitePages = [...allSitePages].sort((a, b) => a - b);
    
    const continuousRanges: CrawlingRange[] = [];
    const nonContinuousRanges: CrawlingRange[] = [];

    let currentRangeStart = sortedSitePages[0];
    let currentRangeEnd = sortedSitePages[0];

    for (let i = 1; i < sortedSitePages.length; i++) {
      const currentPage = sortedSitePages[i];
      const previousPage = sortedSitePages[i - 1];

      // 연속된 페이지인지 확인 (차이가 1)
      if (currentPage === previousPage + 1) {
        currentRangeEnd = currentPage;
      } else {
        // 범위 종료 - 현재까지의 범위를 저장
        const totalPages = currentRangeEnd - currentRangeStart + 1;
        const range: CrawlingRange = {
          startPage: currentRangeEnd, // 큰 번호가 startPage (내림차순 표시를 위해)
          endPage: currentRangeStart, // 작은 번호가 endPage
          reason: `Missing data detected`,
          priority: totalPages >= 3 ? 1 : 2,
          estimatedProducts: totalPages * 12
        };

        logger.info(
          `[MissingPageCalculator] DEBUG: Created range ${currentRangeEnd}~${currentRangeStart} (${totalPages} pages)`,
          "MissingPageCalculator"
        );

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
      startPage: currentRangeEnd, // 큰 번호가 startPage (내림차순 표시를 위해)
      endPage: currentRangeStart, // 작은 번호가 endPage
      reason: `Missing data detected`,
      priority: lastTotalPages >= 3 ? 1 : 2,
      estimatedProducts: lastTotalPages * 12
    };

    logger.info(
      `[MissingPageCalculator] DEBUG: Last range ${currentRangeEnd}~${currentRangeStart} (${lastTotalPages} pages)`,
      "MissingPageCalculator"
    );

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
   * Copy & paste 가능한 형태로 포맷팅: "201~205, 458~460, 407, 409, 411"
   */
  formatRangesForDisplay(ranges: CrawlingRange[]): string {
    const formattedRanges = ranges.map(range => {
      // startPage가 더 큰 번호이므로 절댓값으로 계산
      const totalPages = Math.abs(range.endPage - range.startPage) + 1;
      if (totalPages === 1) {
        return `${range.startPage}`;
      } else {
        return `${range.startPage}~${range.endPage}`;
      }
    });
    
    return formattedRanges.join(', ');
  }

  /**
   * PageId를 실제 사이트 페이지 번호 배열로 변환
   * 각 pageId는 사이트의 두 개 페이지에 해당 (해당 페이지와 그 다음 페이지)
   * 예시: pageId 198 → 사이트 페이지 [266, 267] (266과 그 다음 페이지 267)
   */
  pageIdToSitePages(pageId: number, totalPages: number = 464): number[] {
    const primaryPage = this.pageIdToPageNumber(pageId, totalPages);
    const nextPage = primaryPage + 1; // 다음 페이지는 번호가 1 큼
    
    // nextPage가 totalPages보다 크면 포함하지 않음
    if (nextPage <= totalPages) {
      return [primaryPage, nextPage];
    } else {
      return [primaryPage];
    }
  }

  /**
   * PageId 배열을 모든 사이트 페이지 번호 배열로 변환
   */
  pageIdsToSitePages(pageIds: number[], totalPages: number = 464): number[] {
    const sitePages: number[] = [];
    pageIds.forEach(pageId => {
      const sitePagesForId = this.pageIdToSitePages(pageId, totalPages);
      sitePages.push(...sitePagesForId);
    });
    
    // 중복 제거 및 오름차순 정렬 (범위 계산용)
    return [...new Set(sitePages)].sort((a, b) => a - b);
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
