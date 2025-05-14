/**
 * axiosExtractor.ts
 * Axios와 Cheerio를 사용한 제품 상세 정보 추출 유틸리티
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { Product } from '../../../../types.d.ts';

/**
 * Axios와 Cheerio를 사용하여 제품 상세 페이지의 정보를 추출합니다.
 * 이 방식은 Playwright가 실패할 때 대체 전략으로 사용됩니다.
 * 
 * @param product 기본 제품 정보
 * @param userAgent 사용할 User Agent 문자열
 * @param timeoutMs 요청 타임아웃 (밀리초)
 * @returns 추출된 제품 세부 정보
 */
export async function extractProductDetailsWithAxios(
  product: Product,
  userAgent: string,
  timeoutMs: number = 30000
): Promise<Partial<any>> {
  try {
    const response = await axios.get(product.url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: timeoutMs,
      maxRedirects: 5
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 제품 세부 정보를 저장할 객체
    const extractedFields: Record<string, any> = {
      manufacturer: product.manufacturer,
      model: product.model,
      certificateId: product.certificateId,
      deviceType: 'Matter Device',
      applicationCategories: [],
    };

    // 제품 제목 추출
    extractedFields.model = extractedFields.model || 
      $('h1.entry-title').text().trim() || 
      $('h1').text().trim() || 
      'Unknown Product';

    // 제품 정보 테이블에서 세부 정보 추출
    const infoTable = $('.product-certificates-table');
    
    infoTable.find('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().toLowerCase();
        const value = $(cells[1]).text().trim();
        
        if (key && value) {
          // 키를 필드 이름으로 변환
          mapKeyToField(key, value, extractedFields);
        }
      }
    });

    // 추가 세부 정보 추출
    extractDeviceType($, extractedFields);
    extractCategories($, extractedFields);
    
    return extractedFields;
  } catch (error) {
    console.error(`[AxiosExtractor] Failed to extract data for ${product.url}:`, error);
    throw error;
  }
}

/**
 * 키 이름을 필드 이름으로 매핑
 */
function mapKeyToField(key: string, value: string, fields: Record<string, any>): void {
  // MatterProductParser와 동일한 매핑 로직 적용
  const keyMap: Record<string, string> = {
    'manufacturer': 'manufacturer',
    'model': 'model',
    'certificate id': 'certificateId',
    'certification date': 'certificationDate',
    'software version': 'softwareVersion',
    'hardware version': 'hardwareVersion',
    'vid': 'vid',
    'pid': 'pid',
    'family sku': 'familySku',
    'family variant sku': 'familyVariantSku',
    'firmware version': 'firmwareVersion',
    'family id': 'familyId',
    'tis/trp tested': 'tisTrpTested',
    'specification version': 'specificationVersion',
    'transport interface': 'transportInterface',
    'primary device type id': 'primaryDeviceTypeId'
  };

  const mappedField = keyMap[key] || key.replace(/\s+/g, '');
  
  if (mappedField) {
    fields[mappedField] = value;
  }
}

/**
 * 기기 유형 추출
 */
function extractDeviceType($: cheerio.CheerioAPI, fields: Record<string, any>): void {
  // 페이지 내용에서 기기 유형 추출 로직
  const deviceTypeText = $('.device-type').text().trim() || 
                         $('.product-type').text().trim() ||
                         $('div:contains("Device Type:")').text().trim();
  
  if (deviceTypeText) {
    const match = deviceTypeText.match(/Device Type:\s*(.+)/i);
    if (match && match[1]) {
      fields.deviceType = match[1].trim();
    }
  }
}

/**
 * 애플리케이션 카테고리 추출
 */
function extractCategories($: cheerio.CheerioAPI, fields: Record<string, any>): void {
  const categories: string[] = [];
  
  // 카테고리 목록을 찾아서 추출
  $('.categories li, .application-categories li').each((_, elem) => {
    const category = $(elem).text().trim();
    if (category) {
      categories.push(category);
    }
  });
  
  if (categories.length > 0) {
    fields.applicationCategories = categories;
  }
}
