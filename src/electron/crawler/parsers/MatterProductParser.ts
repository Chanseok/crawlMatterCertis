/**
 * MatterProductParser.ts
 * Matter 제품 상세 정보를 웹 페이지 DOM에서 추출하는 파서 클래스
 */

import type { Product, MatterProduct } from '../../../../types.d.ts';

// No need to redeclare document - just add @ts-ignore comments where needed

/**
 * Matter 제품 상세 정보를 웹 페이지 DOM에서 추출하는 파서 클래스
 * @class MatterProductParser
 */
export class MatterProductParser {
  /**
   * 브라우저 컨텍스트에서 실행되며 제품 상세 정보를 DOM에서 추출
   */
  public static extractProductDetails(
    baseProductForContext: Readonly<Product>
  ): Partial<Omit<MatterProduct, 'url' | 'pageId' | 'indexInPage' | 'id'>> {
    // 페이지 내 다양한 섹션에서 추출한 세부 정보를 저장하는 타입
    type ProductDetails = Record<string, string | undefined>;

    // 추출된 데이터로 구축할 객체 초기화
    const extractedFields: Partial<Omit<MatterProduct, 'url' | 'pageId' | 'indexInPage' | 'id'>> = {
      manufacturer: baseProductForContext.manufacturer,
      model: baseProductForContext.model,
      certificateId: baseProductForContext.certificateId,
      deviceType: 'Matter Device',
      applicationCategories: [],
    };

    console.debug(`[Extracting product details for ${baseProductForContext.url}]`);

    function extractProductTitle(): string {
      const getText = (selector: string): string => {
        // @ts-ignore - document is available at runtime
        const el = document.querySelector(selector);
        return el ? el.textContent?.trim() || '' : '';
      };

      return getText('h1.entry-title') || getText('h1') || 'Unknown Product';
    }

    function extractDetailsFromTable(): ProductDetails {
      const details: ProductDetails = {};
      // @ts-ignore - document is available at runtime
      const infoTable = document.querySelector('.product-certificates-table');
      if (!infoTable) return details;

      // @ts-ignore - infoTable is Element at runtime
      const rows = infoTable.querySelectorAll('tr');
      Array.from(rows).forEach((row) => {
        // @ts-ignore - row is Element at runtime
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          // @ts-ignore - cells[0] is Element at runtime
          const key = cells[0].textContent?.trim().toLowerCase() || '';
          // @ts-ignore - cells[1] is Element at runtime
          const value = cells[1].textContent?.trim() || '';

          if (value) {
            if (key.includes('certification id')) details.certificateId = value;
            else if (key.includes('certification date')) details.certificationDate = value;
            else if (key.includes('software version')) details.softwareVersion = value;
            else if (key.includes('hardware version')) details.hardwareVersion = value;
            else if (key.includes('vid')) details.vid = value;
            else if (key.includes('pid')) details.pid = value;
            else if (key.includes('family sku')) details.familySku = value;
            else if (key.includes('family variant sku')) details.familyVariantSku = value;
            else if (key.includes('firmware version')) details.firmwareVersion = value;
            else if (key.includes('family id')) details.familyId = value;
            else if (key.includes('tis') && key.includes('trp tested')) details.tisTrpTested = value;
            else if (key.includes('specification version')) details.specificationVersion = value;
            else if (key.includes('transport interface')) details.transportInterface = value;
            else if (key.includes('primary device type id')) details.primaryDeviceTypeId = value;
            else if (key.includes('device type') || key.includes('product type')) details.deviceType = value;
          }
        }
      });

      return details;
    }

