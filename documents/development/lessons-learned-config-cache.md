# 설정 및 캐시 관리 개선 Lessons Learned

## 1. 문제 상황

- **기대 동작:** UI에서 설정을 변경한 후 "상태 체크"를 실행하면, 변경된 설정을 기반으로 사이트에서 최신 전체 페이지 수, 마지막 페이지 제품 수 등의 정보를 가져와 내부 캐시를 업데이트합니다. 이후 "크롤링"을 실행하면, 이 캐시된 최신 정보와 현재 설정을 활용하여 데이터 수집을 진행해야 합니다.
- **실제 동작:** 설정 변경 후 "상태 체크"나 "크롤링" 실행 시 간헐적으로 이전 설정으로 동작하거나, 캐시된 정보가 최신 상태를 반영하지 못해 예상과 다른 범위의 데이터를 수집하거나 오류가 발생하는 문제가 빈번했습니다.

## 2. 원인 분석

주요 원인은 다음과 같습니다.

1.  **설정 값의 비일관성 (Stale Configuration):**
    *   `CrawlerEngine`이 "상태 체크" 또는 "크롤링" 작업을 시작할 때, 항상 최신의 설정을 `ConfigManager`로부터 가져와 사용하는 것이 아니라, 인스턴스 생성 시점이나 이전 작업의 설정을 계속 사용하는 경우가 있었습니다.
    *   이로 인해 `ProductListCollector`와 같은 하위 모듈들이 오래된 설정 값(예: `matterFilterUrl`, `pageRangeLimit`)을 기반으로 동작하게 되어, 사용자의 현재 의도와 다른 URL로 요청하거나 페이지 범위를 잘못 계산하는 문제가 발생했습니다.

2.  **캐시 데이터 관리 및 데이터 페칭 흐름의 모호성:**
    *   `ProductListCollector`의 `fetchTotalPagesCached` 메서드는 전체 페이지 수와 마지막 페이지 제품 수를 캐시합니다.
    *   "상태 체크" 시에는 `fetchTotalPagesCached(true)`를 호출하여 강제로 최신 데이터를 가져와 캐시를 갱신하는 것이 올바르게 동작하고 있었습니다.
    *   그러나 "크롤링" 시작 시 `ProductListCollector.collect()` 내부에서 `fetchTotalPagesCached(false)`를 호출하여 캐시된 데이터를 사용하려 할 때, 만약 `CrawlerEngine` 자체가 오래된 설정을 가지고 있다면, 이 캐시 조회/갱신 로직이 잘못된 기준(예: 이전 `matterFilterUrl`)으로 동작할 수 있었습니다. 즉, 캐시 키의 일부가 되는 URL이 달라져야 함에도 불구하고 이전 URL 기준으로 캐시를 찾거나, 캐시가 없어 새로 가져올 때도 오래된 URL로 요청하는 문제가 발생 가능했습니다.

3.  **타입 정의 불일치:**
    *   `CrawlingSummary` 타입에 `lastPageProductCount`와 같은 필드가 누락되어, 실제 데이터 구조와 타입 정의 간의 불일치로 인한 타입스크립트 컴파일 오류가 발생했습니다.

## 3. 해결 방안

1.  **`CrawlerEngine`의 설정 사용 방식 개선:**
    *   `CrawlerEngine`의 `checkCrawlingStatus` 및 `startCrawling` 메서드 시작 시점에서 항상 `configManager.getConfig()`를 호출하여 최신 설정 객체를 가져오도록 수정했습니다.
    *   이 최신 설정 객체를 `BrowserManager` 및 `ProductListCollector` 인스턴스 생성 시 명시적으로 전달하여, 모든 하위 작업이 현재 UI에 반영된 최신 설정을 기반으로 동작하도록 보장했습니다.

2.  **캐시 및 데이터 페칭 로직 명확화:**
    *   `startCrawling` 시 `productListCollector.fetchTotalPagesCached(false)`를 호출하여, "상태 체크" 단계에서 최신 정보로 갱신되었을 가능성이 있는 캐시를 우선 활용하도록 했습니다. 만약 캐시가 없거나 TTL이 만료되었다면, `ProductListCollector`는 최신 설정을 기반으로 올바른 URL을 사용하여 데이터를 가져오게 됩니다.
    *   `checkCrawlingStatus`에서는 `fetchTotalPagesCached(true)`를 유지하여 항상 사이트의 최신 정보를 강제로 가져와 캐시를 업데이트하고 사용자에게 보여주도록 했습니다.

3.  **`lastPageProductCount`의 정확한 통합:**
    *   `checkCrawlingStatus`에서 `fetchTotalPagesCached(true)`를 통해 가져온 `lastPageProductCount`를 `PageIndexManager.calculateCrawlingRange`에 전달하여 크롤링 범위 계산의 정확도를 높였습니다.
    *   또한, `siteProductCount` (사이트 전체 제품 수) 및 `estimatedProductCount` (예상 수집 제품 수) 계산 시 `lastPageProductCount`를 반영하여 더 정확한 예측치를 제공하도록 수정했습니다.

4.  **타입 정의 일치:**
    *   `CrawlingSummary` 타입 정의(`src/electron/crawler/utils/types.ts`)에 `lastPageProductCount` 및 기타 필요한 필드들을 추가하여 실제 반환되는 객체의 구조와 타입이 일치하도록 수정했습니다.

## 4. 주요 Lessons Learned

*   **설정 정보의 일관성 유지:** 애플리케이션의 여러 부분에서 공유되는 설정 정보는 사용 시점에서 항상 최신 상태를 반영하도록 보장하는 메커니즘이 필수적입니다. 특히 비동기 작업이나 여러 단계로 구성된 프로세스에서는 각 단계 시작 시 설정을 다시 확인하는 것이 중요합니다.
*   **명확한 캐싱 전략:** 캐시된 데이터를 사용할 때는 캐시의 유효성(freshness)을 판단하는 기준(예: TTL, 설정 변경 여부)이 명확해야 합니다. 캐시를 읽거나 쓸 때 사용되는 키(key)가 현재 컨텍스트(예: 설정 값)를 정확히 반영하는지 확인해야 합니다.
*   **데이터 흐름의 명시화:** 복잡한 시스템에서는 데이터가 어디서 생성되고, 어떻게 전달되며, 언제 업데이트되는지에 대한 흐름을 명확하게 설계하고 코드에 반영해야 합니다. 특히, 상태를 가지는 서비스나 모듈 간의 상호작용에서 중요합니다.
*   **타입 시스템의 적극적 활용 및 일관성:** TypeScript와 같은 정적 타입 시스템을 사용하는 경우, 데이터 구조와 타입 정의를 항상 일치시켜야 합니다. 이는 컴파일 시점에 오류를 발견하고, 코드의 안정성과 가독성을 높이는 데 기여합니다.
*   **점진적 개선과 테스트:** 복잡한 로직 수정 시에는 작은 단위로 나누어 점진적으로 개선하고, 각 변경 사항에 대해 충분한 테스트를 수행하여 예기치 않은 부작용을 최소화해야 합니다.
