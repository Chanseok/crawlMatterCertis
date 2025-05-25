# 배치 처리를 위한 목 테스트 가이드

## 개요

이 가이드는 전체 Electron 환경에 의존하지 않고 배치 처리 기능을 검증하기 위해 사용된 목 테스트 접근 방식을 설명합니다. 이 접근 방식을 통해 테스트는 모든 Node.js 환경에서 실행될 수 있으므로 테스트 자동화와 CI/CD 파이프라인과의 통합이 더 쉬워집니다.

## 왜 목 테스트인가?

배치 처리 기능을 테스트하는 데는 몇 가지 과제가 있었습니다:

1. **Electron 종속성**: 원래 테스트는 전체 Electron 환경을 필요로 했으며, 자동화된 테스트 환경에서 실행하기 어려웠습니다.
2. **네트워크 종속성**: 실제 환경 테스트는 실제 네트워크 연결에 의존했으며, 외부 요인으로 인한 변동성과 잠재적 실패를 도입했습니다.
3. **리소스 모니터링**: 리소스 사용량 및 적응형 배치 크기 조정을 테스트하려면 시스템 수준의 모니터링 기능이 필요했습니다.
4. **오류 시뮬레이션**: 복구 메커니즘을 테스트하기 위해 실제 네트워크 요청으로는 오류 조건을 일관되게 시뮬레이션하기 어려웠습니다.

우리의 목 테스트 접근 방식은 다음과 같이 이러한 과제를 해결합니다:

1. Electron 환경 및 API 시뮬레이션
2. 구성 가능한 지연 시간 및 실패율로 제어 가능한 네트워크 시뮬레이션 제공
3. 적응형 동작을 테스트하기 위한 가상 리소스 모니터링 구현
4. 복구 메커니즘을 테스트하기 위한 예측 가능한 오류 시나리오 생성

## 목 구현 구성 요소

### 1. 목 Electron (mock-electron.js)

이 모듈은 크롤러가 의존하는 Electron API 기능을 시뮬레이션합니다:

```javascript
// mock-electron.js의 간소화된 예제
export const electron = {
  ipcRenderer: {
    invoke: async (channel, ...args) => {
      // IPC 통신 시뮬레이션
      console.log(`Mock IPC: ${channel}`, args);
      
      // 채널에 따라 시뮬레이션된 응답 반환
      switch (channel) {
        case 'crawler:start':
          return { success: true, totalPages: args[0].pageRangeLimit };
        case 'crawler:status':
          return { status: 'running', progress: 0.5 };
        // 필요에 따라 더 많은 케이스 추가
        default:
          return null;
      }
    }
  }
};
```

### 2. 목 크롤러 (mock-crawler.js)

이 모듈은 크롤러 엔진과 그 배치 처리 동작을 시뮬레이션합니다:

```javascript
// mock-crawler.js의 간소화된 예제
export class CrawlerEngine {
  constructor() {
    this.networkLatency = { min: 100, max: 500, failureRate: 0.02 };
    this.resources = { memory: 1000 };
  }
  
  setNetworkLatency(options) {
    this.networkLatency = { ...this.networkLatency, ...options };
  }
  
  async startCrawling(config) {
    // 배치 처리 동작 시뮬레이션
    const totalPages = config?.pageRangeLimit || 100;
    const batchSize = config?.batchSize || 30;
    const batchDelayMs = config?.batchDelayMs || 2000;
    
    const batches = Math.ceil(totalPages / batchSize);
    let completedBatches = 0;
    let failures = 0;
    let retries = 0;
    
    for (let i = 0; i < batches; i++) {
      // 배치 처리 시뮬레이션
      await this.processBatch(i, batchSize);
      completedBatches++;
      
      // 배치 간 시뮬레이션된 지연 추가
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }
    
    return {
      success: true,
      totalProducts: totalPages * 12, // 페이지당 12개 제품 가정
      batchCount: completedBatches,
      avgBatchTimeMs: 1500,
      failures,
      retries
    };
  }
  
  async processBatch(batchIndex, batchSize) {
    // 네트워크 지연 및 잠재적 실패로 처리 시뮬레이션
    // 간결함을 위해 구현 세부 사항 생략
  }
}

export const configManager = {
  updateConfig: async (config) => {
    console.log('Mock config update:', config);
    return { success: true };
  }
};
```