    function extractDetailValues(): ProductDetails {
      const details: ProductDetails = {};
      // @ts-ignore - document is available at runtime
      const detailItems = document.querySelectorAll('.entry-product-details div ul li');

      // Convert NodeListOf<Element> to Array for iteration
      // @ts-ignore - detailItems is NodeList at runtime
      Array.from(detailItems).forEach((item) => {
        // 1. span.label과 span.value 구조 확인 (기존 로직)
        // @ts-ignore - item is Element at runtime
        const label = item.querySelector('span.label');
        // @ts-ignore - item is Element at runtime
        const value = item.querySelector('span.value');

        if (label && value) {
          const labelText = label.textContent?.trim().toLowerCase() || '';
          const valueText = value.textContent?.trim() || '';

          if (valueText) {
            if (labelText === 'manufacturer' || labelText.includes('company'))
              details.manufacturer = valueText;
            else if (labelText === 'vendor id' || labelText.includes('vid'))
              details.vid = valueText;
            else if (labelText === 'product id' || labelText.includes('pid'))
              details.pid = valueText;
            else if (labelText === 'family sku')
              details.familySku = valueText;
            else if (labelText === 'family variant sku')
              details.familyVariantSku = valueText;
            else if (labelText === 'firmware version')
              details.firmwareVersion = valueText;
            else if (labelText === 'hardware version')
              details.hardwareVersion = valueText;
            else if (labelText === 'certificate id' || labelText.includes('certification id'))
              details.certificateId = valueText;
            else if (labelText === 'certified date' || labelText.includes('certification date'))
              details.certificationDate = valueText;
            else if (labelText === 'family id')
              details.familyId = valueText;
            else if (labelText === 'tis/trp tested' || labelText.includes('tis') || labelText.includes('trp'))
              details.tisTrpTested = valueText;
            else if (labelText === 'specification version' || labelText.includes('spec version'))
              details.specificationVersion = valueText;
            else if (labelText === 'transport interface')
              details.transportInterface = valueText;
            else if (labelText === 'primary device type id' || labelText.includes('primary device'))
              details.primaryDeviceTypeId = valueText;
            else if (labelText === 'device type' || labelText.includes('product type') ||
              labelText.includes('category'))
              details.deviceType = valueText;
          }
        }
        // 2. 개선된 로직: 콜론(:) 분리 처리
        else {
          // @ts-ignore - item is Element at runtime
          const fullText = item.textContent?.trim() || '';
          const colonIndex = fullText.indexOf(':');
          
          if (colonIndex > 0) {
            const rawLabel = fullText.substring(0, colonIndex).trim().toLowerCase();
            let rawValue = fullText.substring(colonIndex + 1).trim();
            
            // 라벨 타입 인식
            if (rawLabel.includes('manufacturer') || rawLabel.includes('company')) {
              details.manufacturer = rawValue;
            }
            else if (rawLabel.includes('vendor') || rawLabel.includes('vid')) {
              details.vid = rawValue;
            }
            else if (rawLabel.includes('product id') || rawLabel.includes('pid')) {
              details.pid = rawValue;
            }
            else if (rawLabel.includes('family sku')) {
              details.familySku = rawValue;
            }
            else if (rawLabel.includes('family variant sku')) {
              details.familyVariantSku = rawValue;
            }
            else if (rawLabel.includes('firmware version') || 
                    (rawLabel.includes('firmware') && !rawLabel.includes('hardware'))) {
              details.firmwareVersion = rawValue;
            }
            else if (rawLabel.includes('hardware version') || 
                    (rawLabel.includes('hardware') && !rawLabel.includes('firmware'))) {
              details.hardwareVersion = rawValue;
            }
            else if (rawLabel.includes('certificate') || rawLabel.includes('cert id')) {
              // 인증 ID 패턴 확인 (특수 형식)
              const match = rawValue.match(/([A-Za-z0-9-]+\d+[-][A-Za-z0-9-]+)/);
              if (match) details.certificateId = match[1];
              else details.certificateId = rawValue;
            }
            else if (rawLabel.includes('certification date') || 
                    (rawLabel.includes('date') && rawLabel.includes('cert'))) {
              details.certificationDate = rawValue;
            }
            else if (rawLabel.includes('family id')) {
              details.familyId = rawValue;
            }
            else if ((rawLabel.includes('tis') && rawLabel.includes('trp')) || 
                    rawLabel.includes('tis/trp')) {
              details.tisTrpTested = rawValue;
            }
            else if (rawLabel.includes('specification version') || rawLabel.includes('spec version')) {
              details.specificationVersion = rawValue;
            }
            else if (rawLabel.includes('transport interface')) {
              details.transportInterface = rawValue;
            }
            else if (rawLabel.includes('primary device type') || rawLabel.includes('device type id')) {
              details.primaryDeviceTypeId = rawValue;
            }
            else if (rawLabel.includes('device type') || rawLabel.includes('product type') || 
                    rawLabel.includes('category')) {
              details.deviceType = rawValue;
            }
          }
        }
      });

      return details;
    }

