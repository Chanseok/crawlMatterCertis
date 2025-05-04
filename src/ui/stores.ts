import { atom, map } from 'nanostores';
import { AppMode, CrawlingStatus, LogEntry, CrawlingProgress, DatabaseSummary, ProductDetail } from './types';
import { getPlatformApi, updateApiForAppMode } from './platform/api';
import type { ConcurrentCrawlingTask } from './types';
import { CrawlerConfig } from '../electron/ConfigManager';
import { getConfig, updateConfig } from './services/configService';

// 앱 모드 상태 관리
export const appModeStore = atom<AppMode>('development');

// 크롤링 상태 관리
export const crawlingStatusStore = atom<CrawlingStatus>('idle');

// 크롤링 진행 상태 관리
export const crawlingProgressStore = map<CrawlingProgress>({
  status: 'idle',
  current: 0,
  total: 0,
  percentage: 0,
  currentStep: '',
  elapsedTime: 0,
  currentPage: 0,
  totalPages: 0,
  processedItems: 0,
  totalItems: 0,
  startTime: Date.now(),
  estimatedEndTime: 0,
  newItems: 0,
  updatedItems: 0,
  currentStage: 0, // 0=초기화, 1=목록 수집, 2=상세 수집
  message: '' // 사용자에게 표시할 메시지
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

// 크롤링 상태 요약 정보 관리
export interface CrawlingStatusSummary {
  dbLastUpdated: Date | null;
  dbProductCount: number;
  siteTotalPages: number;
  siteProductCount: number;
  diff: number;
  needCrawling: boolean;
  crawlingRange: { startPage: number; endPage: number };
}

// map의 타입은 object만 허용하므로 null 대신 빈 객체 사용
export const crawlingStatusSummaryStore = map<CrawlingStatusSummary>({} as CrawlingStatusSummary);
export const lastCrawlingStatusSummaryStore = map<CrawlingStatusSummary>({} as CrawlingStatusSummary);

// 동시 처리 작업 상태 관리 (예: 각 페이지별 크롤링 상태)
export const concurrentTasksStore = atom<ConcurrentCrawlingTask[]>([]);

// 작업별 상태 정보 저장 (task ID를 키로 사용)
export interface TaskStatusDetail {
  id: string | number;
  status: 'pending' | 'running' | 'success' | 'error' | 'stopped';
  details?: any;
  startTime?: number;
  endTime?: number;
  message?: string;
}

// 활성 작업 목록 저장 
export const activeTasksStore = map<Record<string | number, TaskStatusDetail>>({});

// 최근 완료된 작업 목록 (최대 10개 유지)
export const recentTasksStore = atom<TaskStatusDetail[]>([]);

// 설정 정보 관리
export const configStore = map<CrawlerConfig>({
  pageRangeLimit: 10,
  productListRetryCount: 9,
  productDetailRetryCount: 9
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
    // status 속성을 CrawlingStatus 타입으로 안전하게 변환
    const validStatus = validateCrawlingStatus(progress.status);
    
    // 진행 상황 업데이트 (타입 안전하게 처리)
    crawlingProgressStore.set({
      ...crawlingProgressStore.get(),
      ...progress,
      status: validStatus // 문자열을 CrawlingStatus 타입으로 변환하여 설정
    });
    
    // 단계별 로그 추가 (메시지가 있을 때만)
    if (progress.message) {
      // 메시지에서 중요한 상태 변경이나 단계 변경을 감지하여 로그에 추가
      if (progress.message.includes('1단계 완료') || 
          progress.message.includes('2단계 완료') ||
          progress.message.includes('크롤링 완료')) {
        addLog(progress.message, 'success');
      } else if (progress.message.includes('1단계:') || progress.message.includes('2단계:')) {
        // 상태 변경 시에만 로그 추가 (모든 진행 상황을 로그로 남기면 너무 많아짐)
        const currentStep = crawlingProgressStore.get().currentStep;
        if (currentStep !== progress.currentStep) {
          addLog(progress.message, 'info');
        }
      }
    }
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

  // 동시 작업 상태 실시간 구독
  const unsubConcurrentTasks = api.subscribeToEvent('crawlingTaskStatus', (taskStatus) => {
    // 기존 동시 작업 목록 업데이트
    if (Array.isArray(taskStatus)) {
      concurrentTasksStore.set(taskStatus);
    } else if (taskStatus) {
      // 개별 작업 상태 업데이트 (새로운 방식)
      const { taskId, status, message } = taskStatus as { taskId: number | string; status: string; message?: string };
      
      try {
        // 메시지 파싱 시도 (JSON이면 구조화된 정보로, 아니면 일반 텍스트로)
        let details = {};
        try {
          if (message && typeof message === 'string' && message.trim().startsWith('{')) {
            details = JSON.parse(message);
          } else {
            details = { description: message };
          }
        } catch (e) {
          details = { description: message };
        }
        
        // status 값을 안전하게 변환
        const validStatus = validateTaskStatus(status);
        
        // 작업 상태에 따라 처리
        if (validStatus === 'running' || validStatus === 'pending') {
          // 실행 중인 작업 목록에 추가/업데이트
          const activeTasks = {...activeTasksStore.get()};
          activeTasks[taskId] = {
            id: taskId,
            status: validStatus, // 변환된 status 사용
            details,
            startTime: Date.now(),
            message: typeof message === 'string' ? message : JSON.stringify(details)
          };
          activeTasksStore.set(activeTasks);
        } else {
          // 완료된 작업은 최근 작업 목록에 이동
          const finishedTask: TaskStatusDetail = {
            id: taskId,
            status: validStatus, // 변환된 status 사용
            details,
            startTime: (activeTasksStore.get()[taskId]?.startTime || Date.now()) - 1000,
            endTime: Date.now(),
            message: typeof message === 'string' ? message : JSON.stringify(details)
          };
          
          // 최근 작업 목록 앞에 추가하고 최대 10개만 유지
          const recentTasks = [...recentTasksStore.get()];
          recentTasks.unshift(finishedTask);
          if (recentTasks.length > 10) recentTasks.pop();
          recentTasksStore.set(recentTasks);
          
          // 완료된 작업을 활성 목록에서 제거
          const activeTasks = {...activeTasksStore.get()};
          delete activeTasks[taskId];
          activeTasksStore.set(activeTasks);
        }
      } catch (e) {
        console.error('Error processing task status:', e);
      }
    }
  });
  unsubscribeFunctions.push(unsubConcurrentTasks);

  // 크롤링 중단 시점까지의 내역을 로그로 남김
  const unsubStopped = api.subscribeToEvent('crawlingStopped', (tasks) => {
    concurrentTasksStore.set(tasks);
    addLog('크롤링이 중단되었습니다. 각 페이지별 상태:', 'warning');
    if (Array.isArray(tasks)) {
      tasks.forEach(task => {
        if (task.status === 'success') {
          addLog(`페이지 ${task.pageNumber}: 성공`, 'success');
        } else if (task.status === 'error') {
          addLog(`페이지 ${task.pageNumber}: 실패 (${task.error})`, 'error');
        } else if (task.status === 'stopped') {
          addLog(`페이지 ${task.pageNumber}: 중단됨`, 'warning');
        }
      });
    }
  });
  unsubscribeFunctions.push(unsubStopped);

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
    
    // 설정 로드 추가
    await loadConfig();
    
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

// 설정 로딩
export async function loadConfig(): Promise<void> {
  try {
    const config = await getConfig();
    configStore.set(config);
    addLog('설정을 로드했습니다.', 'info');
  } catch (error) {
    addLog(`설정 로드 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 설정 업데이트
export async function updateConfigSettings(newConfig: Partial<CrawlerConfig>): Promise<void> {
  try {
    const updatedConfig = await updateConfig(newConfig);
    configStore.set(updatedConfig);
    addLog('설정이 업데이트되었습니다.', 'success');
  } catch (error) {
    addLog(`설정 업데이트 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// CrawlingStatus 타입으로 안전하게 변환하는 헬퍼 함수
function validateCrawlingStatus(status: string | undefined): CrawlingStatus {
  if (!status) return 'idle'; // 기본값 
  
  // 허용된 상태 값 목록 (공유 타입 정의와 일치시킴)
  const validStatuses: CrawlingStatus[] = [
    'idle', 'running', 'paused', 'completed', 'error', 'initializing', 'stopped', 'completed_stage_1'
  ];
  
  // 허용된 값이면 그대로 반환, 아니면 기본값 반환
  return validStatuses.includes(status as CrawlingStatus) 
    ? (status as CrawlingStatus) 
    : 'running'; // 기본값으로 'running' 사용
}

// TaskStatusDetail의 status 값을 안전하게 변환하는 헬퍼 함수
function validateTaskStatus(status: string): 'pending' | 'running' | 'success' | 'error' | 'stopped' {
  const validStatuses: ('pending' | 'running' | 'success' | 'error' | 'stopped')[] = 
    ['pending', 'running', 'success', 'error', 'stopped'];
  
  return validStatuses.includes(status as any) 
    ? (status as 'pending' | 'running' | 'success' | 'error' | 'stopped') 
    : 'error'; // 기본값으로 'error' 사용
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
  // status가 있으면 타입 검증
  const updatedProgress = { ...progress };
  if (progress.status) {
    updatedProgress.status = validateCrawlingStatus(String(progress.status));
  }
  
  crawlingProgressStore.set({
    ...crawlingProgressStore.get(),
    ...updatedProgress
  });
}

// 크롤링 시작 함수
export async function startCrawling(): Promise<void> {
  try {
    crawlingStatusStore.set('running');
    addLog('크롤링을 시작합니다...', 'info');
    
    // 크롤링 시작 전 활성 작업 및 최근 작업 초기화
    activeTasksStore.set({});
    recentTasksStore.set([]);
    
    const config = configStore.get();
    addLog(`설정: 페이지 범위 ${config.pageRangeLimit}, 제품 목록 재시도 ${config.productListRetryCount}회, 제품 상세 재시도 ${config.productDetailRetryCount}회`, 'info');
    
    // API를 통해 크롤링 시작 (설정 전달 기능 추가 필요)
    const { success } = await api.invokeMethod('startCrawling', { 
      mode: appModeStore.get(),
      config: configStore.get() // 설정 전달 (향후 백엔드 업데이트 필요)
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

// 크롤링 상태 체크 함수
export async function checkCrawlingStatus(): Promise<void> {
  try {
    addLog('상태 체크를 시작합니다...', 'info');
    // 이전 상태 저장
    const prev = crawlingStatusSummaryStore.get();
    if (prev) lastCrawlingStatusSummaryStore.set(prev);
    const { success, status, error } = await api.invokeMethod<'checkCrawlingStatus', { success: boolean; status?: CrawlingStatusSummary; error?: string }>('checkCrawlingStatus');
    if (success && status) {
      crawlingStatusSummaryStore.set(status);
      // 변경점 비교 및 로그/알림
      if (prev) {
        const changed: string[] = [];
        for (const key of Object.keys(status)) {
          if (JSON.stringify((status as any)[key]) !== JSON.stringify((prev as any)[key])) {
            changed.push(key);
          }
        }
        if (changed.length > 0) {
          addLog(`상태 요약 정보 중 변경된 항목: ${changed.join(', ')}`, 'info');
        }
      }
      addLog(`DB 제품수: ${status.dbProductCount}, 사이트 제품수: ${status.siteProductCount}, 차이: ${status.diff}, 크롤링 필요: ${status.needCrawling ? '예' : '아니오'}`, 'info');
    } else {
      addLog(`상태 체크 실패: ${error}`, 'error');
    }
  } catch (error) {
    addLog(`상태 체크 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}