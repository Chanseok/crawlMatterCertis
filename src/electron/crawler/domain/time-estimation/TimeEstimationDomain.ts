/**
 * TimeEstimationDomain.ts
 * Domain Layer - 시간 예측 도메인 모델
 * 
 * Clean Architecture: 비즈니스 규칙과 도메인 로직의 핵심
 * 외부 의존성이 없는 순수한 도메인 로직
 */

// === Value Objects ===
export class ElapsedTime {
  constructor(public readonly milliseconds: number) {
    if (milliseconds < 0) {
      throw new Error('Elapsed time cannot be negative');
    }
  }

  public get seconds(): number {
    return Math.floor(this.milliseconds / 1000);
  }

  public get minutes(): number {
    return Math.floor(this.seconds / 60);
  }

  public toString(): string {
    const hours = Math.floor(this.minutes / 60);
    const mins = this.minutes % 60;
    const secs = this.seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

export class RemainingTime {
  constructor(public readonly seconds: number) {
    if (seconds < 0) {
      throw new Error('Remaining time cannot be negative');
    }
  }

  public get milliseconds(): number {
    return this.seconds * 1000;
  }

  public countdown(): RemainingTime {
    return new RemainingTime(Math.max(0, this.seconds - 1));
  }

  public toString(): string {
    const hours = Math.floor(this.seconds / 3600);
    const mins = Math.floor((this.seconds % 3600) / 60);
    const secs = this.seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

export class ProgressRate {
  constructor(public readonly percentage: number) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Progress rate must be between 0 and 100');
    }
  }

  public get ratio(): number {
    return this.percentage / 100;
  }

  public isInitial(): boolean {
    return this.percentage < 1; // 1% 미만을 초기로 간주
  }

  public isMinimalForPrediction(): boolean {
    return this.percentage >= 0.5; // 0.5% 이상이면 예측 가능
  }
}

// === Entities ===
export class StageCharacteristics {
  constructor(
    public readonly stageName: string,
    public readonly baseTimePerItem: number,
    public readonly retryPenalty: number,
    public readonly variabilityFactor: number,
    public readonly weightInTotal: number
  ) {}

  public calculateConservativeTime(itemCount: number, retryCount: number): number {
    return itemCount * this.baseTimePerItem * this.variabilityFactor * (1 + retryCount * this.retryPenalty);
  }
}

export class PerformanceMetrics {
  private recentSpeeds: number[] = [];
  private readonly maxHistorySize = 10;
  private stageType?: string; // 단계 타입 추가

  constructor(
    public actualTimePerItem: number,
    public retryCount: number = 0,
    public completedItems: number = 0,
    public totalItems: number = 0,
    stageType?: string
  ) {
    this.stageType = stageType;
  }

  public recordSpeed(timePerItem: number): void {
    this.recentSpeeds.push(timePerItem);
    if (this.recentSpeeds.length > this.maxHistorySize) {
      this.recentSpeeds.shift();
    }
    this.updateActualTime();
  }

  private updateActualTime(): void {
    if (this.recentSpeeds.length === 0) return;
    
    const recentAverage = this.recentSpeeds.reduce((a, b) => a + b) / this.recentSpeeds.length;
    
    // 3단계에서는 거의 변화 없도록 - 극도로 안정적인 가중치 적용
    if (this.stageType === 'PRODUCT_DETAIL') {
      // 3단계: 기존 평균에 극도로 높은 가중치 (97%), 최근 데이터에 극소 가중치 (3%)
      this.actualTimePerItem = (this.actualTimePerItem * 0.97) + (recentAverage * 0.03);
    } else {
      // 1단계: 기존 평균에 높은 가중치 (88%), 최근 데이터에 낮은 가중치 (12%)
      this.actualTimePerItem = (this.actualTimePerItem * 0.88) + (recentAverage * 0.12);
    }
  }

  public getProjectedTimePerItem(): number {
    // 3단계에서는 재시도 영향을 거의 없애고, 매우 안정적인 추정
    if (this.stageType === 'PRODUCT_DETAIL') {
      // 3단계: 재시도 영향 거의 없음 (0.5% 미만)
      return this.actualTimePerItem * (1 + this.retryCount * 0.005);
    } else {
      // 1단계: 재시도 영향 최소화 (3%로 축소)
      return this.actualTimePerItem * (1 + this.retryCount * 0.03);
    }
  }

  public getAverageSpeed(): number {
    return this.actualTimePerItem;
  }

  public getRecentAverageSpeed(count: number = 3): number {
    if (this.recentSpeeds.length === 0) return this.actualTimePerItem;
    
    const recentCount = Math.min(count, this.recentSpeeds.length);
    const recentSpeeds = this.recentSpeeds.slice(-recentCount);
    return recentSpeeds.reduce((a, b) => a + b) / recentSpeeds.length;
  }

  public hasEnoughDataForLearning(minSamples: number = 3): boolean {
    return this.recentSpeeds.length >= minSamples;
  }
}

// === Domain Services ===
export class TimeEstimationAlgorithm {
  public static calculateRemainingTime(
    elapsedTime: ElapsedTime,
    progressRate: ProgressRate,
    characteristics: StageCharacteristics,
    metrics: PerformanceMetrics
  ): RemainingTime {
    // 3단계 제품 상세 정보 수집인지 확인
    const isProductDetail = characteristics.stageName === 'PRODUCT_DETAIL';
    
    // 초기 단계(2% 미만)에서는 보수적 기본 추정값 사용
    if (!progressRate.isMinimalForPrediction()) {
      let conservativeEstimate: number;
      
      if (isProductDetail) {
        // 3단계: 더 정확하고 안정적인 초기 추정
        // 제품 상세 정보 수집은 빠르고 예측 가능하므로 더 정확한 기본값 사용
        conservativeEstimate = characteristics.baseTimePerItem * 
                              Math.max(10, metrics.totalItems || 60) * 
                              1.05; // 3단계는 5% 여유시간만 추가 (더 정확)
      } else {
        // 1단계: 기존 방식 유지 (더 보수적)
        conservativeEstimate = characteristics.baseTimePerItem * 
                              characteristics.variabilityFactor * 
                              Math.max(10, metrics.totalItems || 60);
      }
      
      return new RemainingTime(Math.round(conservativeEstimate));
    }

    const projectedTimePerItem = metrics.getProjectedTimePerItem();
    const remainingItems = this.calculateRemainingItems(progressRate, metrics.totalItems);
    
    let conservativeTime: number;
    
    if (isProductDetail) {
      // 3단계: 안정적인 시간 추정 - 변동성 최소화
      // 실제 성능 데이터에 더 의존하고, 변동성 인자를 최소화
      const stabilityFactor = Math.min(characteristics.variabilityFactor, 1.1); // 최대 10% 여유만 (더 정확)
      conservativeTime = remainingItems * projectedTimePerItem * stabilityFactor;
      
      // 3단계에서는 급격한 시간 증가 방지를 위한 상한선 적용
      const maxReasonableTime = remainingItems * characteristics.baseTimePerItem * 1.5; // 기본 시간의 1.5배 상한 (더 낮춤)
      conservativeTime = Math.min(conservativeTime, maxReasonableTime);
    } else {
      // 1단계: 기존 방식 유지
      conservativeTime = remainingItems * projectedTimePerItem * characteristics.variabilityFactor;
    }

    return new RemainingTime(Math.round(conservativeTime));
  }

  private static calculateRemainingItems(progressRate: ProgressRate, totalItems: number): number {
    if (progressRate.percentage <= 0) {
      return totalItems || 60; // 기본값으로 60개 아이템 가정
    }
    
    // 완료된 아이템 수 계산
    const completedItems = Math.floor((totalItems * progressRate.percentage) / 100);
    const remainingItems = totalItems - completedItems;
    
    return Math.max(0, remainingItems);
  }

  public static calculateInitialEstimate(
    totalPages: number,
    estimatedProducts: number,
    listCharacteristics: StageCharacteristics,
    detailCharacteristics: StageCharacteristics
  ): RemainingTime {
    // 1단계: 페이지 수집 - 실제 관찰 데이터 기반 계산
    let listTime: number;
    if (listCharacteristics.stageName === 'PRODUCT_LIST') {
      // 실제 관찰: 20페이지 → 2분, 5페이지 배치당 30초
      // 배치 크기는 5페이지로 고정 (실제 크롤러 설정 기반)
      const batchSize = 5;
      const secondsPerBatch = listCharacteristics.baseTimePerItem; // 30초/배치
      
      const totalBatches = Math.ceil(totalPages / batchSize);
      listTime = totalBatches * secondsPerBatch * listCharacteristics.variabilityFactor;
      
      console.log(`[TimeEstimation] 🎯 초기 시간 추정 (1단계 - 페이지 수집):`, {
        총페이지: totalPages,
        배치크기: batchSize,
        총배치수: totalBatches,
        배치당시간_초: secondsPerBatch,
        변동성인자: listCharacteristics.variabilityFactor,
        예상총시간_초: listTime.toFixed(1),
        예상총시간_분: (listTime / 60).toFixed(1)
      });
    } else {
      // 기존 방식 (다른 단계용)
      listTime = listCharacteristics.calculateConservativeTime(totalPages, 0);
    }
    
    // 3단계: 제품 상세 정보 수집 - 제품당 계산
    const detailTime = detailCharacteristics.calculateConservativeTime(estimatedProducts, 0);
    
    const totalTime = listTime + detailTime;
    
    console.log(`[TimeEstimation] 🎯 초기 시간 추정 (전체):`, {
      단계1_페이지수집_초: listTime.toFixed(1),
      단계3_제품상세_초: detailTime.toFixed(1),
      총예상시간_초: totalTime.toFixed(1),
      총예상시간_분: (totalTime / 60).toFixed(1),
      페이지수: totalPages,
      예상제품수: estimatedProducts,
      계산방식: '실제_관찰데이터_기반'
    });
    
    return new RemainingTime(Math.round(totalTime));
  }
}
