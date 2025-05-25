// test-ui-sync-validation.js
// 크롤링 완료 시점의 UI 동기화 문제 해결 검증 테스트

/**
 * 이 테스트는 다음 3가지 UI 동기화 문제가 해결되었는지 검증합니다:
 * 1. 완료 시에도 "오류 발생" 메시지가 표시되는 문제
 * 2. 제품 상세 수집 현황의 불일치 (46/48 vs 48/48) 문제
 * 3. 페이지/제품 수 혼합 표시(48/5 페이지) 문제
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 테스트용 모의 크롤링 데이터
const mockCrawlingData = {
  // 테스트 케이스 1: 완료 상태와 오류 상태 충돌 시나리오
  completionWithError: {
    stage: 'detailCollection',
    status: 'completed',
    percentage: 100,
    currentStep: '크롤링 완료',
    currentStage: 2,
    processedItems: 46,
    totalItems: 48,
    message: '일부 오류 발생',
    error: 'API 연결 오류'
  },
  
  // 테스트 케이스 2: 46/48 상황에서 완료 시나리오
  inconsistentCompletion: {
    stage: 'complete',
    status: 'completed',
    percentage: 100,
    currentStep: '크롤링 완료',
    currentStage: 2,
    processedItems: 46,
    totalItems: 48
  },
  
  // 테스트 케이스 3: 페이지와 제품 수 혼합 표시 시나리오
  mixedPageProductDisplay: {
    stage: 'listCollection',
    status: 'running',
    percentage: 60,
    currentStep: '페이지 수집 중',
    currentStage: 1,
    currentPage: 3,
    totalPages: 5,
    processedItems: 48
  }
};

// 메인 윈도우
let mainWindow;

// 전역 이벤트 에미터 설정
let globalEmitter;

async function createTestWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'dist-electron/electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 개발 중엔 로컬 서버, 배포 환경에선 빌드된 파일 로드
  const url = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'dist-react/index.html')}`;

  await mainWindow.loadURL(url);

  return mainWindow;
}

/**
 * 테스트 1: 완료 시점에 오류 표시 문제 해결 검증
 * 예상 결과: 완료 상태일 때는 오류 상태가 자동으로 해제됨
 */
async function testCompletionWithErrorResolution() {
  console.log('=== 테스트 1: 완료 시 오류 표시 문제 해결 검증 ===');
  
  // 먼저 오류 상태와 함께 크롤링 업데이트 전송
  await mainWindow.webContents.send('crawling-progress', {
    ...mockCrawlingData.completionWithError,
    status: 'error',
    percentage: 95
  });
  
  // 잠시 대기 (UI 업데이트 시간)
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 그 다음 완료 이벤트 전송
  await mainWindow.webContents.send('crawling-complete', mockCrawlingData.completionWithError);
  
  // UI에서 값을 확인
  const result = await mainWindow.webContents.executeJavaScript(`
    try {
      const progressViewModel = window.__APP_STATE__.progressViewModel;
      const statusDisplay = progressViewModel.statusDisplay;
      
      // 완료 시 오류가 표시되지 않아야 함 (문제 #1 해결)
      const isErrorShownDespiteCompletion = statusDisplay.isError;
      const isCompletionStatus = statusDisplay.isComplete;
      
      return {
        isErrorShownDespiteCompletion,
        isCompletionStatus,
        statusText: statusDisplay.text
      };
    } catch (e) {
      return { error: e.toString() };
    }
  `);
  
  console.log('결과:', result);
  console.log('완료 상태에서 오류 표시 여부:', result.isErrorShownDespiteCompletion ? '❌ 실패' : '✅ 성공');
  console.log('완료 상태 표시 여부:', result.isCompletionStatus ? '✅ 성공' : '❌ 실패');
  console.log('상태 텍스트:', result.statusText);
  
  return !result.isErrorShownDespiteCompletion && result.isCompletionStatus;
}

/**
 * 테스트 2: 제품 수집 현황 불일치 문제 해결 검증
 * 예상 결과: 완료 시점에는 항상 total/total로 표시됨
 */
async function testCollectionDisplayConsistency() {
  console.log('\n=== 테스트 2: 제품 수집 현황 불일치 문제 해결 검증 ===');
  
  // 46/48 상황에서 완료 이벤트 전송
  await mainWindow.webContents.send('crawling-progress', mockCrawlingData.inconsistentCompletion);
  await mainWindow.webContents.send('crawling-complete', mockCrawlingData.inconsistentCompletion);
  
  // UI에서 값을 확인
  const result = await mainWindow.webContents.executeJavaScript(`
    try {
      const progressViewModel = window.__APP_STATE__.progressViewModel;
      const collectionDisplay = progressViewModel.collectionDisplay;
      
      // 완료 시 processed와 total이 일치해야 함 (문제 #2 해결)
      const isConsistent = collectionDisplay.processed === collectionDisplay.total;
      
      return {
        processed: collectionDisplay.processed,
        total: collectionDisplay.total,
        displayText: collectionDisplay.displayText,
        isConsistent
      };
    } catch (e) {
      return { error: e.toString() };
    }
  `);
  
  console.log('결과:', result);
  console.log('수집 현황 일관성:', result.isConsistent ? '✅ 성공' : '❌ 실패');
  console.log('수집 현황 표시:', result.displayText);
  
  return result.isConsistent;
}

