/**
 * Mock 데이터 서비스
 * 
 * 이 파일은 백엔드 API가 구현되지 않았을 때 사용할 Mock 데이터를 제공합니다.
 * 개발 모드에서 사용되어 실제 API가 없어도 UI 개발이 가능하도록 지원합니다.
 */

import { MatterProduct, CrawlingProgress, DatabaseSummary } from "../types";
import { nanoid } from "nanoid";

// Mock 제품 데이터
export const mockProducts: MatterProduct[] = [
  {
    id: 'mock-1',
    manufacturer: 'MMD HONG KONG HOLDING LIMITED',
    model: 'Philips 43PUS8909',
    deviceType: 'Matter Device',
    certificationId: 'CSA244D4MAT43911-00',
    certificationDate: '2025-03-02',
    softwareVersion: 'TPN248E_V248.003.088.000',
    hardwareVersion: 'M0G',
    vid: '0x1358',
    pid: '0x8004',
    familySku: 'Philips 43PUS8909',
    familyVariantSku: '',
    firmwareVersion: 'TPN248E_V248.003.088.000',
    certificateId: 'CSA244D4MAT43911-00',
    familyId: 'FAM226196',
    tisTrpTested: 'No',
    specificationVersion: '1.2',
    transportInterface: 'Ethernet',
    primaryDeviceTypeId: '0x0028',
    applicationCategories: ['Matter Device']
  },
  {
    id: 'mock-2',
    manufacturer: 'Tuya Global Inc.',
    model: 'Wi-Fi Bulb RGBCW',
    deviceType: 'Light Bulb',
    certificationId: 'CSA22042MAT40042-24',
    certificationDate: '2025-02-15',
    softwareVersion: '1.0.5',
    hardwareVersion: 'V1.0',
    vid: '0x1002',
    pid: '0x1005',
    familySku: 'TY-BLB-RGBCW',
    familyVariantSku: '',
    firmwareVersion: '1.0.5',
    certificateId: 'CSA22042MAT40042-24',
    familyId: 'FAM220177',
    tisTrpTested: 'Yes',
    specificationVersion: '1.1',
    transportInterface: 'Wi-Fi',
    primaryDeviceTypeId: '0x0101',
    applicationCategories: ['Light Bulb', 'Smart Home']
  },
  {
    id: 'mock-3',
    manufacturer: 'Samsung Electronics',
    model: 'SmartThings Hub',
    deviceType: 'Hub Device',
    certificationId: 'CSA25012MAT50123-01',
    certificationDate: '2025-01-20',
    softwareVersion: '2.3.1',
    hardwareVersion: 'V3.0',
    vid: '0x1A2B',
    pid: '0x3C4D',
    familySku: 'SM-HUB-3',
    familyVariantSku: '',
    firmwareVersion: '2.3.1',
    certificateId: 'CSA25012MAT50123-01',
    familyId: 'FAM225502',
    tisTrpTested: 'Yes',
    specificationVersion: '1.2',
    transportInterface: 'Ethernet, Zigbee, Z-Wave',
    primaryDeviceTypeId: '0x0050',
    applicationCategories: ['Hub', 'Controller']
  },
  {
    id: 'mock-4',
    manufacturer: 'Apple Inc.',
    model: 'HomePod mini',
    deviceType: 'Speaker',
    certificationId: 'CSA24531MAT60789-00',
    certificationDate: '2025-04-05',
    softwareVersion: '16.5.1',
    hardwareVersion: 'A2374',
    vid: '0x112A',
    pid: '0xA254',
    familySku: 'HomePod mini',
    familyVariantSku: '',
    firmwareVersion: '16.5.1',
    certificateId: 'CSA24531MAT60789-00',
    familyId: 'FAM227801',
    tisTrpTested: 'Yes',
    specificationVersion: '1.2',
    transportInterface: 'Wi-Fi, Thread',
    primaryDeviceTypeId: '0x0023',
    applicationCategories: ['Speaker', 'Voice Assistant']
  },
  {
    id: 'mock-5',
    manufacturer: 'Google LLC',
    model: 'Nest Thermostat',
    deviceType: 'Thermostat',
    certificationId: 'CSA25118MAT70456-02',
    certificationDate: '2025-03-28',
    softwareVersion: '4.2.0',
    hardwareVersion: 'T4000',
    vid: '0x5AA5',
    pid: '0xBB11',
    familySku: 'Nest Thermostat',
    familyVariantSku: 'Gen 4',
    firmwareVersion: '4.2.0',
    certificateId: 'CSA25118MAT70456-02',
    familyId: 'FAM229103',
    tisTrpTested: 'Yes',
    specificationVersion: '1.2',
    transportInterface: 'Wi-Fi, Thread',
    primaryDeviceTypeId: '0x0301',
    applicationCategories: ['Thermostat', 'Climate Control']
  }
];

