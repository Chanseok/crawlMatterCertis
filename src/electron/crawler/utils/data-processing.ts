/**
 * data-processing.ts
 * 크롤링된 데이터의 처리와 검증을 위한 유틸리티 함수들
 */

import type { Product, MatterProduct } from '../../../../types.d.ts';
import { debugLog } from '../../util.js';

/**
 * 제품 목록 중복 제거 및 정렬
 */
export function deduplicateAndSortProducts(productsResults: Product[]): void {
    debugLog(`[Crawler] 중복 제거 전 제품 수: ${productsResults.length}`);
    
    // 중복 제거를 위한 Map 생성 (pageId-indexInPage 조합을 키로 사용)
    const uniqueProductsMap = new Map<string, Product>();
    productsResults.forEach(product => {
        const key = `${product.pageId}-${product.indexInPage}`; // Product type defines pageId and indexInPage as numbers
        uniqueProductsMap.set(key, product);
    });

    // Map에서 중복 제거된 제품 목록을 배열로 변환
    const uniqueProducts = Array.from(uniqueProductsMap.values());
    debugLog(`[Crawler] 중복 제거 후 제품 수: ${uniqueProducts.length}`);

    // pageId는 내림차순, 같은 pageId 내에서는 indexInPage 오름차순으로 정렬
    uniqueProducts.sort((a, b) => {
        const aPageId = a.pageId ?? 0;
        const bPageId = b.pageId ?? 0;

        if (bPageId !== aPageId) {
            return bPageId - aPageId; // pageId 내림차순 (descending)
        } else {
            // pageId가 같으면 indexInPage 오름차순 (ascending)
            const aIndexInPage = a.indexInPage ?? 0;
            const bIndexInPage = b.indexInPage ?? 0;
            return aIndexInPage - bIndexInPage;
        }
    });

    // Modify the original array in place
    productsResults.length = 0; // Clear the original array
    productsResults.push(...uniqueProducts); // Add sorted, unique products back
    debugLog(`[Crawler] 정렬 완료. 최종 제품 수: ${productsResults.length}`);
}

/**
 * Matter 제품 상세 정보 중복 제거 및 정렬
 */
export function deduplicateAndSortMatterProducts(matterProducts: MatterProduct[]): void {
    debugLog(`[Crawler] 중복 제거 전 수집에 성공한 상세 제품 정보 수: ${matterProducts.length}`);
    
    // 중복 제거를 위한 Map 생성 (pageId-indexInPage 조합을 키로 사용)
    const uniqueMatterProductsMap = new Map<string, MatterProduct>();
    matterProducts.forEach(product => {
        if (product.pageId !== undefined && product.indexInPage !== undefined) {
            const key = `${product.pageId}-${product.indexInPage}`;
            uniqueMatterProductsMap.set(key, product);
        }
    });
    
    // Map에서 중복 제거된 제품 목록을 배열로 변환
    const uniqueMatterProducts = Array.from(uniqueMatterProductsMap.values());
    
    // pageId는 오름차순, 같은 pageId 내에서는 indexInPage 오름차순으로 정렬
    const sortedMatterProducts = uniqueMatterProducts.sort((a, b) => {
        const aPageId = a.pageId ?? 0;
        const bPageId = b.pageId ?? 0;
        
        if (aPageId !== bPageId) {
            return aPageId - bPageId;
        }
        
        const aIndexInPage = a.indexInPage ?? 0;
        const bIndexInPage = b.indexInPage ?? 0;
        return aIndexInPage - bIndexInPage;
    });
    
    // 정렬된 결과로 matterProducts 업데이트
    matterProducts.length = 0;
    matterProducts.push(...sortedMatterProducts);
    
    debugLog(`[Crawler] 중복 제거 및 정렬 후 상세 제품 정보 수: ${matterProducts.length}`);
}

/**
 * 1단계와 2단계 데이터 일관성 검증
 */
