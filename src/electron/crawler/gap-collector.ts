/**
 * gap-collector.ts
 * 누락된 제품을 자동으로 수집하는 시스템
 */

import { GapDetector, type PageGap, type GapDetectionResult } from "./gap-detector.js";
import { saveProductsToDb } from "../database.js";
// import { configManager } from "../ConfigManager.js";
import { logger } from "../../shared/utils/Logger.js";
import { ProductDataProcessor } from "./tasks/product-data-processor.js";
// import { PageIndexManager } from "./utils/page-index-manager.js";
import type { MatterProduct, Product } from "../../../types.js";

/**
 * 갭 수집 옵션
 */
export interface GapCollectionOptions {
  maxConcurrentPages?: number; // 동시 수집할 최대 페이지 수
  delayBetweenPages?: number; // 페이지 간 지연 시간 (ms)
  skipCompletePages?: boolean; // 완전한 페이지 건너뛰기 여부
  prioritizePartialPages?: boolean; // 부분적 누락 페이지 우선 처리
}

/**
 * 갭 수집 결과
 */
export interface GapCollectionResult {
  collected: number;
  failed: number;
  skipped: number;
  collectedPages: number[];
  failedPages: number[];
  errors: string[];
}

/**
 * 누락된 제품 자동 수집을 위한 클래스
 */
export class GapCollector {
  
  /**
   * 탐지된 갭을 기반으로 누락된 제품들을 수집합니다
   * @param gapResult 갭 탐지 결과
   * @param crawlerInstance 크롤러 인스턴스 (실제 페이지 수집을 위해)
   * @param options 수집 옵션
   * @returns 수집 결과
   */
  public static async collectMissingProducts(
    gapResult: GapDetectionResult,
    crawlerInstance: any, // 실제 크롤러 인스턴스
    options: GapCollectionOptions = {}
  ): Promise<GapCollectionResult> {
    const {
      maxConcurrentPages = 3,
      delayBetweenPages = 1000,
      prioritizePartialPages = true
    } = options;
    
    logger.info(`[GapCollector] 누락된 제품 수집 시작: 총 ${gapResult.totalMissingProducts}개 제품`, "GapCollector");
    
    const result: GapCollectionResult = {
      collected: 0,
      failed: 0,
      skipped: 0,
      collectedPages: [],
      failedPages: [],
      errors: []
    };
    
    try {
      // 수집할 페이지 정렬 (부분적 누락 페이지 우선 처리)
      let pagesToProcess = [...gapResult.missingPages];
      
      if (prioritizePartialPages) {
        pagesToProcess.sort((a, b) => {
          // 부분적 누락 페이지(actualCount > 0)를 먼저 처리
          if (a.actualCount > 0 && b.actualCount === 0) return -1;
          if (a.actualCount === 0 && b.actualCount > 0) return 1;
          
          // 같은 타입이면 누락된 제품 수가 적은 것부터
          return a.missingIndices.length - b.missingIndices.length;
        });
      }
      
      // 페이지별 수집 처리
      for (let i = 0; i < pagesToProcess.length; i += maxConcurrentPages) {
        const batch = pagesToProcess.slice(i, i + maxConcurrentPages);
        
        await Promise.all(
          batch.map(async (pageGap) => {
            try {
              await this.collectPageGap(pageGap, crawlerInstance, result);
            } catch (error) {
              const errorMsg = `페이지 ${pageGap.pageId} 수집 실패: ${error}`;
              logger.error(`[GapCollector] ${errorMsg}`, "GapCollector");
              result.errors.push(errorMsg);
              result.failedPages.push(pageGap.pageId);
              result.failed += pageGap.missingIndices.length;
            }
          })
        );
        
        // 배치 간 지연
        if (i + maxConcurrentPages < pagesToProcess.length && delayBetweenPages > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenPages));
        }
      }
      
