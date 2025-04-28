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
    url: 'https://csa-iot.org/csa-iot_products/philips-43pus8909/', // Added mock data
    pageId: 1, // Added mock data
    indexInPage: 0, // Added mock data
    manufacturer: 'MMD HONG KONG HOLDING LIMITED',
    model: 'Philips 43PUS8909',
    certificateId: 'CSA244D4MAT43911-00',
  },
  {
    url: 'https://csa-iot.org/csa-iot_products/tuya-wifi-bulb-rgbcw/', // Added mock data
    pageId: 1, // Added mock data
    indexInPage: 1, // Added mock data
    manufacturer: 'Tuya Global Inc.',
    model: 'Wi-Fi Bulb RGBCW',
    certificateId: 'CSA22042MAT40042-24',
  },
  {
    url: 'https://csa-iot.org/csa-iot_products/samsung-smartthings-hub/', // Added mock data
    pageId: 1, // Added mock data
    indexInPage: 2, // Added mock data
    manufacturer: 'Samsung Electronics',
    model: 'SmartThings Hub',
    certificateId: 'CSA25012MAT50123-01',

  },
  {
    url: 'https://csa-iot.org/csa-iot_products/apple-homepod-mini/', // Added mock data
    pageId: 1, // Added mock data
    indexInPage: 3, // Added mock data
    manufacturer: 'Apple Inc.',
    model: 'HomePod mini',
    certificateId: 'CSA24531MAT60789-00',
    
  },
  {
    url: 'https://csa-iot.org/csa-iot_products/google-nest-thermostat/', // Added mock data
    pageId: 1, // Added mock data
    indexInPage: 4, // Added mock data
    manufacturer: 'Google LLC',
    model: 'Nest Thermostat',
    certificateId: 'CSA25118MAT70456-02',
    
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

  // const interfaces = [
  //   'Wi-Fi', 'Thread', 'Ethernet', 'Zigbee', 'Bluetooth'
  // ];

  const additionalProducts: MatterProduct[] = [];

  for (let i = 0; i < count; i++) {
    const manufacturer = manufacturers[Math.floor(Math.random() * manufacturers.length)];
    const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
    const model = `${manufacturer.split(' ')[0]} ${deviceType} ${Math.floor(Math.random() * 1000)}`;
    const pageId = Math.floor(i / 10) + 2; // Example logic for pageId
    const indexInPage = i % 10; // Example logic for indexInPage

    const product: MatterProduct = {
      url: `https://csa-iot.org/csa-iot_products/mock-${nanoid(5)}/`, // Added mock data
      pageId, // Added mock data
      indexInPage, // Added mock data
      manufacturer,
      model,
      certificateId: `CSA${Math.floor(10000 + Math.random() * 90000)}MAT${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      
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
  productCount: allMockProducts.length, // Add missing productCount property
  lastUpdated: new Date(Date.now() - 86400000), // 어제
  newlyAddedCount: 5
};

// 초기 크롤링 진행 상황 (CrawlingProgress 타입에 맞게 수정)
export const initialCrawlingProgress: CrawlingProgress = {
  status: 'idle',
  currentPage: 0,
  totalPages: 0,
  processedItems: 0, // Use processedItems instead of current
  totalItems: 0,     // Use totalItems instead of total
  startTime: 0,
  estimatedEndTime: 0,
  newItems: 0,
  updatedItems: 0,
  percentage: 0,
  currentStep: '',
  elapsedTime: 0,
  remainingTime: undefined
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

  let processedItems = 0; // Use processedItems locally
  const totalItems = 100; // Use totalItems locally
  let elapsedTime = 0;
  const steps = ['준비 중...', '페이지 분석 중...', '제품 목록 수집 중...', '상세 정보 수집 중...', '데이터 저장 중...'];
  let currentStepIndex = 0;
  const startTime = Date.now(); // Record start time

  // 에러 발생 시뮬레이션 (20% 확률)
  const simulateError = Math.random() < 0.2;
  const errorAfter = simulateError ? Math.floor(Math.random() * 70) + 10 : -1;

  crawlingInterval = window.setInterval(() => {
    // 진행 상황 업데이트
    processedItems += 1; // Update processedItems
    elapsedTime = (Date.now() - startTime) / 1000; // Calculate elapsed time in seconds

    // 단계 변경 로직
    if (processedItems === 10) currentStepIndex = 1;
    if (processedItems === 30) currentStepIndex = 2;
    if (processedItems === 60) currentStepIndex = 3;
    if (processedItems === 90) currentStepIndex = 4;

    const percentage = (processedItems / totalItems) * 100;
    const remainingTime = elapsedTime > 0 && processedItems > 0
      ? ((totalItems - processedItems) / processedItems) * elapsedTime
      : undefined;
    const estimatedEndTime = remainingTime !== undefined ? Date.now() + remainingTime * 1000 : 0;

    const progress: CrawlingProgress = {
      status: 'running',
      currentPage: Math.ceil(processedItems / 10), // Example logic
      totalPages: Math.ceil(totalItems / 10), // Example logic
      processedItems, // Use processedItems
      totalItems,     // Use totalItems
      startTime,
      estimatedEndTime,
      newItems: Math.floor(Math.random() * 5), // Example
      updatedItems: Math.floor(Math.random() * 2), // Example
      percentage: percentage,
      currentStep: steps[currentStepIndex],
      elapsedTime,
      remainingTime: remainingTime
    };

    onProgress(progress);

    // 에러 시뮬레이션
    if (processedItems === errorAfter && onError) {
      clearInterval(crawlingInterval!);
      crawlingInterval = null;
      // Update status on error
      onProgress({ ...progress, status: 'error' });
      onError('크롤링 중 오류가 발생했습니다.', '네트워크 연결 문제 또는 사이트 구조 변경으로 인한 오류일 수 있습니다.');
      return;
    }

    // 완료 처리
    if (processedItems >= totalItems) {
      clearInterval(crawlingInterval!);
      crawlingInterval = null;
      // Update status on complete
      onProgress({ ...progress, status: 'completed', percentage: 100 });
      onComplete(true, allMockProducts.length);
    }
  }, 500);

  // 중지 함수 반환
  return () => {
    if (crawlingInterval !== null) {
      clearInterval(crawlingInterval);
      crawlingInterval = null;
      // Optionally update status to 'stopped' or 'paused' here
      // Example: onProgress({ ...initialCrawlingProgress, status: 'stopped' });
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
    product.manufacturer?.toLowerCase().includes(lowercaseQuery) ||
    product.model?.toLowerCase().includes(lowercaseQuery) ||
    product.certificateId?.toLowerCase().includes(lowercaseQuery)
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