# ProductDetailCollector 타임아웃 해결 가이드

## 주요 파일 및 위치

- **ProductDetailCollector 클래스**: `/src/electron/crawler/tasks/productDetail.ts`
- **재시도 유틸리티**: `/src/electron/crawler/utils/retry.ts`
- **Axios 추출 유틸리티**: `/src/electron/crawler/utils/axiosExtractor.ts`
- **동시성 관리 유틸리티**: `/src/electron/crawler/utils/concurrency.ts`

## 주요 기능 요약

### 하이브리드 크롤링 전략

제품 상세 페이지 크롤링은 두 가지 전략을 순차적으로 시도합니다:

1. **Playwright 기반 전략**: 더 완전한 JavaScript 실행 환경을 제공
2. **Axios/Cheerio 기반 전략**: 더 가볍고 블로킹에 강한 대체 메커니즘

하이브리드 전략의 흐름:
```
crawlProductDetail() -> crawlWithPlaywright() 시도 -> 실패 시 crawlWithAxios()로 대체
```

### 재시도 메커니즘

지수 백오프 알고리즘을 사용하여 재시도 간격을 관리합니다:

```typescript
// 재시도 간격 계산 예시
const delay = Math.pow(2, attempt) * baseDelay + (random(-0.25, 0.25) * baseDelay);
```

### 적응형 동시성 제어

최근 요청들의 성공/실패 비율을 모니터링하여 동적으로 동시성 레벨을 조정합니다:

- 높은 실패율 감지 → 동시 요청 수 감소
- 낮은 실패율 유지 → 동시 요청 수 점진적 증가

## 설정 및 튜닝

### 주요 설정 매개변수

| 매개변수 | 설명 | 기본값 |
|----------|------|--------|
| `useHybridStrategy` | Playwright 실패 시 Axios 전략 자동 사용 여부 | `true` |
| `adaptiveConcurrency` | 실패율 기반 동적 동시성 조절 여부 | `true` |
| `baseRetryDelayMs` | 재시도 기본 지연 시간 (밀리초) | `1000` |
| `maxRetryDelayMs` | 재시도 최대 지연 시간 (밀리초) | `15000` |
| `axiosTimeoutMs` | Axios 요청 타임아웃 (밀리초) | `20000` |

### 동시성 조절 튜닝

기본 동시성 설정은 `detailConcurrency` 값으로 조절됩니다. 서버가 블로킹 없이 잘 응답하는 경우 값을 높이고, 블로킹이 감지되면 값을 낮추세요.

```typescript
// 예시: 초기 동시성 설정
config.detailConcurrency = 3; // 3개 제품을 동시에 크롤링
```

### 재시도 전략 튜닝

실패한 요청에 대한 재시도 횟수와 간격은 다음 설정으로 조절할 수 있습니다:

```typescript
// 예시: 재시도 설정
config.retryMax = 3;          // 최대 3회까지 재시도
config.baseRetryDelayMs = 2000; // 기본 2초 대기
config.maxRetryDelayMs = 30000; // 최대 30초까지 대기
```

## 문제 해결

### 자주 발생하는 문제

1. **지속적인 타임아웃**
   - 서버가 요청을 차단하고 있을 수 있습니다. `minRequestDelayMs`와 `maxRequestDelayMs` 값을 높여보세요.
   - `userAgent` 값을 변경해보세요.

2. **성능 저하**
   - `adaptiveConcurrency`가 동시성을 너무 낮게 설정했을 수 있습니다. 로그를 확인하고 필요시 해당 값을 `false`로 설정하세요.

3. **메모리 사용량 증가**
   - 크롤링 중 브라우저 컨텍스트가 제대로 정리되지 않을 수 있습니다. 로그에서 `Browser context refreshed successfully` 메시지를 확인하세요.

### 유용한 로그 메시지

- `[ProductDetailCollector] Playwright strategy failed for ${url}`: Playwright 전략 실패
- `[ProductDetailCollector] Falling back to Axios/Cheerio strategy for ${url}`: Axios 전략으로 대체
- `[AdaptiveConcurrency] Reducing concurrency from ${x} to ${y}`: 동시성 자동 감소
- `[ProductDetailCollector] Retrying (${attempt}/${max}) after ${delay}ms`: 재시도 시도 중

## 추가 개발 가이드

### 새로운 크롤링 전략 추가

새로운 크롤링 전략을 추가하려면:

1. `crawlWithYourStrategy` 메서드를 `ProductDetailCollector` 클래스에 추가
2. `crawlProductDetail` 메서드에 해당 전략 실행 로직 추가
3. 설정 옵션을 `CrawlerConfig` 타입에 추가

### Axios 추출기 개선

특정 페이지에서 추출이 제대로 되지 않는 경우, `axiosExtractor.ts`의 추출 로직을 개선하세요:

```typescript
// 특정 필드 추출 로직 예시
function extractSpecificField($: cheerio.CheerioAPI, fields: Record<string, any>): void {
  const fieldText = $('selector').text().trim();
  if (fieldText) {
    fields.yourField = fieldText;
  }
}
```
