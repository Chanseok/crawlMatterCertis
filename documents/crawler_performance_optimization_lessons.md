# Matter 인증 제품 웹 크롤러 성능 최적화 학습 정리

## 개요

이 문서는 Matter 인증 제품을 수집하는 웹 크롤러의 성능 최적화 과정에서 얻은 교훈과 적용된 기술을 정리한 것입니다. 주로 다음 두 가지 파일의 개선에 초점을 맞추었습니다:
- ProductList.ts: 제품 목록 페이지 크롤링
- ProductDetail.ts: 개별 제품 상세 페이지 크롤링

## 적용한 주요 최적화 기법

### 1. 설정 캐싱 (Settings Caching)

**구현 내용:**
- 자주 사용되는 설정값을 클래스 멤버 변수로 캐싱
- 매번 config 객체에서 조회하는 대신 캐싱된 값을 사용

```typescript
// 설정 캐싱 관련 변수 (1. 설정 캐싱)
private cachedMinDelay: number;
private cachedMaxDelay: number;
private cachedDetailTimeout: number;

// 생성자에서 초기화
this.cachedMinDelay = config.minRequestDelayMs ?? 100;
this.cachedMaxDelay = config.maxRequestDelayMs ?? 2200;
this.cachedDetailTimeout = config.productDetailTimeoutMs ?? 60000;
```

**교훈:**
- 단순하지만 효과적인 최적화로 반복적인 객체 프로퍼티 접근 비용 감소
- 참조형 데이터(객체, 배열)는 깊은 복사가 필요할 수 있어 주의 필요 (타입 안정성 이슈 발생 가능)
- 원시 타입(숫자, 문자열, 불리언)은 캐싱하기에 적합함

### 2. 리소스 로딩 최적화 (Resource Loading Optimization)

**구현 내용:**
- 필수적이지 않은 리소스(이미지, 폰트, 대부분의 CSS 등) 차단
- 페이지 로딩 속도 향상 및 네트워크 트래픽 감소

```typescript
private async optimizePage(page: Page): Promise<void> {
  // 더 공격적인 리소스 차단
  await page.route('**/*', (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const url = request.url();
    
    // HTML과 필수 CSS만 허용
    if (resourceType === 'document' || 
        (resourceType === 'stylesheet' && url.includes('main'))) {
      route.continue();
    } else {
      route.abort();
    }
  });
}
```

**교훈:**
- 웹 크롤링에서는 웹 페이지의 시각적 요소보다 데이터에 집중해야 함
- 리소스 차단은 메모리 사용량과 네트워크 대역폭을 크게 절약함
- 필수 리소스만 허용함으로써 페이지 로딩 시간 단축 (최대 70% 감소 가능)

### 3. 브라우저 컨텍스트 재사용 (Browser Context Pooling)

**구현 내용:**
- 브라우저 컨텍스트 풀링을 통한 리소스 재사용
- 기존 컨텍스트를 닫고 새로 생성하는 대신 풀에서 가져오고 반환하는 방식 적용

```typescript
// 컨텍스트 풀에서 컨텍스트 가져오기 (3. 브라우저 컨텍스트 재사용)
context = await this.browserManager.getContextFromPool();
page = await this.browserManager.createPageInContext(context);

// 작업 완료 후 컨텍스트 반환
if (context) {
  try {
    await this.browserManager.returnContextToPool(context);
  } catch (e) {
    debugLog(`[ProductDetailCollector] Error returning context to pool: ${e}`);
  }
}
```

**교훈:**
- 브라우저 컨텍스트 생성은 비용이 큰 작업임 
- 풀링을 통해 컨텍스트 재사용 시 메모리 사용 효율화 및 속도 향상
- 적절한 풀 크기 관리가 중요 (너무 크면 메모리 낭비, 너무 작으면 재사용 효과 감소)
- 정리(cleanup) 로직이 복잡해질 수 있으므로 명확한 관리 필요

### 4. 페이지 네비게이션 최적화 (Page Navigation Optimization)

**구현 내용:**
- 단계적 네비게이션 접근법 적용
- 초기에는 짧은 타임아웃으로 빠른 로드 시도 후, 필요시 추가 시간 부여