    function extractApplicationCategories(deviceType: string | undefined): string[] {
      const appCategories: string[] = [];
      // @ts-ignore - document is available at runtime
      const appCategoriesSection = Array.from(document.querySelectorAll('h3')).find(
        // @ts-ignore - el is Element at runtime
        el => el.textContent?.trim().includes('Application Categories')
      );

      if (appCategoriesSection) {
        // @ts-ignore - appCategoriesSection is Element at runtime
        const parentDiv = appCategoriesSection.parentElement;
        if (parentDiv) {
          // @ts-ignore - parentDiv is Element at runtime
          const listItems = parentDiv.querySelectorAll('ul li');
          if (listItems.length > 0) {
            // @ts-ignore - listItems is NodeList at runtime
            Array.from(listItems).forEach(li => {
              // @ts-ignore - li is Element at runtime
              const category = li.textContent?.trim();
              if (category) appCategories.push(category);
            });
          }
        }
      }

      const currentDeviceType = deviceType || 'Matter Device';
      if (appCategories.length === 0 && currentDeviceType !== 'Matter Device') {
        appCategories.push(currentDeviceType);
      } else if (appCategories.length === 0) {
        appCategories.push('Matter Device');
      }

      return appCategories;
    }

    function extractManufacturerInfo(output: typeof extractedFields, details: ProductDetails, productTitle: string): void {
      let manufacturer = details.manufacturer || output.manufacturer || '';
      const knownManufacturers = ['Govee', 'Philips', 'Samsung', 'Apple', 'Google', 'Amazon', 'Aqara', 'LG', 'IKEA', 'Belkin', 'Eve', 'Nanoleaf', 'GE', 'Cync', 'Tapo', 'TP-Link', 'Signify', 'Haier', 'WiZ'];

      if (!manufacturer) {
        for (const brand of knownManufacturers) {
          if (productTitle.toLowerCase().includes(brand.toLowerCase())) {
            manufacturer = brand;
            break;
          }
        }
      }

      if (!manufacturer) {
        // @ts-ignore - document is available at runtime
        const companyInfo = document.querySelector('.company-info')?.textContent?.trim() ||
          // @ts-ignore - document is available at runtime
          document.querySelector('.manufacturer')?.textContent?.trim() || '';
        if (companyInfo) {
          manufacturer = companyInfo;
        }
      }

      if (!manufacturer) {
        // @ts-ignore - document is available at runtime
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (text.toLowerCase().includes('manufacturer') || text.toLowerCase().includes('company')) {
            const parts = text.split(':');
            if (parts.length > 1) {
              manufacturer = parts[1].trim();
              break;
            }
          }
        }
      }

