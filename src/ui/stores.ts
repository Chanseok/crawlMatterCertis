import { atom, map } from 'nanostores';
import { AppMode, CrawlingStatus, LogEntry, CrawlingProgress, DatabaseSummary, ProductDetail } from './types';
import { getPlatformApi, updateApiForAppMode } from './platform/api';

// 앱 모드 상태 관리
export const appModeStore = atom<AppMode>('development');

// 크롤링 상태 관리
export const crawlingStatusStore = atom<CrawlingStatus>('idle');

// 크롤링 진행 상태 관리
export const crawlingProgressStore = map<CrawlingProgress>({
  status: 'idle',
  currentPage: 0,
  totalPages: 0,
  processedItems: 0,
  totalItems: 0,
  startTime: Date.now(),
  estimatedEndTime: 0,
  newItems: 0,
  updatedItems: 0,
  percentage: 0,
  currentStep: '',
  elapsedTime: 0
});

// 로그 항목 관리
export const logsStore = atom<LogEntry[]>([]);

// 제품 데이터 관리
export const productsStore = atom<ProductDetail[]>([]);

// 선택된 제품 ID 관리
export const selectedProductIdStore = atom<string | null>(null);

// 검색어 관리
export const searchQueryStore = atom<string>('');

// 데이터베이스 요약정보 관리
export const databaseSummaryStore = map<DatabaseSummary>({
  totalProducts: 0,
  productCount: 0, // productCount 속성 추가
  lastUpdated: null,
  newlyAddedCount: 0
});

// API 참조
let api = getPlatformApi();

// 이벤트 구독 해제 함수를 저장하는 배열
let unsubscribeFunctions: (() => void)[] = [];

// API 구독 설정
export function initializeApiSubscriptions() {
  // 기존 구독이 있으면 모두 해제
  unsubscribeAll();
  
  // 크롤링 진행 상황 구독
  const unsubProgress = api.subscribeToEvent('crawlingProgress', (progress) => {
    crawlingProgressStore.set({
      ...crawlingProgressStore.get(),
      ...progress
    });
  });
  unsubscribeFunctions.push(unsubProgress);

  // 크롤링 완료 이벤트 구독
  const unsubComplete = api.subscribeToEvent('crawlingComplete', ({ success, count }) => {
    if (success) {
      crawlingStatusStore.set('completed');
      addLog(`크롤링이 완료되었습니다. 총 ${count}개의 항목이 수집되었습니다.`, 'success');
    } else {
      crawlingStatusStore.set('error');
      addLog('크롤링 중 오류가 발생했습니다.', 'error');
    }
  });
  unsubscribeFunctions.push(unsubComplete);

  // 크롤링 오류 이벤트 구독
  const unsubError = api.subscribeToEvent('crawlingError', ({ message, details }) => {
    crawlingStatusStore.set('error');
    addLog(`크롤링 오류: ${message}`, 'error');
    if (details) {
      addLog(`상세 정보: ${details}`, 'error');
    }
  });
  unsubscribeFunctions.push(unsubError);

  // 데이터베이스 요약 정보 구독
  const unsubDbSummary = api.subscribeToEvent('dbSummary', (summary) => {
    databaseSummaryStore.set(summary);
  });
  unsubscribeFunctions.push(unsubDbSummary);
  
  // 제품 데이터 변경 구독
  const unsubProducts = api.subscribeToEvent('products', (products) => {
    productsStore.set(products);
  });
  unsubscribeFunctions.push(unsubProducts);

  // 초기 데이터 로드
  loadInitialData();
}

// 모든 구독 해제
function unsubscribeAll() {
  if (unsubscribeFunctions.length > 0) {
    console.log(`Unsubscribing from ${unsubscribeFunctions.length} event listeners`);
    unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    unsubscribeFunctions = [];
  }
}

