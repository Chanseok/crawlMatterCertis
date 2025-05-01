/**
 * file.ts
 * 크롤링 결과를 파일로 저장하기 위한 유틸리티 함수들
 */

import fs from 'fs';
import path from 'path';
import type { Product, MatterProduct } from '../../../../types.d.ts';

/**
 * 현재 날짜와 시간 기반으로 파일 이름 생성
 */
function generateTimestampFilename(prefix: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${prefix}_${y}${m}${d}_${h}${min}${s}.json`;
}

/**
 * 출력 디렉토리 확인 또는 생성
 */
function ensureOutputDir(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
}

/**
 * 크롤링 결과를 JSON 파일로 저장
 */
export function saveProductsToFile(products: Product[]): string {
    try {
        const filename = generateTimestampFilename('products');
        const outputDir = path.resolve(process.cwd(), 'dist-output');

        ensureOutputDir(outputDir);

        const filePath = path.join(outputDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
        console.log(`[Crawler] Products saved to ${filePath}`);

        const uniquePageIds = [...new Set(products.map(p => p.pageId).filter((id): id is number => id !== undefined))];
        const sortedPageIds = uniquePageIds.sort((a, b) => b - a);

        console.log(`[Crawler] 수집된 고유 pageId 개수: ${uniquePageIds.length}`);
        console.log(`[Crawler] 고유 pageId 목록(내림차순): ${sortedPageIds.join(', ')}`);

        return filePath;
    } catch (err) {
        console.error('[Crawler] Failed to save products json:', err);
        throw err;
    }
}

/**
 * Matter 제품 상세 정보를 JSON 파일로 저장
 */
export function saveMatterProductsToFile(products: MatterProduct[]): string {
    try {
        const filename = generateTimestampFilename('matter-products');
        const outputDir = path.resolve(process.cwd(), 'dist-output');

        ensureOutputDir(outputDir);

        const filePath = path.join(outputDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
        console.log(`[Crawler] Matter products saved to ${filePath}`);
        return filePath;
    } catch (err) {
        console.error('[Crawler] Failed to save matter products json:', err);
        throw err;
    }
}