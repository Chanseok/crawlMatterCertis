/**
 * page-errors.ts
 * 크롤링 작업 중 발생할 수 있는 페이지 관련 오류 클래스들
 */

/**
 * 페이지 작업 관련 기본 오류 클래스
 */
export class PageOperationError extends Error {
  constructor(message: string, public pageNumber: number, public attempt?: number) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * 페이지 로드 타임아웃 오류
 */
export class PageTimeoutError extends PageOperationError { 
  readonly type = 'Timeout'; 
}

/**
 * 페이지 작업 중단 오류
 */
export class PageAbortedError extends PageOperationError { 
  readonly type = 'Abort'; 
}

/**
 * 페이지 탐색 오류
 */
export class PageNavigationError extends PageOperationError { 
  readonly type = 'Navigation'; 
}

/**
 * 페이지 콘텐츠 추출 오류
 */
export class PageContentExtractionError extends PageOperationError { 
  readonly type = 'Extraction'; 
}

/**
 * 페이지 초기화 오류
 */
export class PageInitializationError extends PageOperationError { 
  readonly type = 'Initialization'; 
}
