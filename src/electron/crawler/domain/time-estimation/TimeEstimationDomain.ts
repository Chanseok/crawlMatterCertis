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

  constructor(
    public actualTimePerItem: number,
    public retryCount: number = 0,
    public completedItems: number = 0,
    public totalItems: number = 0
  ) {}

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
    this.actualTimePerItem = (this.actualTimePerItem * 0.7) + (recentAverage * 0.3);
  }

  public getProjectedTimePerItem(): number {
    return this.actualTimePerItem * (1 + this.retryCount * 0.1);
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
    // 초기 단계(2% 미만)에서는 보수적 기본 추정값 사용
    if (!progressRate.isMinimalForPrediction()) {
      // 현재 단계의 기본 시간으로 보수적 추정
      const conservativeEstimate = characteristics.baseTimePerItem * 
                                 characteristics.variabilityFactor * 
                                 Math.max(10, metrics.totalItems || 60); // 전체 아이템 기준으로 추정
      return new RemainingTime(Math.round(conservativeEstimate)); // 초 단위 그대로 사용
    }

    const projectedTimePerItem = metrics.getProjectedTimePerItem();
    const remainingItems = this.calculateRemainingItems(progressRate, metrics.totalItems);
    const conservativeTime = remainingItems * projectedTimePerItem * characteristics.variabilityFactor;

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
    const listTime = listCharacteristics.calculateConservativeTime(totalPages, 0);
    const detailTime = detailCharacteristics.calculateConservativeTime(estimatedProducts, 0);
    
    return new RemainingTime(Math.round(listTime + detailTime));
  }
}
