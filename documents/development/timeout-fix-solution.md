# ProductDetailCollector 타임아웃 문제 해결 방안

## 문제 요약

ProductDetailCollector 클래스의 두 번째 단계인 제품 상세 정보 수집 과정에서 빈번한 타임아웃 오류가 발생했습니다. 요청이 여러 번 실패하고, 과도한 재시도가 이루어지며, 동시 요청 관리에 문제가 있었습니다.

## 구현된 해결책

### 1. 하이브리드 전략 접근법 (Playwright + Axios/Cheerio)

Playwright로 크롤링을 시도하다 실패하면 자동으로 Axios/Cheerio 방식으로 대체하는 하이브리드 전략을 구현했습니다.

```typescript
// 하이브리드 접근 방식 요약
if (playwrightStrategy 실패) {
  try {
    axiosStrategy 실행;
  } catch (error) {
    // 두 전략 모두 실패한 경우 오류 처리
  }
}
```

### 2. 지수 백오프 및 지터를 사용한 재시도 메커니즘

재시도 간격을 점진적으로 늘리고 무작위 변동치(jitter)를 추가하여 네트워크 부하 및 서버 측 차단을 줄이는 방법을 구현했습니다.

```typescript
// 재시도 간격 = 2^attempt * 기본지연시간 + 랜덤변동치
const delay = Math.pow(2, attempt) * baseDelay + jitter;
```

### 3. 적응형 동시성 제어

실패율을 모니터링하여 동적으로 병렬 요청 수를 조절하는 기능을 구현했습니다.

- 높은 실패율 감지 시 동시성 감소
- 낮은 실패율 유지 시 점차 동시성 증가
- 슬라이딩 윈도우 방식으로 최근 요청들의 성공/실패 이력 추적

### 4. 설정 옵션 확장

다음과 같은 새로운 설정 옵션을 추가했습니다:

- `useHybridStrategy`: Playwright와 Axios/Cheerio 하이브리드 전략 사용 여부
- `adaptiveConcurrency`: 실패율 모니터링 기반 동적 동시성 조절 여부
- `baseRetryDelayMs`: 재시도 기본 지연 시간
- `maxRetryDelayMs`: 재시도 최대 지연 시간
- `axiosTimeoutMs`: Axios 요청 타임아웃 값

## 테스트 방법

테스트 스크립트 `test-hybrid-crawler.ts`를 추가했습니다:

```bash
npm run test:hybrid-crawler
```

위 명령어로 하이브리드 크롤링 전략이 정상적으로 작동하는지 테스트할 수 있습니다.

## 기대 효과

- **성공률 향상**: 여러 전략을 통해 단일 전략보다 높은 성공률 달성
- **서버 부하 감소**: 지수 백오프와 지터로 서버에 과도한 부하 감소
- **효율성 증가**: 적응형 동시성으로 현재 네트워크 상태에 최적화된 크롤링 수행
- **차단 가능성 감소**: 요청 간격 조절 및 다양한 접근 방식으로 서버 측 차단 위험 감소

## 추가 개선 가능 사항

- HTTP 프록시 지원 추가
- 사용자 에이전트 로테이션 기능 구현
- 요청 헤더 커스터마이징 확장
- 쿠키/세션 관리 개선