      logger.info(`[GapCollector] 갭 수집 완료: 수집=${result.collected}, 실패=${result.failed}, 건너뜀=${result.skipped}`, "GapCollector");
      
    } catch (error) {
      logger.error("[GapCollector] 갭 수집 중 전체 오류", "GapCollector", error instanceof Error ? error : new Error(String(error)));
      result.errors.push(`전체 수집 실패: ${error}`);
    }
    
    return result;
  }
  
  /**
   * 특정 페이지의 갭만 수집
   * @param pageId 페이지 ID
   * @param crawlerInstance 크롤러 인스턴스
   * @param options 수집 옵션
   * @returns 수집 결과
   */
  public static async collectPageGaps(
    pageId: number,
    crawlerInstance: any
  ): Promise<GapCollectionResult> {
    logger.info(`[GapCollector] 페이지 ${pageId}의 갭 수집 시작`, "GapCollector");
    
    try {
      // 해당 페이지의 갭 탐지
      const gapResult = await GapDetector.detectMissingProductsInRange(pageId, pageId);
      const pageGap = gapResult.missingPages.find(p => p.pageId === pageId);
      
      if (!pageGap || pageGap.missingIndices.length === 0) {
        logger.info(`[GapCollector] 페이지 ${pageId}에 누락된 제품이 없습니다.`, "GapCollector");
        return {
          collected: 0,
          failed: 0,
          skipped: 0,
          collectedPages: [],
          failedPages: [],
          errors: []
        };
      }
      
      const result: GapCollectionResult = {
        collected: 0,
        failed: 0,
        skipped: 0,
        collectedPages: [],
        failedPages: [],
        errors: []
      };
      
      await this.collectPageGap(pageGap, crawlerInstance, result);
      
      return result;
      
    } catch (error) {
      logger.error(`[GapCollector] 페이지 ${pageId} 갭 수집 중 오류`, "GapCollector", error instanceof Error ? error : new Error(String(error)));
      return {
        collected: 0,
        failed: pageId,
        skipped: 0,
        collectedPages: [],
        failedPages: [pageId],
        errors: [`페이지 ${pageId} 수집 실패: ${error}`]
      };
    }
  }
  
  /**
   * 개별 페이지 갭 수집 처리
   * @param pageGap 페이지 갭 정보
   * @param crawlerInstance 크롤러 인스턴스
   * @param result 결과 객체 (수정됨)
   */
  private static async collectPageGap(
    pageGap: PageGap,
    crawlerInstance: any,
    result: GapCollectionResult
  ): Promise<void> {
    const { pageId, missingIndices } = pageGap;
    
    logger.info(`[GapCollector] 페이지 ${pageId} 갭 수집: ${missingIndices.length}개 인덱스 [${missingIndices.join(', ')}]`, "GapCollector");
    
    try {
      // pageId를 사이트 페이지 번호로 역변환
      const { sitePageNumber } = await this.convertPageIdToSitePageNumber(pageId);
      
      logger.info(`[GapCollector] pageId ${pageId} -> 사이트 페이지 번호 ${sitePageNumber}`, "GapCollector");
      
      // 해당 사이트 페이지에서 누락된 인덱스의 제품들만 수집
      const collectedProducts = await this.collectSpecificIndices(
        sitePageNumber,
        missingIndices,
        crawlerInstance
      );
      
      if (collectedProducts.length > 0) {
        // 데이터베이스에 저장
        const saveResult = await saveProductsToDb(collectedProducts);
        
        result.collected += saveResult.added;
        result.collectedPages.push(pageId);
        
        logger.info(`[GapCollector] 페이지 ${pageId} 수집 완료: ${saveResult.added}개 제품 추가`, "GapCollector");
      } else {
        logger.info(`[GapCollector] 페이지 ${pageId}에서 제품을 수집하지 못했습니다.`, "GapCollector");
        result.skipped += missingIndices.length;
      }
      
    } catch (error) {
      logger.error(`[GapCollector] 페이지 ${pageId} 수집 중 오류`, "GapCollector", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 특정 사이트 페이지에서 지정된 인덱스의 제품들만 수집
   * @param sitePageNumber 사이트 페이지 번호
   * @param targetIndices 수집할 인덱스 배열
   * @param crawlerInstance 크롤러 인스턴스
   * @returns 수집된 제품 배열
   */
  private static async collectSpecificIndices(
    sitePageNumber: number,
    targetIndices: number[],
    crawlerInstance: any
  ): Promise<MatterProduct[]> {
    try {
      // AbortController 생성 (PageCrawler.crawlPage 메서드에 필요)
      const abortController = new AbortController();
      
      // 전체 페이지 수집 (AbortSignal 매개변수 추가)
      const crawlResult = await crawlerInstance.crawlPage(sitePageNumber, abortController.signal);
      
      // PageCrawlResult에서 rawProducts 추출
      const rawProducts = crawlResult?.rawProducts || [];
      
      if (!rawProducts || rawProducts.length === 0) {
        logger.info(`[GapCollector] 사이트 페이지 ${sitePageNumber}에서 제품을 가져올 수 없습니다.`, "GapCollector");
        return [];
      }
      
      // RawProductData를 Product로 변환
      const productDataProcessor = new ProductDataProcessor();
    //   const { pageId } = PageIndexManager.mapToLocalIndexing(sitePageNumber, 0, 0);
      const products = productDataProcessor.mapRawProductsToProducts(rawProducts, sitePageNumber, 0);
      
      // 타겟 인덱스에 해당하는 제품들만 필터링
      const targetProducts = products.filter((_: Product, index: number) => {
        return targetIndices.includes(index);
      });
      
      // Product를 MatterProduct로 변환 (기본 필드 매핑)
      const matterProducts: MatterProduct[] = targetProducts.map((product: Product) => ({
        ...product,
        // MatterProduct의 추가 필드들은 기본값으로 설정
        deviceType: undefined,
        certificationDate: undefined,
        softwareVersion: undefined,
        hardwareVersion: undefined,
        vid: undefined,
        pid: undefined,
        familySku: undefined,
        familyVariantSku: undefined,
        firmwareVersion: undefined
      }));
      
      logger.info(`[GapCollector] 사이트 페이지 ${sitePageNumber}에서 ${matterProducts.length}개 제품 수집 (타겟: ${targetIndices.length}개)`, "GapCollector");
      
      return matterProducts;
      
    } catch (error) {
      logger.error(`[GapCollector] 사이트 페이지 ${sitePageNumber} 수집 중 오류`, "GapCollector", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * pageId를 사이트 페이지 번호로 역변환
   * @param pageId 로컬 pageId
   * @returns 사이트 페이지 번호와 관련 정보
   */
  private static async convertPageIdToSitePageNumber(pageId: number): Promise<{
    sitePageNumber: number;
    totalSitePages: number;
  }> {
    try {
      // CrawlerEngine을 통해 실제 사이트의 총 페이지 수 가져오기
      const { CrawlerEngine } = await import("./core/CrawlerEngine.js");
      const crawlerEngine = new CrawlerEngine();
      
      // 크롤링 상태 체크를 통해 실제 사이트 총 페이지 수 가져오기
      const statusSummary = await crawlerEngine.checkCrawlingStatus();
      const totalSitePages = statusSummary.siteTotalPages;
      
      if (!totalSitePages || totalSitePages <= 0) {
        throw new Error(`사이트 총 페이지 수를 가져올 수 없습니다: ${totalSitePages}`);
      }
      
      // pageId를 사이트 페이지 번호로 변환
      // pageId 0 = 최신 페이지 (사이트 페이지 462)
      // pageId 461 = 가장 오래된 페이지 (사이트 페이지 1)
      // 공식: sitePageNumber = totalSitePages - pageId
      const sitePageNumber = totalSitePages - pageId;
      
      // 유효성 검사
      if (sitePageNumber < 1 || sitePageNumber > totalSitePages) {
        throw new Error(`계산된 사이트 페이지 번호가 유효하지 않습니다: ${sitePageNumber} (범위: 1-${totalSitePages})`);
      }
      
      logger.info(`[GapCollector] pageId ${pageId} -> 사이트 페이지 번호 ${sitePageNumber} (총 ${totalSitePages}페이지)`, "GapCollector");
      
      return {
        sitePageNumber,
        totalSitePages
      };
      
    } catch (error) {
      logger.error(`[GapCollector] pageId ${pageId} 역변환 중 오류`, "GapCollector", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * 갭 수집 결과 보고서 출력
   * @param result 갭 수집 결과
   */
  public static printCollectionReport(result: GapCollectionResult): void {
    console.log('\n==================== 갭 수집 결과 보고서 ====================');
    console.log(`수집된 제품 수: ${result.collected}개`);
    console.log(`실패한 제품 수: ${result.failed}개`);
    console.log(`건너뛴 제품 수: ${result.skipped}개`);
    
    if (result.collectedPages.length > 0) {
      console.log(`\n수집 완료된 페이지 (${result.collectedPages.length}개):`);
      console.log(`  PageID: ${result.collectedPages.join(', ')}`);
    }
    
    if (result.failedPages.length > 0) {
      console.log(`\n수집 실패한 페이지 (${result.failedPages.length}개):`);
      console.log(`  PageID: ${result.failedPages.join(', ')}`);
    }
    
    if (result.errors.length > 0) {
      console.log(`\n오류 목록:`);
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('==========================================================\n');
  }
}
