/**
 * types.ts
 * 크롤러에서 사용되는 타입 정의
 */

// Importing from the root types.d.ts file
import type { Product, MatterProduct } from '../../../../types.d.ts';

/**
 * 크롤링 단계 결과 타입
 */
export interface CrawlResult {
    pageNumber: number;
    products: Product[] | null;
    error?: string;
}

export interface DetailCrawlResult {
    url: string;
    product: MatterProduct | null;
    error?: string;
}

/**
 * 실패 보고서 타입
 */
export interface FailedPageReport {
    pageNumber: number;
    errors: string[];
}

export interface FailedProductReport {
    url: string;
    errors: string[];
}

/**
 * 크롤링 상태 요약
 */
export interface CrawlingSummary {
    dbLastUpdated: string | null;
    dbProductCount: number;
    siteTotalPages: number;
    siteProductCount: number;
    diff: number;
    needCrawling: boolean;
    crawlingRange: { startPage: number; endPage: number };
    error?: string;
}

/**
 * 크롤링 결과 보고
 */
export interface CrawlingResultReport {
    success: boolean;
    count: number;
    products: Product[] | MatterProduct[];
    failedReport: FailedPageReport[] | FailedProductReport[];
}