```typescript
private async optimizedNavigation(page: Page, url: string, timeout: number): Promise<boolean> {
  let navigationSucceeded = false;
  
  try {
    // 첫 시도: 매우 짧은 타임아웃으로 시도
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', // 더 가벼운 로드 조건
      timeout: Math.min(5000, timeout / 3) // 매우 짧은 타임아웃
    });
    navigationSucceeded = true;
  } catch (error: any) {
    if (error && error.name === 'TimeoutError') {
      // 타임아웃 발생해도 HTML이 로드되었다면 성공으로 간주
      const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
      if (readyState !== 'loading' && readyState !== 'unknown') {
        navigationSucceeded = true;
        debugLog(`Navigation timed out but document is in '${readyState}' state. Continuing...`);
      } else {
        // 첫 시도 실패 시, 두 번째 시도 - 조금 더 긴 타임아웃
        try {
          await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: timeout / 2
          });
          navigationSucceeded = true;
        } catch (secondError: any) {
          // 최종 실패 시 오류 로깅
          debugLog(`Navigation failed after retry: ${secondError && secondError.message ? secondError.message : 'Unknown error'}`);
        }
      }
    }
  }
  
  return navigationSucceeded;
}
```

**교훈:**
- 모든 요소가 완전히 로드될 때까지 기다리는 것은 종종 불필요함
- 'domcontentloaded' 이벤트는 대부분의 크롤링에 충분한 시점
- 페이지 상태(readyState) 확인을 통해 형식적인 타임아웃이 발생해도 작업 계속 진행 가능
- 단계적 접근으로 페이지 로딩 시간 최대 50% 단축 가능

## 최적화 통합 적용

ProductDetail.ts에서는 위 네 가지 최적화 기법을 조합하여 적용했습니다:

```typescript
private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
  const delayTime = getRandomDelay(this.cachedMinDelay, this.cachedMaxDelay);
  await delay(delayTime);
  
  let page = null;
  let context = null;

  try {
    // 컨텍스트 풀에서 컨텍스트 가져오기 (3. 브라우저 컨텍스트 재사용)
    context = await this.browserManager.getContextFromPool();
    page = await this.browserManager.createPageInContext(context);

    // 페이지 최적화 적용 (2. 리소스 로딩 최적화)
    await this.optimizePage(page);
    
    // 최적화된 네비게이션 적용 (4. 페이지 네비게이션 최적화)
    const navigated = await this.optimizedNavigation(page, product.url, this.cachedDetailTimeout);
    
    // 이후 제품 데이터 추출 및 처리...

  } finally {
    // 리소스 정리 및 컨텍스트 풀 반환
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (e) { /* 오류 처리 */ }
    }
    
    if (context) {
      try {
        await this.browserManager.returnContextToPool(context);
      } catch (e) { /* 오류 처리 */ }
    }
  }
}
```

## 성능 개선 효과

위 최적화 기법들을 적용한 결과 다음과 같은 성능 개선을 기대할 수 있습니다:

1. **메모리 사용량 감소**: 브라우저 컨텍스트 재사용으로 30-50% 감소
2. **크롤링 속도 향상**: 페이지당 처리 시간 최대 60% 단축
3. **안정성 개선**: 타임아웃 및 네트워크 오류에 대한 복원력 향상
4. **병렬 처리 효율 증가**: 최적화된 리소스 사용으로 동시 처리 가능한 페이지 수 증가

## 추가 개선 가능성

1. **브라우저 엔진 선택**: Chromium과 WebKit 중 특정 웹사이트에 맞는 엔진 선택 고려
2. **동적 병렬도 조정**: 시스템 리소스와 네트워크 상태에 따라 동적으로 병렬도 조정
3. **스마트 재시도 전략**: 실패 유형에 따라 차별화된 재시도 전략 적용
4. **분산 크롤링**: 대규모 데이터 수집 시 작업을 여러 인스턴스로 분산 처리

## 결론

웹 크롤러의 성능 최적화는 단순히 속도를 높이는 것 이상의 의미가 있습니다. 리소스 사용의 효율성, 안정성, 확장성 등 다양한 측면을 고려해야 합니다. 이번 최적화 작업을 통해 브라우저 자동화 기반 크롤러의 근본적인 성능 제약을 이해하고, 이를 효과적으로 극복할 수 있는 방법을 배웠습니다.

특히 브라우저 컨텍스트 풀링과 같은 기법은 대규모 크롤링 작업에서 리소스 관리의 중요성을 보여줍니다. 또한 타임아웃 처리와 리소스 로딩 최적화는 불안정한 네트워크 환경에서의 크롤링 안정성을 크게 향상시킬 수 있습니다.

이러한 최적화 기법들은 Matter 인증 제품 크롤링뿐만 아니라 다양한 웹 자동화 및 데이터 수집 프로젝트에 적용 가능한 범용적인 접근법입니다.
