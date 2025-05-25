# CrawlerType 일원화 구현

## 개요

크롤링 엔진은 두 가지 크롤링 전략(`axios/cheerio`, `playwright`)을 지원하지만, 이전에는 각 컴포넌트가 서로 다른 방식으로 이 전략들을 사용하여 일관성 문제가 발생했습니다. 이 문서는 크롤링 전략을 `ConfigManager`에서 중앙 관리하도록 개선한 내용을 설명합니다.

## 변경 내용

### 1. ConfigManager 개선

- `getCrawlerType()` 및 `setCrawlerType()` 메서드 추가
- 기본 크롤러 타입을 `'axios'`로 설정

```typescript
export class ConfigManager {
  // ...

  getCrawlerType(): 'playwright' | 'axios' {
    return this.config.crawlerType || 'axios';
  }
  
  setCrawlerType(type: 'playwright' | 'axios'): void {
    this.config.crawlerType = type;
    this.saveConfig();
  }
}
```

### 2. PageCrawler 클래스 수정

- 생성자에서 crawlerType 매개변수 제거
- config에서 일관되게 crawlerType 가져오기

```typescript
constructor(browserManager: BrowserManager, config: CrawlerConfig) {
  this.config = config;
  this.browserManager = browserManager;
  // config에서 crawlerType 가져오기 (기본값은 'axios')
  this.crawlerType = this.config.crawlerType || 'axios';
  
  // 설정된 크롤러 전략 초기화
  this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
    this.crawlerType, 
    this.config, 
    this.browserManager
  );
}
```

### 3. ProductListCollector 클래스 수정

- `pageCrawler` 생성 시 config에서 crawlerType 가져오기

```typescript
// 유틸리티 클래스 초기화 (config에서 crawlerType 사용)
this.pageCrawler = new PageCrawler(browserManager, config);
```

### 4. ProductDetailCollector 클래스 수정

- 크롤러 타입에 따라 적절한 크롤링 전략 사용

```typescript
private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
  // ...
  
  // config에서 정의된 크롤러 타입 가져오기 (기본값은 axios)
  const crawlerType = config.crawlerType || 'axios';
  
  // 크롤러 타입에 따라 적절한 전략 사용
  if (crawlerType === 'playwright') {
    // Playwright로 크롤링...
  } else {
    // axios/cheerio로 크롤링...
  }
}
```

### 5. CrawlerStrategyFactory 개선

- 기본 크롤러 타입을 `'axios'`로 설정
- 지원되지 않는 타입인 경우 에러 대신 경고 로그 출력 후 axios 전략 사용

```typescript
static createStrategy(
  type: CrawlerType = 'axios',
  config: CrawlerConfig,
  browserManager?: BrowserManager
): ICrawlerStrategy {
  switch (type) {
    case 'playwright':
      // ...
    case 'axios':
      // ...
    default:
      debugLog(`지원되지 않는 크롤러 전략 유형: ${type}, axios 전략을 기본 사용합니다.`);
      return new AxiosCrawlerStrategy(config);
  }
}
```

### 6. UI 설정 추가

- 설정 탭에 크롤러 타입 선택 옵션 추가
- 라디오 버튼으로 `axios/cheerio` 또는 `playwright` 선택 가능
- 설정 저장 시 선택한 크롤러 타입도 함께 저장

## 이점

1. **일관성**: 애플리케이션 전체에서 동일한 크롤링 전략 사용
2. **사용자 제어**: 설정 UI를 통해 사용자가 크롤링 전략 선택 가능
3. **기본값 표준화**: `axios/cheerio`를 명시적 기본값으로 설정
4. **오류 내성**: 지원되지 않는 타입에 대한 처리 개선
5. **유지보수 향상**: 중앙 집중식 설정 관리로 코드 유지보수성 향상

## 향후 개선 사항

1. **전략 전환 기능**: 크롤링 중 필요에 따라 동적으로 전략 전환 기능 추가 고려
2. **성능 모니터링**: 각 전략의 성능 통계 수집 및 분석
3. **자동 전략 선택**: 사이트 특성에 따라 최적의 전략 자동 선택 기능
