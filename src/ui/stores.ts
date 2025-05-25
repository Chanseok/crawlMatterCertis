import { atom, map } from 'nanostores';
import { 
  AppMode, 
  LogEntry, 
  DatabaseSummary, 
  ProductDetail, 
  StatusStore, 
  ConcurrentCrawlingTask 
} from './types';
import type { CrawlingProgress, CrawlingStatus, CrawlerConfig } from '../../types.js';
import { getPlatformApi, updateApiForAppMode } from './platform/api';
import { serviceFactory } from './services';

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

// 사이트 상태 정보 관리
export const statusStore = map<StatusStore>({
  isChecking: false,
  siteConnected: false,
  lastCheckedAt: null,
  isCrawling: false,
  crawlingStartedAt: null,
  crawlingFinishedAt: null,
  currentPage: 0,
  totalPages: 0,
  lastPageProductCount: 0,
  targetPageCount: 0, // 새로 추가: 사용자가 설정한 페이지 범위
  foundProducts: 0,
  detailProgress: 0,
  detailTotal: 0
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
  actualTargetPageCountForStage1?: number; // 1단계 실제 크롤링 대상 페이지 수
}

// map의 타입은 object만 허용하므로 null 대신 빈 객체 사용
export const crawlingStatusSummaryStore = map<CrawlingStatusSummary>({} as CrawlingStatusSummary);
export const lastCrawlingStatusSummaryStore = map<CrawlingStatusSummary>({} as CrawlingStatusSummary);

// 동시 처리 작업 상태 관리 (예: 각 페이지별 크롤링 상태)
export const concurrentTasksStore = atom<ConcurrentCrawlingTask[]>([]);

// 성공한 태스크 수 추적 함수 (CrawlingDashboard에서 직접 호출)
let lastSuccessCount = 0;
export function updateSuccessTaskCount(currentSuccessCount: number): void {
  if (currentSuccessCount !== lastSuccessCount) {
    console.log(`[concurrentTasksStore] 성공 태스크 수 변경: ${lastSuccessCount} → ${currentSuccessCount}`);
    
    // 만약 성공한 페이지가 있고, 현재 크롤링 단계가 1단계라면 progress.currentPage 업데이트
    const currentProgress = crawlingProgressStore.get();
    if (currentProgress.currentStage === 1 && currentSuccessCount > (currentProgress.currentPage || 0)) {
      console.log(`[concurrentTasksStore] 성공 페이지 수 업데이트: ${currentProgress.currentPage} → ${currentSuccessCount}`);
      // 크롤링 진행 상태 업데이트 (성공 페이지 수 반영)
      updateCrawlingProgress({
        currentPage: currentSuccessCount
      });
    }
    
    lastSuccessCount = currentSuccessCount;
  }
}

// concurrentTasksStore 변경 감지 및 성공 상태 추적
concurrentTasksStore.listen(tasks => {
  try {
    const currentSuccessCount = tasks.filter((task: ConcurrentCrawlingTask) => task.status === 'success').length;
    if (currentSuccessCount !== lastSuccessCount) {
      console.log(`[concurrentTasksStore] 성공 태스크 수 변경: ${lastSuccessCount} → ${currentSuccessCount}`);
      
      // 만약 성공한 페이지가 있고, 현재 크롤링 단계가 1단계라면 progress.currentPage 업데이트
      const currentProgress = crawlingProgressStore.get();
      if (currentProgress.currentStage === 1 && currentSuccessCount > (currentProgress.currentPage || 0)) {
        console.log(`[concurrentTasksStore] 성공 페이지 수 업데이트: ${currentProgress.currentPage} → ${currentSuccessCount}`);
        // 크롤링 진행 상태 업데이트 (성공 페이지 수 반영)
        updateCrawlingProgress({
          currentPage: currentSuccessCount
        });
      }
      
      lastSuccessCount = currentSuccessCount;
    }
  } catch (error) {
    console.error('[concurrentTasksStore] 리스너 오류:', error);
  }
});

// 작업별 상태 정보 저장 (task ID를 키로 사용)
export interface TaskStatusDetail {
  id: string | number;
  status: 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting';
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
  productDetailRetryCount: 9,
  productsPerPage: 12,  // 필수 필드 추가
  autoAddToLocalDB: false // 기본값 추가 (필요에 따라 true/false로 설정)
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
  const unsubComplete = api.subscribeToEvent('crawlingComplete', ({ success, count, autoSavedToDb }: { success: boolean; count: number; autoSavedToDb?: boolean }) => {
    if (success) {
      crawlingStatusStore.set('completed');
      addLog(`크롤링이 완료되었습니다. 총 ${count}개의 항목이 수집되었습니다.`, 'success');
      
      // 자동 저장 상태 표시 (추가)
      if (autoSavedToDb !== undefined) {
        if (autoSavedToDb) {
          addLog('설정에 따라 수집된 제품 정보가 자동으로 DB에 저장되었습니다.', 'info');
        } else {
          addLog('자동 DB 저장이 비활성화되어 있습니다. 필요한 경우 수동으로 DB에 추가하세요.', 'warning');
        }
      }
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

  // DB 저장 완료 이벤트 구독 (추가)
  const unsubDbSaveComplete = api.subscribeToEvent(
    'dbSaveComplete',
    (data: { success: boolean; added?: number; updated?: number; unchanged?: number; failed?: number; error?: string }) => {
      console.log('[UI] DB 저장 완료 이벤트 수신:', data);
      if (data.success) {
        const { added = 0, updated = 0, unchanged = 0, failed = 0 } = data;
        addLog(`제품 정보 DB 저장 완료: ${added}개 추가, ${updated}개 업데이트, ${unchanged}개 변동 없음, ${failed}개 실패`, 'success');
        // 저장 후 DB 요약 정보 갱신
        getDatabaseSummary().catch(err => console.error('DB 요약 정보 갱신 실패:', err));
      } else {
        addLog(`제품 정보 DB 저장 실패: ${data.error || '알 수 없는 오류'}`, 'error');
      }
    }
  );
  unsubscribeFunctions.push(unsubDbSaveComplete);
  
  // DB 저장 건너뛰기 이벤트 구독 (추가)
  const unsubDbSaveSkipped = api.subscribeToEvent('dbSaveSkipped', (data) => {
    console.log('[UI] DB 저장 건너뛰기 이벤트 수신:', data);
    addLog(data.message || '제품 정보가 DB에 저장되지 않았습니다.', 'warning');
  });
  unsubscribeFunctions.push(unsubDbSaveSkipped);
  
  // 최종 크롤링 결과 이벤트 구독 (추가)
  const unsubFinalCrawlingResult = api.subscribeToEvent(
    'finalCrawlingResult',
    (data: { collected: number; newItems: number; updatedItems: number; unchangedItems?: number; failedItems?: number }) => {
      console.log('[UI] 최종 크롤링 결과 이벤트 수신:', data);
      addLog(`크롤링 최종 결과: 총 ${data.collected}개 중 ${data.newItems}개 신규, ${data.updatedItems}개 업데이트됨`, 'info');
      
      // 최종 결과를 기반으로 크롤링 진행 상태 업데이트
      updateCrawlingProgress({
        newItems: data.newItems,
        updatedItems: data.updatedItems,
        message: `크롤링 완료: ${data.collected}개 수집 (${data.newItems}개 추가, ${data.updatedItems}개 업데이트)`
      });
    }
  );
  unsubscribeFunctions.push(unsubFinalCrawlingResult);

  // 동시 작업 상태 실시간 구독
  const unsubConcurrentTasks = api.subscribeToEvent('crawlingTaskStatus', (taskStatus) => {
    // 기존 동시 작업 목록 업데이트
    if (Array.isArray(taskStatus)) {
      // 이전 상태와 병합하여 성공 상태를 유지
      const prevTasks = concurrentTasksStore.get();
      
      // 새로운 작업 상태와 기존의 성공 작업을 유지하도록 병합
      // 특히 'success' 상태인 작업을 보존
      const mergedTasks = taskStatus.map((newTaskData: any) => {
        const prevTask = prevTasks.find(pt => pt.pageNumber === newTaskData.pageNumber);
        
        // 'attempting' 상태를 newStatus 타입에 추가
        let newStatus: 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting'; 
        if (prevTask && prevTask.status === 'success' && newTaskData.status !== 'success') {
          newStatus = 'success';
        } else {
          // Ensure the status from newTaskData is validated to the correct type
          // validateTaskStatus가 'attempting'을 반환할 수 있다고 가정
          newStatus = validateTaskStatus(newTaskData.status as string) as typeof newStatus;
        }
        
        // Return a new object with all properties from newTaskData, but with the correctly typed status
        return {
          ...newTaskData,
          status: newStatus,
        };
      });
      
      concurrentTasksStore.set(mergedTasks);
      
      // UI 디버깅용 로깅
      console.log(`[UI] Tasks updated: Total=${mergedTasks.length}, Success=${mergedTasks.filter(t => t.status === 'success').length}`);
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
        
        // status 값을 안전하게 변환 (validateTaskStatus의 반환 타입에 'attempting'이 포함되어야 함)
        const validStatus = validateTaskStatus(status) as 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting';
        
        // 작업 상태에 따라 처리
        if (validStatus === 'running' || validStatus === 'pending' || validStatus === 'attempting') {
          // 실행 중인 작업 목록에 추가/업데이트
          const activeTasks = {...activeTasksStore.get()};
          
          // 이미 존재하는 작업의 경우 시작 시간 유지
          const existingTask = activeTasksStore.get()[taskId];
          const startTime = existingTask?.startTime || Date.now();
          
          activeTasks[taskId] = {
            id: taskId,
            status: validStatus, // 변환된 status 사용
            details,
            startTime: startTime, // 시작 시간 유지
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
    const configService = serviceFactory.getConfigurationService();
    const result = await configService.getConfig();
    
    if (result.success && result.data) {
      configStore.set(result.data);
      
      // 설정이 로드될 때 statusStore의 targetPageCount도 업데이트
      // 이전에 저장된 targetPageCount 값이 없거나 0인 경우에만 업데이트
      const currentStatus = statusStore.get();
      if (!currentStatus.targetPageCount) {
        statusStore.setKey('targetPageCount', result.data.pageRangeLimit || 0);
      }
      
      addLog('설정을 로드했습니다.', 'info');
    } else {
      addLog(`설정 로드 실패: ${result.error?.message || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    addLog(`설정 로드 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 설정 업데이트
export async function updateConfigSettings(newConfig: Partial<CrawlerConfig>): Promise<void> {
  try {
    const configService = serviceFactory.getConfigurationService();
    const result = await configService.updateConfig(newConfig);
    
    if (result.success && result.data) {
      configStore.set(result.data);
      
      // pageRangeLimit이 변경되면 statusStore의 targetPageCount도 업데이트
      if (newConfig.pageRangeLimit !== undefined) {
        statusStore.setKey('targetPageCount', newConfig.pageRangeLimit);
      }
      addLog('설정이 업데이트되었습니다.', 'success');
    } else {
      addLog(`설정 업데이트 실패: ${result.error?.message || 'Unknown error'}`, 'error');
    }
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
function validateTaskStatus(status: string): 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting' {
  const validStatuses: ('pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting')[] = 
    ['pending', 'running', 'success', 'error', 'stopped', 'attempting'];
  
  return validStatuses.includes(status as any) 
    ? (status as 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting') 
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
    // 항상 최신 설정을 로드
    try {
      const configService = serviceFactory.getConfigurationService();
      const result = await configService.getConfig();
      
      if (result.success && result.data) {
        console.log('[UI] 크롤링 시작 전 최신 설정 로드됨:', result.data);
        configStore.set(result.data);
      } else {
        console.error('[UI] 크롤링 시작 전 설정 로드 실패:', result.error?.message || 'Unknown error');
        addLog('설정을 로드하는데 문제가 있습니다. 기존 설정을 사용합니다.', 'warning');
      }
    } catch (configError) {
      console.error('[UI] 크롤링 시작 전 설정 로드 실패:', configError);
      addLog('설정을 로드하는데 문제가 있습니다. 기존 설정을 사용합니다.', 'warning');
      // 설정 로드 실패해도 기존 설정으로 진행
    }
    
    // 상태 요약 정보 확인
    const statusSummary = crawlingStatusSummaryStore.get();
    const isStatusEmpty = !statusSummary || Object.keys(statusSummary).length === 0 || 
                          statusSummary.siteTotalPages === undefined || 
                          statusSummary.siteTotalPages <= 0;
    
    // 상태 정보가 없거나 부족하면 상태 체크부터 진행
    if (isStatusEmpty) {
      addLog('크롤링 전 상태 체크를 먼저 실행합니다...', 'info');
      try {
        await checkCrawlingStatus();
        // 상태 체크 이후 잠시 대기하여 UI 업데이트 시간 제공
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (statusError) {
        addLog('상태 체크 중 오류가 발생했지만, 크롤링은 계속 진행합니다.', 'warning');
        console.error('[UI] 크롤링 전 자동 상태 체크 오류:', statusError);
        // 상태 체크 실패해도 크롤링은 계속 진행
      }
    }
    
    crawlingStatusStore.set('running');
    addLog('크롤링을 시작합니다...', 'info');
    
    // 크롤링 시작 전 활성 작업 및 최근 작업 초기화
    activeTasksStore.set({});
    recentTasksStore.set([]);
    
    const config = configStore.get();
    addLog(`설정: 페이지 범위 ${config.pageRangeLimit}, 제품 목록 재시도 ${config.productListRetryCount}회, 제품 상세 재시도 ${config.productDetailRetryCount}회`, 'info');
    
    // API를 통해 크롤링 시작 (최신 config를 payload로 전달, 세션 전체에서 이 config만 사용)
    console.log('[UI] 크롤링 시작 요청, 설정:', config);
    const { success, status } = await api.invokeMethod<'startCrawling', { success: boolean; status?: CrawlingStatusSummary }>('startCrawling', { 
      mode: appModeStore.get(),
      config: config // 최신 설정 전달 (세션 내 일관성 보장)
    });
    
    // 백엔드에서 status 정보를 받아오면 상태 정보 업데이트
    if (status) {
      crawlingStatusSummaryStore.set(status);
      addLog(`상태 정보 업데이트: DB 제품수: ${status.dbProductCount}, 사이트 제품수: ${status.siteProductCount}, 차이: ${status.diff}`, 'info');
    }
    
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
export async function searchProducts(query: string = '', page: number = 1, limit: number = 8000): Promise<void> {
  try {
    // 로딩 시작 로그
    if (!query) {
      addLog(`제품 데이터 로드 중... (최대 ${limit}개)`, 'info');
    }
    
    const response = await api.invokeMethod('getProducts', { 
      search: query,
      page,
      limit 
    });
    
    const { products, total } = response;
    
    productsStore.set(products);
    
    if (query) {
      addLog(`검색 결과: ${products.length}개 항목 (총 ${total}개 중)`, 'info');
    } else if (products.length > 0) {
      addLog(`제품 데이터 로드 완료: ${products.length}개 항목 (총 ${total}개 중)`, 'info');
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

// 페이지 범위로 레코드 삭제 함수 추가
export async function deleteRecordsByPageRange(startPageId: number, endPageId: number): Promise<void> {
  try {
    console.log(`[STORE] 레코드 삭제 시작 - 페이지 범위: ${startPageId}~${endPageId}`);
    addLog(`레코드 삭제를 시작합니다. 페이지 범위: ${startPageId}~${endPageId}`, 'info');
    
    // API를 통해 레코드 삭제 실행
    const response = await api.invokeMethod('deleteRecordsByPageRange', { startPageId, endPageId });
    console.log(`[STORE] 레코드 삭제 응답:`, response);
    
    const { success, deletedCount, error, maxPageId } = response;
    
    if (success) {
      addLog(`${deletedCount}개의 레코드가 성공적으로 삭제되었습니다.`, 'success');
      console.log(`[STORE] 레코드 삭제 성공 - ${deletedCount}개 삭제됨, 새 maxPageId: ${maxPageId}`);
      
      // 레코드 삭제 후 제품 목록 다시 로드
      console.log(`[STORE] 레코드 삭제 후 제품 목록 다시 로드 시작`);
      await searchProducts();
      console.log(`[STORE] 레코드 삭제 후 제품 목록 다시 로드 완료`);
      
      // 데이터베이스 요약 정보 갱신
      console.log(`[STORE] 레코드 삭제 후 DB 요약 정보 갱신 시작`);
      await getDatabaseSummary();
      console.log(`[STORE] 레코드 삭제 후 DB 요약 정보 갱신 완료`);
    } else {
      console.error(`[STORE] 레코드 삭제 실패: ${error}`);
      addLog(`레코드 삭제 실패: ${error}`, 'error');
    }
  } catch (error) {
    console.error(`[STORE] 레코드 삭제 중 예외 발생:`, error);
    addLog(`레코드 삭제 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 크롤링 상태 체크 함수
export async function checkCrawlingStatus(): Promise<void> {
  try {
    addLog('상태 체크를 시작합니다...', 'info');
    
    // 최신 설정 로드 - 이 부분이 중요함
    // 설정을 변경하고 저장한 후 '상태 체크'를 누르면 최신 설정이 로드되도록 보장
    try {
      const configService = serviceFactory.getConfigurationService();
      const result = await configService.getConfig();
      
      if (result.success && result.data) {
        console.log('[UI] 상태 체크 전 최신 설정 로드됨:', result.data);
        configStore.set(result.data);
      } else {
        console.error('[UI] 상태 체크 전 설정 로드 실패:', result.error?.message || 'Unknown error');
      }
    } catch (configError) {
      console.error('[UI] 상태 체크 전 설정 로드 실패:', configError);
      // 설정 로드 실패해도 기존 설정으로 진행
    }
    
    // 이전 상태 저장
    const prev = crawlingStatusSummaryStore.get();
    if (prev) lastCrawlingStatusSummaryStore.set(prev);
    
    // 상태 체크 시작
    statusStore.setKey('isChecking', true);
    
    // 현재 설정된 페이지 범위를 가져옴
    const config = configStore.get();
    const pageRangeLimit = config.pageRangeLimit;
    
    const { success, status, error } = await api.invokeMethod<'checkCrawlingStatus', { success: boolean; status?: CrawlingStatusSummary; error?: string }>('checkCrawlingStatus');
    
    if (success && status) {
      console.log('[UI] 상태 체크 성공, 결과:', status);
      crawlingStatusSummaryStore.set(status);
      
      // 계산된 크롤링 범위에 기반하여 targetPageCount 값을 설정
      // 상태 체크를 통해 계산된 실제 필요한 페이지 수를 우선 사용 (endPage - startPage + 1)
      const calculatedPageCount = status.crawlingRange ? 
        (status.crawlingRange.endPage - status.crawlingRange.startPage + 1) : 0;
      
      console.log('[UI] 계산된 페이지 범위:', status.crawlingRange, '페이지 수:', calculatedPageCount);
      
      // 사용자가 설정한 페이지 범위를 statusStore에 저장
      statusStore.set({
        ...statusStore.get(),
        isChecking: false,
        siteConnected: true,
        lastCheckedAt: Date.now(),
        totalPages: status.siteTotalPages,
        lastPageProductCount: status.siteTotalPages > 0 ? 12 : 0, // 디폴트는 12개로 가정
        targetPageCount: calculatedPageCount > 0 ? calculatedPageCount : pageRangeLimit // 계산된 페이지 수를 우선 사용
      });
      
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
      statusStore.setKey('isChecking', false);
      statusStore.setKey('siteConnected', false);
      addLog(`상태 체크 실패: ${error}`, 'error');
    }
  } catch (error) {
    statusStore.setKey('isChecking', false);
    statusStore.setKey('siteConnected', false);
    addLog(`상태 체크 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 데이터베이스 요약 정보 가져오기 함수 추가
export async function getDatabaseSummary(): Promise<DatabaseSummary | void> {
  try {
    addLog('데이터베이스 요약 정보를 가져오는 중...', 'info');
    
    const dbSummary = await api.invokeMethod('getDatabaseSummary');
    
    if (dbSummary) {
      databaseSummaryStore.set(dbSummary);
      console.log('Database summary updated:', dbSummary);
      return dbSummary;
    } else {
      addLog('데이터베이스 요약 정보를 가져오는데 실패했습니다.', 'error');
    }
  } catch (error) {
    console.error('Error getting database summary:', error);
    addLog(`데이터베이스 요약 정보 조회 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

// 크롤링으로 수집한 제품을 수동으로 DB에 저장하는 함수
export async function saveProductsToDB(products: any[]): Promise<void> {
  try {
    if (!products || products.length === 0) {
      addLog('저장할 제품 정보가 없습니다.', 'warning');
      return;
    }
    
    addLog(`${products.length}개의 제품 정보를 DB에 저장하는 중...`, 'info');
    
    const result = await api.invokeMethod('saveProductsToDB', products);
    
    if (result.success) {
      const { added, updated, unchanged, failed } = result;
      addLog(`제품 정보 저장 완료: ${added}개 추가, ${updated}개 업데이트, ${unchanged}개 변동 없음, ${failed}개 실패`, 'success');
      
      // 저장 후 DB 요약 정보 갱신
      await getDatabaseSummary();
      
      // 제품 목록 다시 로드
      await searchProducts();
    } else {
      addLog(`제품 정보 저장 실패: ${result.error}`, 'error');
    }
  } catch (error) {
    addLog(`제품 정보 저장 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}