/**
 * 테스트 3: 페이지/제품 수 혼합 표시 문제 해결 검증
 * 예상 결과: 페이지와 제품 수가 분리되어 표시됨
 */
async function testPageProductSeparation() {
  console.log('\n=== 테스트 3: 페이지/제품 수 혼합 표시 문제 해결 검증 ===');
  
  // 페이지와 제품 수가 혼합된 데이터 전송
  await mainWindow.webContents.send('crawling-progress', mockCrawlingData.mixedPageProductDisplay);
  
  // UI에서 값을 확인
  const result = await mainWindow.webContents.executeJavaScript(`
    try {
      const progressViewModel = window.__APP_STATE__.progressViewModel;
      
      // 페이지 정보와 제품 정보가 분리되어 있어야 함 (문제 #3 해결)
      const pageDisplay = progressViewModel.pageDisplay;
      const collectionDisplay = progressViewModel.collectionDisplay;
      
      return {
        pageInfo: {
          current: pageDisplay.current,
          total: pageDisplay.total,
          displayText: pageDisplay.displayText
        },
        productInfo: {
          processed: collectionDisplay.processed, 
          total: collectionDisplay.total,
          displayText: collectionDisplay.displayText
        }
      };
    } catch (e) {
      return { error: e.toString() };
    }
  `);
  
  console.log('결과:', result);
  
  const isPageInfoCorrect = result.pageInfo.current === mockCrawlingData.mixedPageProductDisplay.currentPage &&
                          result.pageInfo.total === mockCrawlingData.mixedPageProductDisplay.totalPages;
  
  console.log('페이지 정보 정확성:', isPageInfoCorrect ? '✅ 성공' : '❌ 실패');
  console.log('페이지 표시:', result.pageInfo.displayText);
  console.log('제품 표시:', result.productInfo.displayText);
  
  return isPageInfoCorrect;
}

/**
 * 모든 테스트 실행
 */
async function runAllTests() {
  try {
    console.log('UI 동기화 문제 해결 검증 테스트 시작...');
    
    // 테스트 환경에서 ViewModel 접근 가능하도록 설정
    await mainWindow.webContents.executeJavaScript(`
      try {
        window.__TEST_ACCESS__ = {
          getProgressViewModel: () => {
            // 어플리케이션 내부 상태에 접근
            return window.__APP_STATE__.progressViewModel;
          }
        };
        console.log('테스트 액세스 설정 완료');
      } catch (e) {
        console.error('테스트 설정 오류:', e);
      }
    `);
    
    // 각 테스트 실행
    const test1Success = await testCompletionWithErrorResolution();
    const test2Success = await testCollectionDisplayConsistency();
    const test3Success = await testPageProductSeparation();
    
    // 최종 결과
    console.log('\n=== 테스트 결과 요약 ===');
    console.log('테스트 1 (완료 시 오류 표시 문제):', test1Success ? '✅ 성공' : '❌ 실패');
    console.log('테스트 2 (제품 수집 현황 불일치):', test2Success ? '✅ 성공' : '❌ 실패');
    console.log('테스트 3 (페이지/제품 수 혼합 표시):', test3Success ? '✅ 성공' : '❌ 실패');
    
    if (test1Success && test2Success && test3Success) {
      console.log('\n🎉 모든 UI 동기화 문제가 성공적으로 해결되었습니다!');
    } else {
      console.log('\n⚠️ 일부 UI 동기화 문제가 아직 해결되지 않았습니다. 자세한 로그를 확인하세요.');
    }
  } catch (err) {
    console.error('테스트 실행 중 오류 발생:', err);
  } finally {
    // 3초 후 앱 종료
    setTimeout(() => app.quit(), 3000);
  }
}

// 앱 시작 시 테스트 실행
app.whenReady().then(async () => {
  try {
    mainWindow = await createTestWindow();
    
    // 개발자 도구 열기
    mainWindow.webContents.openDevTools();
    
    // 앱이 로드된 후 테스트 실행
    setTimeout(runAllTests, 1500);
    
  } catch (err) {
    console.error('테스트 윈도우 생성 중 오류 발생:', err);
    app.quit();
  }
});

// 모든 창이 닫히면 앱 종료
app.on('window-all-closed', () => app.quit());