// 더 많은 Mock 제품 데이터 생성 (검색 기능 테스트용)
export const generateMoreMockProducts = (count: number = 20): MatterProduct[] => {
  const manufacturers = [
    'Samsung Electronics', 'LG Electronics', 'Apple Inc.', 'Google LLC', 
    'Amazon', 'Philips', 'Tuya Global Inc.', 'Xiaomi', 'IKEA', 'Belkin'
  ];
  
  const deviceTypes = [
    'Light Bulb', 'Smart Switch', 'Smart Plug', 'Sensor', 
    'Hub Device', 'Thermostat', 'Lock', 'Speaker', 'TV', 'Camera'
  ];
  
  const interfaces = [
    'Wi-Fi', 'Thread', 'Ethernet', 'Zigbee', 'Bluetooth'
  ];
  
  const additionalProducts: MatterProduct[] = [];
  
  for (let i = 0; i < count; i++) {
    const manufacturer = manufacturers[Math.floor(Math.random() * manufacturers.length)];
    const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
    const model = `${manufacturer.split(' ')[0]} ${deviceType} ${Math.floor(Math.random() * 1000)}`;
    
    const product: MatterProduct = {
      id: `gen-${nanoid(8)}`,
      manufacturer,
      model,
      deviceType,
      certificationId: `CSA${Math.floor(10000 + Math.random() * 90000)}MAT${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      certificationDate: `2025-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      softwareVersion: `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 100)}`,
      hardwareVersion: `V${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 10)}`,
      vid: `0x${Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0')}`,
      pid: `0x${Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0')}`,
      familySku: model,
      familyVariantSku: Math.random() > 0.7 ? `Gen ${Math.floor(Math.random() * 5) + 1}` : '',
      firmwareVersion: `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 100)}`,
      certificateId: `CSA${Math.floor(10000 + Math.random() * 90000)}MAT${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      familyId: `FAM${Math.floor(100000 + Math.random() * 900000)}`,
      tisTrpTested: Math.random() > 0.5 ? 'Yes' : 'No',
      specificationVersion: `1.${Math.floor(Math.random() * 3)}`,
      transportInterface: interfaces.slice(0, Math.floor(Math.random() * 3) + 1).join(', '),
      primaryDeviceTypeId: `0x${Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0')}`,
      applicationCategories: [deviceType, ...(Math.random() > 0.5 ? ['Smart Home'] : [])]
    };
    
    additionalProducts.push(product);
  }
  
  return additionalProducts;
};

// 모든 Mock 제품 데이터
export const allMockProducts = [...mockProducts, ...generateMoreMockProducts(30)];

// Mock 데이터베이스 요약 정보
export const mockDatabaseSummary: DatabaseSummary = {
  totalProducts: allMockProducts.length,
  lastUpdated: new Date(Date.now() - 86400000), // 어제
  newlyAddedCount: 5
};

// 초기 크롤링 진행 상황
export const initialCrawlingProgress: CrawlingProgress = {
  current: 0,
  total: 0,
  percentage: 0,
  currentStep: '',
  elapsedTime: 0
};

// Mock 크롤링 시작 시뮬레이션
let crawlingInterval: number | null = null;
export const simulateCrawling = (
  onProgress: (progress: CrawlingProgress) => void,
  onComplete: (success: boolean, count: number) => void,
  onError?: (message: string, details?: string) => void
): (() => void) => {
  // 이미 진행 중인 경우 중단
  if (crawlingInterval !== null) {
    clearInterval(crawlingInterval);
  }
  
  let current = 0;
  const total = 100;
  let elapsedTime = 0;
  const steps = ['준비 중...', '페이지 분석 중...', '제품 목록 수집 중...', '상세 정보 수집 중...', '데이터 저장 중...'];
  let currentStepIndex = 0;
  
  // 에러 발생 시뮬레이션 (20% 확률)
  const simulateError = Math.random() < 0.2;
  const errorAfter = simulateError ? Math.floor(Math.random() * 70) + 10 : -1;
  
  crawlingInterval = window.setInterval(() => {
    // 진행 상황 업데이트
    current += 1;
    elapsedTime += 0.5;
    
    // 단계 변경 로직
    if (current === 10) currentStepIndex = 1;
    if (current === 30) currentStepIndex = 2;
    if (current === 60) currentStepIndex = 3;
    if (current === 90) currentStepIndex = 4;
    
    const progress: CrawlingProgress = {
      current,
      total,
      percentage: (current / total) * 100,
      currentStep: steps[currentStepIndex],
      elapsedTime,
      remainingTime: ((total - current) / current) * elapsedTime
    };
    
    onProgress(progress);
    
    // 에러 시뮬레이션
    if (current === errorAfter && onError) {
      clearInterval(crawlingInterval!);
      crawlingInterval = null;
      onError('크롤링 중 오류가 발생했습니다.', '네트워크 연결 문제 또는 사이트 구조 변경으로 인한 오류일 수 있습니다.');
      return;
    }
    
    // 완료 처리
    if (current >= total) {
      clearInterval(crawlingInterval!);
      crawlingInterval = null;
      onComplete(true, allMockProducts.length);
    }
  }, 500);
  
  // 중지 함수 반환
  return () => {
    if (crawlingInterval !== null) {
      clearInterval(crawlingInterval);
      crawlingInterval = null;
    }
  };
};

// 검색 기능 시뮬레이션
export const simulateSearch = (query: string, page: number = 1, limit: number = 20) => {
  // 검색어가 비어있으면 모든 항목 반환
  if (!query.trim()) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    return {
      products: allMockProducts.slice(startIndex, endIndex),
      total: allMockProducts.length
    };
  }
  
  // 검색어로 필터링
  const lowercaseQuery = query.toLowerCase();
  const filteredProducts = allMockProducts.filter(product => 
    product.manufacturer.toLowerCase().includes(lowercaseQuery) ||
    product.model.toLowerCase().includes(lowercaseQuery) ||
    product.deviceType.toLowerCase().includes(lowercaseQuery) ||
    product.certificationId.toLowerCase().includes(lowercaseQuery)
  );
  
  // 페이지네이션 적용
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return {
    products: filteredProducts.slice(startIndex, endIndex),
    total: filteredProducts.length
  };
};

// Excel 내보내기 시뮬레이션
export const simulateExportToExcel = () => {
  // 실제로는 파일을 생성하지 않지만, 성공 응답을 반환
  return {
    success: true,
    path: '/Users/username/Downloads/matter_certification_data.xlsx'
  };
};