// 초기 데이터 로드
async function loadInitialData() {
  try {
    // 데이터베이스 요약 정보 가져오기
    const dbSummary = await api.invokeMethod('getDatabaseSummary')
      .catch(err => {
        console.warn('Failed to load database summary:', err);
        return {
          totalProducts: 0,
          productCount: 0,
          lastUpdated: null,
          newlyAddedCount: 0
        };
      });
      
    databaseSummaryStore.set(dbSummary);
    
    // 제품 목록 가져오기 - 매개변수 형식을 수정하여 정확히 일치시킴
    const { products, total } = await api.invokeMethod('getProducts', { page: 1, limit: 100 })
      .catch(err => {
        console.warn('Failed to load products:', err);
        return { products: [], total: 0 };
      });
      
    console.log('Products loaded from database:', products && products.length);
    productsStore.set(products);
    
    if (products.length > 0) {
      addLog(`데이터베이스에서 ${products.length}개의 제품 정보를 불러왔습니다. (총 ${total}개 중)`, 'info');
    } else {
      addLog('데이터베이스에 제품 정보가 없습니다. 크롤링을 시작하여 데이터를 수집하세요.', 'info');
    }
  } catch (error) {
    console.error('Error loading initial data:', error);
    addLog(`초기 데이터 로드 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 로그 추가 함수
export function addLog(message: string, type: LogEntry['type'] = 'info'): void {
  const logEntry: LogEntry = {
    timestamp: new Date(),
    message,
    type
  };
  
  logsStore.set([...logsStore.get(), logEntry]);
}

// 크롤링 상태 업데이트 함수
export function updateCrawlingProgress(progress: Partial<CrawlingProgress>): void {
  crawlingProgressStore.set({
    ...crawlingProgressStore.get(),
    ...progress
  });
}

// 크롤링 시작 함수
export async function startCrawling(): Promise<void> {
  try {
    crawlingStatusStore.set('running');
    addLog('크롤링을 시작합니다...', 'info');
    
    // API를 통해 크롤링 시작
    const { success } = await api.invokeMethod('startCrawling', { 
      mode: appModeStore.get()
    });
    
    if (!success) {
      crawlingStatusStore.set('error');
      addLog('크롤링을 시작할 수 없습니다.', 'error');
    }
  } catch (error) {
    crawlingStatusStore.set('error');
    addLog(`크롤링 시작 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 크롤링 중지 함수
export async function stopCrawling(): Promise<void> {
  try {
    addLog('크롤링을 중지합니다...', 'warning');
    
    // API를 통해 크롤링 중지
    const { success } = await api.invokeMethod('stopCrawling');
    
    if (success) {
      crawlingStatusStore.set('paused');
      addLog('크롤링이 중지되었습니다.', 'warning');
    } else {
      addLog('크롤링을 중지할 수 없습니다.', 'error');
    }
  } catch (error) {
    addLog(`크롤링 중지 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 데이터 내보내기 함수
export async function exportToExcel(path?: string): Promise<void> {
  try {
    addLog('데이터를 Excel로 내보내는 중...', 'info');
    
    // API를 통해 내보내기 실행
    const { success, path: savePath } = await api.invokeMethod('exportToExcel', { path });
    
    if (success && savePath) {
      addLog(`데이터를 성공적으로 내보냈습니다: ${savePath}`, 'success');
    } else {
      addLog('데이터 내보내기에 실패했습니다.', 'error');
    }
  } catch (error) {
    addLog(`데이터 내보내기 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 제품 검색 함수
export async function searchProducts(query: string = '', page: number = 1, limit: number = 100): Promise<void> {
  try {
    const { products, total } = await api.invokeMethod('getProducts', { 
      search: query,
      page,
      limit 
    });
    
    productsStore.set(products);
    
    if (query) {
      addLog(`검색 결과: ${products.length}개 항목 (총 ${total}개 중)`, 'info');
    }
  } catch (error) {
    addLog(`제품 검색 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 앱 모드 전환 함수
export function toggleAppMode(): void {
  const currentMode = appModeStore.get();
  const newMode = currentMode === 'development' ? 'production' : 'development';
  
  appModeStore.set(newMode);
  
  // 모드 변경에 따라 API 재초기화
  api = updateApiForAppMode(newMode);
  
  // 구독 및 데이터 다시 로드
  initializeApiSubscriptions();
  
  addLog(`앱 모드가 ${newMode === 'development' ? '개발' : '실사용'} 모드로 변경되었습니다.`, 'info');
}