export function validateDataConsistency(productsResults: Product[], matterProducts: MatterProduct[]): void {
    debugLog(`[Crawler] 1단계(제품 목록)와 2단계(상세 정보) 데이터 일관성 검증 시작`);
    
    // URL 기준으로 1단계 결과를 맵으로 변환하여 빠른 조회 가능하게 함
    const productsResultsMap = new Map<string, Product>();
    productsResults.forEach(product => {
        if (product.url) {
            productsResultsMap.set(product.url, product);
        }
    });
    
    // 2단계에서 수집했지만 1단계에 없는 항목 확인
    const missingInProductsResults: MatterProduct[] = [];
    
    // 1단계와 2단계 사이의 불일치 항목 확인
    const discrepancies: Array<{
        url: string;
        phase1Data: Product;
        phase2Data: MatterProduct;
        differences: Array<{ field: string; phase1Value: any; phase2Value: any }>;
    }> = [];
    
    // 2단계 수집 후 누락된 URL 확인 
    const missingInMatterProducts: Product[] = [];
    
    // 모든 matterProducts 항목을 productsResults와 비교
    matterProducts.forEach(matterProduct => {
        const productResult = productsResultsMap.get(matterProduct.url);
        
        if (!productResult) {
            // 1단계에서 수집되지 않은 URL인 경우
            missingInProductsResults.push(matterProduct);
        } else {
            // 두 단계 사이의 데이터 불일치 확인
            const differences = findDataDiscrepancies(productResult, matterProduct);
            
            if (differences.length > 0) {
                discrepancies.push({
                    url: matterProduct.url,
                    phase1Data: productResult,
                    phase2Data: matterProduct,
                    differences
                });
            }
        }
    });
    
    // 1단계에서 수집했지만 2단계에서 누락된 항목 확인
    const matterProductsUrlSet = new Set(matterProducts.map(p => p.url));
    productsResults.forEach(product => {
        if (product.url && !matterProductsUrlSet.has(product.url)) {
            missingInMatterProducts.push(product);
        }
    });
    
    // 일관성 검증 결과 로그
    logDataConsistencyResults(missingInProductsResults, discrepancies, missingInMatterProducts);
}

/**
 * 두 단계 사이의 데이터 불일치 찾기
 */
function findDataDiscrepancies(productResult: Product, matterProduct: MatterProduct): Array<{ field: string; phase1Value: any; phase2Value: any }> {
    const differences: Array<{ field: string; phase1Value: any; phase2Value: any }> = [];
    
    // 주요 필드 비교
    const fieldsToCompare: Array<keyof Product> = ['model', 'manufacturer', 'certificateId', 'pageId', 'indexInPage'];
    
    fieldsToCompare.forEach(field => {
        const phase1Value = productResult[field];
        const phase2Value = matterProduct[field];
        
        // 값이 다르고, 둘 다 존재하는 경우에만 기록
        if (phase1Value !== undefined && phase2Value !== undefined && phase1Value !== phase2Value) {
            differences.push({
                field: field.toString(),
                phase1Value,
                phase2Value
            });
        }
    });
    
    return differences;
}

/**
 * 데이터 일관성 검증 결과 로깅
 */
function logDataConsistencyResults(
    missingInProductsResults: MatterProduct[],
    discrepancies: Array<{
        url: string;
        phase1Data: Product;
        phase2Data: MatterProduct;
        differences: Array<{ field: string; phase1Value: any; phase2Value: any }>;
    }>,
    missingInMatterProducts: Product[]
): void {
    debugLog(`[Crawler] 데이터 일관성 검증 결과:`);
    
    // 1단계에 없는 URL 보고
    debugLog(`[Crawler] - 1단계에 없지만 2단계에서 수집된 URL 수: ${missingInProductsResults.length}`);
    if (missingInProductsResults.length > 0) {
        missingInProductsResults.forEach(product => {
            debugLog(`[Crawler]   * ${product.url} (ID: ${product.id})`);
        });
    }
    
    // 불일치 항목 보고
    debugLog(`[Crawler] - 1단계와 2단계 사이 정보 불일치 항목 수: ${discrepancies.length}`);
    if (discrepancies.length > 0) {
        discrepancies.forEach(({url, differences}) => {
            debugLog(`[Crawler]   * ${url} 불일치 필드:`);
            differences.forEach(diff => {
                debugLog(`[Crawler]     - ${diff.field}: 1단계="${diff.phase1Value}" vs 2단계="${diff.phase2Value}"`);
            });
        });
    }
    
    // 누락된 URL 보고
    debugLog(`[Crawler] - 2단계에서 누락된 제품 URL 수: ${missingInMatterProducts.length}`);
    if (missingInMatterProducts.length > 0 && missingInMatterProducts.length <= 10) {
        // 10개 이하만 상세 출력
        missingInMatterProducts.forEach(product => {
            debugLog(`[Crawler]   * ${product.url} (pageId: ${product.pageId}, indexInPage: ${product.indexInPage})`);
        });
    } else if (missingInMatterProducts.length > 10) {
        // 10개 초과 시 일부만 출력
        debugLog(`[Crawler]   * 처음 10개만 표시: ${missingInMatterProducts.slice(0, 10).map(p => p.url).join(', ')}`);
    }
}