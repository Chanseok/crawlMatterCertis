/**
 * page-cache-manager.ts
 * 페이지 데이터 캐싱을 담당하는 클래스
 */

/**
 * 페이지 캐시 관리자
 * 특정 타입의 데이터에 대한 메모리 캐싱 및 유효성 검사 담당
 */
export class PageCacheManager<T> {
  private cache: T | null = null;
  private cachedAt: number | null = null;
  private ttlMs: number;

  /**
   * @param ttlMs 캐시 유효기간 (밀리초)
   */
  constructor(ttlMs: number = 3600000) {
    this.ttlMs = ttlMs;
  }

  /**
   * 캐시에서 데이터 가져오기
   * @param force 강제 갱신 여부
   * @param fetchFn 데이터를 가져오는 함수
   */
  async getOrFetch(force: boolean, fetchFn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    if (!force && 
        this.cache !== null && 
        this.cachedAt !== null && 
        (now - this.cachedAt < this.ttlMs)) {
      return this.cache;
    }
    
    const freshData = await fetchFn();
    this.cache = freshData;
    this.cachedAt = now;
    return freshData;
  }

  /**
   * 캐시 무효화
   */
  invalidate(): void {
    this.cache = null;
    this.cachedAt = null;
  }

  /**
   * 캐시된 데이터가 있고 유효한지 확인
   */
  hasValidCache(): boolean {
    const now = Date.now();
    return (
      this.cache !== null &&
      this.cachedAt !== null &&
      (now - this.cachedAt < this.ttlMs)
    );
  }

  /**
   * 캐시된 데이터가 있을 경우 동기적으로 반환
   * 캐시된 데이터가 없으면 null 반환
   */
  getSync(): T | null {
    if (this.hasValidCache()) {
      return this.cache;
    }
    return null;
  }

  /**
   * 캐시 TTL 설정
   */
  setTtl(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }
}
