/**
 * PageRangeParser.ts
 * 페이지 범위 문자열 파싱 유틸리티
 * 
 * 책임:
 * - "1~12, 34, 72" 형태의 문자열을 CrawlingRange[] 배열로 변환
 * - 입력 유효성 검증 및 오류 처리
 * - 중복 페이지 제거 및 범위 최적화
 */

import { Logger } from './Logger.js';
import { ValidationUtils } from './ValidationUtils.js';

const logger = Logger.getInstance();

/**
 * 크롤링 범위 인터페이스
 */
export interface CrawlingRange {
  startPage: number;
  endPage: number;
  reason: string;
  priority: number;
  estimatedProducts: number;
}

/**
 * 페이지 범위 파싱 결과
 */
export interface PageRangeParseResult {
  success: boolean;
  ranges: CrawlingRange[];
  errors: string[];
  totalPages: number;
  estimatedProducts: number;
}

/**
 * 페이지 범위 파서 클래스
 */
export class PageRangeParser {
  private static readonly PRODUCTS_PER_PAGE = 12;
  private static readonly DEFAULT_PRIORITY = 1;

  /**
   * 페이지 범위 문자열을 파싱하여 CrawlingRange 배열로 변환
   * 
   * @param input 입력 문자열 (예: "1~12, 34, 72")
   * @param totalSitePages 사이트 총 페이지 수
   * @returns 파싱 결과
   */
  public static parsePageRanges(input: string, totalSitePages: number): PageRangeParseResult {
    const result: PageRangeParseResult = {
      success: false,
      ranges: [],
      errors: [],
      totalPages: 0,
      estimatedProducts: 0
    };

    try {
      // Use ValidationUtils for input validation
      const inputValidation = ValidationUtils.validatePageRangeString(input);
      if (!inputValidation.success) {
        result.errors.push(...inputValidation.errors);
        return result;
      }

      const normalizedInput = inputValidation.data!;

      if (!ValidationUtils.isValidPositiveInteger(totalSitePages)) {
        result.errors.push('총 페이지 수가 유효하지 않습니다.');
        return result;
      }

      // 쉼표로 분할하여 각 토큰 처리
      const tokens = normalizedInput.split(',').filter(token => token.length > 0);
      
      if (tokens.length === 0) {
        result.errors.push('유효한 페이지 범위가 없습니다.');
        return result;
      }

      const allPages = new Set<number>();
      const parseErrors: string[] = [];

      // 각 토큰 파싱
      for (const token of tokens) {
        const tokenResult = this.parseToken(token, totalSitePages);
        
        if (tokenResult.success) {
          tokenResult.pages.forEach(page => allPages.add(page));
        } else {
          parseErrors.push(...tokenResult.errors);
        }
      }

      // 오류가 있으면 결과에 추가
      if (parseErrors.length > 0) {
        result.errors.push(...parseErrors);
      }

      // 페이지가 없으면 오류 처리
      if (allPages.size === 0) {
        result.errors.push('유효한 페이지가 없습니다.');
        return result;
      }

      // 페이지를 정렬하고 연속 범위로 그룹화
      const sortedPages = Array.from(allPages).sort((a, b) => b - a); // 내림차순 정렬 (큰 페이지부터)
      const ranges = this.groupIntoRanges(sortedPages);

      result.success = parseErrors.length === 0;
      result.ranges = ranges;
      result.totalPages = allPages.size;
      result.estimatedProducts = allPages.size * this.PRODUCTS_PER_PAGE;

      logger.info(`페이지 범위 파싱 완료: ${allPages.size}개 페이지, ${ranges.length}개 범위`, 'PageRangeParser');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`파싱 중 오류 발생: ${errorMessage}`);
      logger.error(`페이지 범위 파싱 오류: ${errorMessage}`, 'PageRangeParser');
    }