### 3. 목 테스트

세 가지 주요 목 테스트 구현이 생성되었습니다:

#### 실제 환경 배치 테스트 (mock-real-world-test.js)

현실적인 조건으로 네트워크 요청을 시뮬레이션합니다:

- 구성 가능한 네트워크 지연 (200-2000ms)
- 무작위 요청 실패 (5% 실패율)
- 페이지 내용 시뮬레이션
- 제품 추출 시뮬레이션
- 상세한 성능 메트릭

#### 적응형 배치 테스트 (mock-adaptive-batch-test.js)

리소스 사용량에 따른 배치 크기 조정을 시뮬레이션합니다:

- 가상 메모리 모니터링
- 동적 배치 크기 조정
- 성능 영향 분석
- 임계값 테스트

#### 오류 복구 테스트 (mock-error-recovery-test.js)

오류 조건 및 복구 메커니즘을 시뮬레이션합니다:

- 제어된 실패 주입
- 재시도 동작 검증
- 배치 재개 테스트
- 진행 상태 유지 시뮬레이션

## 목 테스트 실행

테스트는 향상된 테스트 실행 스크립트를 사용하여 실행할 수 있습니다:

```bash
./src/test/run-enhanced-batch-tests.sh
```

이 스크립트는:

1. 코드가 트랜스파일되었는지 확인합니다
2. 모든 테스트를 순차적으로 실행합니다
3. 결과를 수집하고 분석 보고서를 생성합니다
4. 테스트 결과에 대한 요약 정보를 제공합니다

## 목 테스트 결과 해석

목 테스트는 배치 처리 성능에 대한 상세한 메트릭을 제공합니다:

1. **처리 시간**: 총 및 배치당 처리 시간
2. **리소스 사용량**: 시뮬레이션된 메모리 사용 패턴
3. **오류 처리**: 복구 통계 및 효율성
4. **확장성**: 다양한 배치 크기 및 지연으로 성능

이러한 메트릭은 다양한 시나리오에 대한 최적의 배치 처리 구성을 결정하는 데 도움이 됩니다.

## 새로운 목 테스트 추가

새로운 목 테스트를 만들려면:

1. `src/test` 디렉토리에 새 파일을 만듭니다(예: `mock-new-test.js`)
2. 필요한 목 구현을 가져옵니다:
   ```javascript
   import { CrawlerEngine, configManager } from './mock-crawler.js';
   ```
3. 목 구성 요소를 사용하여 테스트 로직을 구현합니다
4. `run-enhanced-batch-tests.sh` 스크립트에 테스트를 추가합니다

## 목 테스트를 위한 모범 사례

1. **현실적인 시뮬레이션**: 실제 환경 조건을 반영하도록 목 구성 요소를 구성합니다
2. **일관된 기준**: 비교를 위한 기준 메트릭을 유지합니다
3. **포괄적인 시나리오**: 다양한 구성 및 경계 사례를 테스트합니다
4. **명확한 보고**: 상세하고 실행 가능한 테스트 보고서를 생성합니다
5. **정기적인 검증**: 목 테스트 결과를 실제 환경 동작과 주기적으로 검증합니다

## 목 테스트의 한계

목 테스트는 귀중한 통찰력을 제공하지만 한계가 있습니다:

1. 실제 환경의 복잡한 상호 작용을 완전히 복제할 수 없습니다
2. Electron 런타임에 특정한 일부 경계 사례를 놓칠 수 있습니다
3. 네트워크 시뮬레이션은 실제 네트워크 조건에 비해 단순화되어 있습니다
4. 리소스 사용량 시뮬레이션은 근사치입니다

이러한 이유로, 목 테스트는 가끔의 실제 환경 검증 테스트로 보완되어야 합니다.

## 결론

목 테스트 접근 방식은 전체 Electron 환경의 복잡성 없이 배치 처리 기능을 검증하기 위한 실용적인 솔루션을 제공합니다. 필요한 구성 요소를 시뮬레이션함으로써, 성능, 오류 처리, 리소스 최적화를 포함한 배치 처리의 다양한 측면을 일관되게 테스트할 수 있습니다.