      output.manufacturer = manufacturer || 'Unknown';
    }

    function extractDeviceTypeInfo(output: typeof extractedFields, details: ProductDetails, productTitle: string): void {
      let deviceType = details.deviceType || output.deviceType || 'Matter Device';

      if (deviceType === 'Matter Device') {
        // @ts-ignore - document is available at runtime
        const deviceTypeEl = document.querySelector('.category-link');
        // @ts-ignore - deviceTypeEl is Element at runtime
        if (deviceTypeEl && deviceTypeEl.textContent) {
          deviceType = deviceTypeEl.textContent.trim();
        }
      }

      if (deviceType === 'Matter Device') {
        const deviceTypes = [
          'Light Bulb', 'Smart Switch', 'Door Lock', 'Thermostat',
          'Motion Sensor', 'Smart Plug', 'Hub', 'Gateway', 'Camera',
          'Smoke Detector', 'Outlet', 'Light', 'Door', 'Window',
          'Sensor', 'Speaker', 'Display'
        ];

        // @ts-ignore - document is available at runtime
        const allText = (document.body.textContent || '').toLowerCase();
        const lowerProductTitle = productTitle.toLowerCase();
        
        for (const type of deviceTypes) {
          if (allText.includes(type.toLowerCase()) || lowerProductTitle.includes(type.toLowerCase())) {
            deviceType = type;
            break;
          }
        }
      }
      output.deviceType = deviceType;
    }

    function extractCertificationInfo(output: typeof extractedFields, details: ProductDetails): void {
      let certificationId = details.certificateId || output.certificateId || '';
      if (!certificationId) {
        // @ts-ignore - document is available at runtime
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          // @ts-ignore - li is Element at runtime
          const text = li.textContent || '';
          if (text.toLowerCase().includes('certification') || text.toLowerCase().includes('certificate') ||
            text.toLowerCase().includes('cert id')) {
            // 더 유연한 인증 ID 패턴 매칭
            const match = text.match(/([A-Za-z0-9-]+\d+[-][A-Za-z0-9-]+)/);
            if (match) {
              certificationId = match[1];
              break;
            }

            // 콜론 뒤의 값 추출 로직 강화
            const parts = text.split(':');
            if (parts.length > 1) {
              // 여러 콜론이 있을 경우 첫 번째 콜론 이후의 모든 텍스트
              certificationId = parts.slice(1).join(':').trim();
              break;
            }
          }
        }
      }
      output.certificateId = certificationId;

      let certificationDate = details.certificationDate || '';
      if (!certificationDate) {
        // @ts-ignore - document is available at runtime
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          // @ts-ignore - li is Element at runtime
          const text = li.textContent || '';
          if (text.toLowerCase().includes('date')) {
            // 더 강화된 날짜 패턴 매칭
            const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
            if (dateMatch) {
              certificationDate = dateMatch[0];
              break;
            }

            // 콜론 뒤의 값 추출 로직 강화
            const parts = text.split(':');
            if (parts.length > 1) {
              // 여러 콜론이 있을 경우 첫 번째 콜론 이후의 모든 텍스트를 가져옴
              certificationDate = parts.slice(1).join(':').trim();
              break;
            }
          }
        }
      }

      if (!certificationDate) {
        certificationDate = new Date().toISOString().split('T')[0];
      }
      output.certificationDate = certificationDate;
    }

    function extractVersionInfo(output: typeof extractedFields, details: ProductDetails): void {
      let softwareVersion = details.firmwareVersion || details.softwareVersion || '';
      let hardwareVersion = details.hardwareVersion || '';

      if (!softwareVersion || !hardwareVersion) {
        // @ts-ignore - document is available at runtime
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (!softwareVersion && (text.toLowerCase().includes('software') || text.toLowerCase().includes('firmware'))) {
            // 버전 패턴 매칭 강화
            const versionMatch = text.match(/v?(\d+(\.\d+)+)/i);
            if (versionMatch) {
              softwareVersion = versionMatch[0];
            } else {
              const parts = text.split(':');
              if (parts.length > 1) {
                softwareVersion = parts.slice(1).join(':').trim();
              }
            }
          }
          if (!hardwareVersion && text.toLowerCase().includes('hardware')) {
            // 버전 패턴 매칭 강화
            const versionMatch = text.match(/v?(\d+(\.\d+)+)/i);
            if (versionMatch) {
              hardwareVersion = versionMatch[0];
            } else {
              const parts = text.split(':');
              if (parts.length > 1) {
                hardwareVersion = parts.slice(1).join(':').trim();
              }
            }
          }
        }
      }
      output.softwareVersion = softwareVersion;
      output.hardwareVersion = hardwareVersion;
      output.firmwareVersion = details.firmwareVersion || softwareVersion;
    }

    function extractHardwareIds(output: typeof extractedFields, details: ProductDetails): void {
      let vid = details.vid || '';
      let pid = details.pid || '';

      if (!vid || !pid) {
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (!vid && (text.toLowerCase().includes('vendor id') || text.toLowerCase().includes('vid'))) {
            // 벤더 ID 패턴 매칭 (예: 0xXXXX 또는 단순 숫자)
            const vidMatch = text.match(/(0x[0-9A-Fa-f]+)|([0-9A-Fa-f]{1,6})/i);
            if (vidMatch) {
              vid = vidMatch[0];
            } else {
              const parts = text.split(':');
              if (parts.length > 1) {
                vid = parts.slice(1).join(':').trim();
              }
            }
          }
          if (!pid && (text.toLowerCase().includes('product id') || text.toLowerCase().includes('pid'))) {
            // 제품 ID 패턴 매칭 (예: 0xXXXX 또는 단순 숫자)
            const pidMatch = text.match(/(0x[0-9A-Fa-f]+)|([0-9A-Fa-f]{1,6})/i);
            if (pidMatch) {
              pid = pidMatch[0];
            } else {
              const parts = text.split(':');
              if (parts.length > 1) {
                pid = parts.slice(1).join(':').trim();
              }
            }
          }
        }
      }
      
      // 브라우저에서는 직접 normalizeHexId 함수를 사용할 수 없으므로
      // 인라인으로 정규화 로직 구현
      function normalizeHexIdInBrowser(value: string): string {
        if (!value || ['', 'n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim())) {
          return value;
        }
        
        const trimmedValue = value.trim();
        
        // 이미 정규화된 형식인지 확인 (0xXXXX 형식)
        const normalizedRegex = /^0x[0-9A-F]{4}$/;
        if (normalizedRegex.test(trimmedValue)) {
          return trimmedValue;
        }
        
        let hexValue: string;
        
        // 0x 접두사가 있는 16진수 (대소문자 구분 없음)
        if (/^0x[0-9A-Fa-f]+$/i.test(trimmedValue)) {
          // 0x 뒤의 16진수 부분만 추출
          hexValue = trimmedValue.substring(2).toUpperCase();
        } 
        // 16진수처럼 보이는 문자열 (숫자와 A-F로만 구성, 0x 접두사 없음)
        else if (/^[0-9A-Fa-f]+$/i.test(trimmedValue)) {
          hexValue = trimmedValue.toUpperCase();
        } 
        // 순수 10진수로 보이는 값
        else if (/^\d+$/.test(trimmedValue)) {
          try {
            // 10진수를 16진수로 변환 (앞에 0x 제외)
            hexValue = parseInt(trimmedValue, 10).toString(16).toUpperCase();
          } catch (e) {
            // 변환 실패 시 원본 값 반환
            return value;
          }
        } 
        // 그 외의 경우 변환 불가
        else {
          return value;
        }
        
        // 4자리로 패딩 (0 채우기)
        hexValue = hexValue.padStart(4, '0');
        
        // 최대 4자리만 유지 (초과하는 경우 잘라냄)
        if (hexValue.length > 4) {
          hexValue = hexValue.substring(hexValue.length - 4);
        }
        
        // 최종 형식으로 반환 (0x + 4자리 대문자 16진수)
        return `0x${hexValue}`;
      }
      
      // VID/PID 정규화 적용
      if (vid) {
        output.vid = normalizeHexIdInBrowser(vid);
      }
      
      if (pid) {
        output.pid = normalizeHexIdInBrowser(pid);
      }
    }

    /**
     * 쉼표로 구분된 여러 primaryDeviceTypeId 값을 표준 16진수 형식으로 정규화
     * @param value 콤마로 구분된 원본 primaryDeviceTypeId 값
     * @returns 콤마로 구분된 정규화된 ID 문자열
     */
    function normalizePrimaryDeviceTypeIds(value: string | undefined): string | undefined {
      if (!value) return value;
      
      // 쉼표로 구분된 각 ID 처리
      const idList = value.split(',').map(id => id.trim());
      
      // 각 ID를 개별적으로 정규화
      const normalizedIds = idList.map(id => {
        if (!id || ['', 'n/a', '-', 'none', 'unknown'].includes(id.toLowerCase().trim())) {
          return id;
        }
        
        const trimmedValue = id.trim();
        
        // 이미 정규화된 형식인지 확인 (0xXXXX 형식)
        const normalizedRegex = /^0x[0-9A-F]{4}$/;
        if (normalizedRegex.test(trimmedValue)) {
          return trimmedValue;
        }
        
        let hexValue: string;
        
        // 0x 접두사가 있는 16진수 (대소문자 구분 없음)
        if (/^0x[0-9A-Fa-f]+$/i.test(trimmedValue)) {
          // 0x 뒤의 16진수 부분만 추출
          hexValue = trimmedValue.substring(2).toUpperCase();
        } 
        // 16진수처럼 보이는 문자열 (숫자와 A-F로만 구성, 0x 접두사 없음)
        else if (/^[0-9A-Fa-f]+$/i.test(trimmedValue)) {
          hexValue = trimmedValue.toUpperCase();
        } 
        // 순수 10진수로 보이는 값
        else if (/^\d+$/.test(trimmedValue)) {
          try {
            // 10진수를 16진수로 변환 (앞에 0x 제외)
            hexValue = parseInt(trimmedValue, 10).toString(16).toUpperCase();
          } catch (e) {
            // 변환 실패 시 원본 값 반환
            return id;
          }
        } 
        // 그 외의 경우 변환 불가
        else {
          return id;
        }
        
        // 4자리로 패딩 (0 채우기)
        hexValue = hexValue.padStart(4, '0');
        
        // 최대 4자리만 유지 (초과하는 경우 잘라냄)
        if (hexValue.length > 4) {
          hexValue = hexValue.substring(hexValue.length - 4);
        }
        
        // 최종 형식으로 반환 (0x + 4자리 대문자 16진수)
        return `0x${hexValue}`;
      });
      
      // 정규화된 모든 ID를 다시 결합
      return normalizedIds.filter(Boolean).join(', ');
    }

    function extractAdditionalInfo(output: typeof extractedFields, details: ProductDetails): void {
      output.familySku = details.familySku || '';
      output.familyVariantSku = details.familyVariantSku || '';
      output.familyId = details.familyId || '';
      output.tisTrpTested = details.tisTrpTested || '';
      output.specificationVersion = details.specificationVersion || '';
      output.transportInterface = details.transportInterface || '';
      
      // primaryDeviceTypeId 정규화 적용
      if (details.primaryDeviceTypeId) {
        output.primaryDeviceTypeId = normalizePrimaryDeviceTypeIds(details.primaryDeviceTypeId);
      } else {
        output.primaryDeviceTypeId = '';
      }
    }

    // 실행 로직
    const productTitle = extractProductTitle();
    if (productTitle && productTitle !== 'Unknown Product' && productTitle !== extractedFields.model) {
      extractedFields.model = productTitle;
    }

    const tableDetails = extractDetailsFromTable();
    const structuredDetails = extractDetailValues();
    const combinedDetails = { ...tableDetails, ...structuredDetails };

    extractManufacturerInfo(extractedFields, combinedDetails, productTitle);
    extractDeviceTypeInfo(extractedFields, combinedDetails, productTitle);
    extractCertificationInfo(extractedFields, combinedDetails);
    extractVersionInfo(extractedFields, combinedDetails);
    extractHardwareIds(extractedFields, combinedDetails);
    extractAdditionalInfo(extractedFields, combinedDetails);
    
    extractedFields.applicationCategories = extractApplicationCategories(extractedFields.deviceType);

    // 중복 제거: certificateId가 baseProduct와 동일하면서 다른 정보가 추출된 경우
    if (extractedFields.certificateId && extractedFields.certificateId === baseProductForContext.certificateId) {
      delete extractedFields.certificateId;
    }

    return extractedFields;
  }
}