    return result;
  }

  /**
   * 개별 토큰을 파싱 (단일 페이지 또는 범위)
   */
  private static parseToken(token: string, totalSitePages: number): {
    success: boolean;
    pages: number[];
    errors: string[];
  } {
    const result = {
      success: false,
      pages: [] as number[],
      errors: [] as string[]
    };

    try {
      // 범위 구분자 확인 (~, -, :)
      const rangeDelimiters = ['~', '-', ':'];
      let delimiter = '';
      
      for (const delim of rangeDelimiters) {
        if (token.includes(delim)) {
          delimiter = delim;
          break;
        }
      }

      if (delimiter) {
        // 범위 파싱 (예: "1~12")
        const parts = token.split(delimiter);
        
        if (parts.length !== 2) {
          result.errors.push(`잘못된 범위 형식: "${token}"`);
          return result;
        }

        const start = this.parsePageNumber(parts[0]);
        const end = this.parsePageNumber(parts[1]);

        if (start === null || end === null) {
          result.errors.push(`잘못된 페이지 번호: "${token}"`);
          return result;
        }

        // Use ValidationUtils for page number validation
        const startValidation = ValidationUtils.validatePageNumber(start, totalSitePages, `Start page in range "${token}"`);
        const endValidation = ValidationUtils.validatePageNumber(end, totalSitePages, `End page in range "${token}"`);

        if (!startValidation.success) {
          result.errors.push(...startValidation.errors);
          return result;
        }

        if (!endValidation.success) {
          result.errors.push(...endValidation.errors);
          return result;
        }

        // 범위 생성 (start가 end보다 클 수 있음 - 내림차순)
        const minPage = Math.min(start, end);
        const maxPage = Math.max(start, end);
        
        for (let page = maxPage; page >= minPage; page--) {
          result.pages.push(page);
        }

      } else {
        // 단일 페이지 파싱 (예: "34")
        const pageNumber = this.parsePageNumber(token);
        
        if (pageNumber === null) {
          result.errors.push(`잘못된 페이지 번호: "${token}"`);
          return result;
        }

        // Use ValidationUtils for single page validation
        const pageValidation = ValidationUtils.validatePageNumber(pageNumber, totalSitePages, `Page "${token}"`);
        
        if (!pageValidation.success) {
          result.errors.push(...pageValidation.errors);
          return result;
        }

        result.pages.push(pageNumber);
      }

      result.success = true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`토큰 파싱 오류 "${token}": ${errorMessage}`);
    }

    return result;
  }

  /**
   * 문자열을 페이지 번호로 변환
   */
  private static parsePageNumber(str: string): number | null {
    const trimmed = str.trim();
    
    if (!trimmed) {
      return null;
    }

    const number = parseInt(trimmed, 10);
    
    if (isNaN(number) || !isFinite(number)) {
      return null;
    }

    return number;
  }

  /**
   * 페이지들을 연속 범위로 그룹화
   */
  private static groupIntoRanges(sortedPages: number[]): CrawlingRange[] {
    if (sortedPages.length === 0) {
      return [];
    }

    const ranges: CrawlingRange[] = [];
    let currentStart = sortedPages[0];
    let currentEnd = sortedPages[0];

    for (let i = 1; i < sortedPages.length; i++) {
      const currentPage = sortedPages[i];
      
      // 연속된 페이지인지 확인 (내림차순이므로 1차이)
      if (currentEnd - currentPage === 1) {
        currentEnd = currentPage;
      } else {
        // 현재 범위 완료
        ranges.push(this.createRange(currentStart, currentEnd));
        
        // 새 범위 시작
        currentStart = currentPage;
        currentEnd = currentPage;
      }
    }

    // 마지막 범위 추가
    ranges.push(this.createRange(currentStart, currentEnd));

    return ranges;
  }

  /**
   * CrawlingRange 객체 생성
   */
  private static createRange(startPage: number, endPage: number): CrawlingRange {
    const totalPages = startPage - endPage + 1;
    const estimatedProducts = totalPages * this.PRODUCTS_PER_PAGE;
    
    let reason: string;
    if (totalPages === 1) {
      reason = `Manual page ${startPage}`;
    } else {
      reason = `Manual pages ${startPage}-${endPage} (${totalPages} pages)`;
    }

    return {
      startPage,
      endPage,
      reason,
      priority: this.DEFAULT_PRIORITY,
      estimatedProducts
    };
  }

  /**
   * 파싱 결과를 사용자 친화적인 문자열로 변환
   */
  public static formatParseResult(result: PageRangeParseResult): string {
    if (!result.success) {
      return `오류: ${result.errors.join(', ')}`;
    }

    const rangeDescriptions = result.ranges.map(range => {
      if (range.startPage === range.endPage) {
        return `페이지 ${range.startPage}`;
      } else {
        const totalPages = range.startPage - range.endPage + 1;
        return `페이지 ${range.startPage}-${range.endPage} (${totalPages}페이지)`;
      }
    });

    return `${result.totalPages}개 페이지: ${rangeDescriptions.join(', ')} (예상 제품: ${result.estimatedProducts}개)`;
  }

  /**
   * 범위들의 유효성을 최종 검증
   */
  public static validateRanges(ranges: CrawlingRange[], totalSitePages: number): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const range of ranges) {
      // Use ValidationUtils for range validation
      const rangeValidation = ValidationUtils.validatePageRange(
        range.startPage,
        range.endPage,
        totalSitePages
      );

      if (!rangeValidation.isValid) {
        errors.push(`Range ${range.startPage}-${range.endPage}: ${rangeValidation.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
