/**
 * MatterProductParser.ts
 * Matter 제품 상세 정보를 웹 페이지 DOM에서 추출하는 파서 클래스
 */

import type { Product, MatterProduct } from '../../../../types.d.ts';

/**
 * Matter 제품 상세 정보를 웹 페이지 DOM에서 추출하는 파서 클래스
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
        const el = document.querySelector(selector);
        return el ? el.textContent?.trim() || '' : '';
      };

      return getText('h1.entry-title') || getText('h1') || 'Unknown Product';
    }

    function extractDetailsFromTable(): ProductDetails {
      const details: ProductDetails = {};
      const infoTable = document.querySelector('.product-certificates-table');
      if (!infoTable) return details;

      const rows = infoTable.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const key = cells[0].textContent?.trim().toLowerCase() || '';
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
      const detailItems = document.querySelectorAll('.entry-product-details div ul li');

      for (const item of detailItems) {
        const label = item.querySelector('span.label');
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
      }

      return details;
    }

    function extractApplicationCategories(deviceType: string | undefined): string[] {
      const appCategories: string[] = [];
      const appCategoriesSection = Array.from(document.querySelectorAll('h3')).find(
        el => el.textContent?.trim().includes('Application Categories')
      );

      if (appCategoriesSection) {
        const parentDiv = appCategoriesSection.parentElement;
        if (parentDiv) {
          const listItems = parentDiv.querySelectorAll('ul li');
          if (listItems.length > 0) {
            Array.from(listItems).forEach(li => {
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
        const companyInfo = document.querySelector('.company-info')?.textContent?.trim() ||
          document.querySelector('.manufacturer')?.textContent?.trim() || '';
        if (companyInfo) {
          manufacturer = companyInfo;
        }
      }

      if (!manufacturer) {
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
        const deviceTypeEl = document.querySelector('.category-link');
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
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (text.toLowerCase().includes('certification') || text.toLowerCase().includes('certificate') ||
            text.toLowerCase().includes('cert id')) {
            const match = text.match(/([A-Za-z0-9-]+\d+[-][A-Za-z0-9]+)/);
            if (match) {
              certificationId = match[1];
              break;
            }

            const parts = text.split(':');
            if (parts.length > 1 && parts[1].trim()) {
              certificationId = parts[1].trim();
              break;
            }
          }
        }
      }
      output.certificateId = certificationId;

      let certificationDate = details.certificationDate || '';
      if (!certificationDate) {
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (text.toLowerCase().includes('date')) {
            const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
            if (dateMatch) {
              certificationDate = dateMatch[0];
              break;
            }

            const parts = text.split(':');
            if (parts.length > 1 && parts[1].trim()) {
              certificationDate = parts[1].trim();
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
        const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
        for (const li of detailsList) {
          const text = li.textContent || '';
          if (!softwareVersion && (text.toLowerCase().includes('software') || text.toLowerCase().includes('firmware'))) {
            const parts = text.split(':');
            if (parts.length > 1) {
              softwareVersion = parts[1].trim();
            }
          }
          if (!hardwareVersion && text.toLowerCase().includes('hardware')) {
            const parts = text.split(':');
            if (parts.length > 1) {
              hardwareVersion = parts[1].trim();
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
            const parts = text.split(':');
            if (parts.length > 1) {
              vid = parts[1].trim();
            }
          }
          if (!pid && (text.toLowerCase().includes('product id') || text.toLowerCase().includes('pid'))) {
            const parts = text.split(':');
            if (parts.length > 1) {
              pid = parts[1].trim();
            }
          }
        }
      }
      output.vid = vid;
      output.pid = pid;
    }

    function extractAdditionalInfo(output: typeof extractedFields, details: ProductDetails): void {
      output.familySku = details.familySku || '';
      output.familyVariantSku = details.familyVariantSku || '';
      output.familyId = details.familyId || '';
      output.tisTrpTested = details.tisTrpTested || '';
      output.specificationVersion = details.specificationVersion || '';
      output.transportInterface = details.transportInterface || '';
      output.primaryDeviceTypeId = details.primaryDeviceTypeId || '';
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