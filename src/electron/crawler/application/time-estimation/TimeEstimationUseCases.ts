/**
 * TimeEstimationUseCases.ts
 * Application Layer - 시간 예측 비즈니스 로직 조합
 * 
 * Clean Architecture: Use Cases 계층
 * 도메인 모델을 조합하여 애플리케이션의 특정 비즈니스 시나리오 구현
 */

import {
  ElapsedTime,
  RemainingTime,
  ProgressRate,
  StageCharacteristics,
  PerformanceMetrics,
  TimeEstimationAlgorithm
} from '../../domain/time-estimation/TimeEstimationDomain.js';

// === Repository Interfaces (Infrastructure에서 구현) ===
export interface ITimeEstimationRepository {
  saveMetrics(stageId: string, metrics: PerformanceMetrics): Promise<void>;
  loadMetrics(stageId: string): Promise<PerformanceMetrics | null>;
  saveEstimationHistory(history: number[]): Promise<void>;
  loadEstimationHistory(): Promise<number[]>;
}

// === Use Case Input/Output DTOs ===
export interface EstimateInitialTimeRequest {
  totalPages: number;
  estimatedProducts: number;
}

export interface UpdateEstimationRequest {
  stageId: string;
  progressPercentage: number;
  elapsedTimeMs: number;
  retryCount: number;
  totalItems: number;
  completedItems: number;
}

export interface TimeEstimationResult {
  elapsedTime: ElapsedTime;
  remainingTime: RemainingTime;
  confidence: 'low' | 'medium' | 'high';
  lastUpdated: Date;
}

// === Configuration ===
export const STAGE_CONFIGURATIONS = {
  PRODUCT_LIST: new StageCharacteristics('PRODUCT_LIST', 2, 1.5, 1.3, 0.4),
  PRODUCT_DETAIL: new StageCharacteristics('PRODUCT_DETAIL', 5, 2.0, 1.4, 0.6)
} as const;

// === Use Cases ===
export class EstimateInitialTimeUseCase {
  constructor(private repository: ITimeEstimationRepository) {}

  public async execute(request: EstimateInitialTimeRequest): Promise<RemainingTime> {
    const listCharacteristics = STAGE_CONFIGURATIONS.PRODUCT_LIST;
    const detailCharacteristics = STAGE_CONFIGURATIONS.PRODUCT_DETAIL;

    const initialEstimate = TimeEstimationAlgorithm.calculateInitialEstimate(
      request.totalPages,
      request.estimatedProducts,
      listCharacteristics,
      detailCharacteristics
    );

    // 추정 히스토리에 저장
    const history = await this.repository.loadEstimationHistory();
    history.push(initialEstimate.seconds);
    await this.repository.saveEstimationHistory(history);

    return initialEstimate;
  }
}

export class UpdateTimeEstimationUseCase {
  private estimationHistory: number[] = [];
  
  constructor(private repository: ITimeEstimationRepository) {}

  public async execute(request: UpdateEstimationRequest): Promise<TimeEstimationResult> {
    try {
      // 현재 단계 메트릭스 로드 또는 초기화
      const metrics = await this.loadOrInitializeMetrics(request.stageId, request.totalItems);
      
      // 성능 학습
      await this.learnPerformance(request, metrics);
      
      // 시간 예측 계산
      const elapsedTime = new ElapsedTime(request.elapsedTimeMs);
      const progressRate = new ProgressRate(request.progressPercentage);
      const characteristics = this.getStageCharacteristics(request.stageId);
      
      const currentStageRemaining = this.calculateUnifiedRemainingTime(
        elapsedTime,
        progressRate,
        characteristics,
        metrics,
        request
      );
      
      // 미래 단계 시간 추가 (더 보수적으로)
      const futureStagesTime = await this.calculateFutureStagesTime(request.stageId, request.totalItems);
      const totalRemaining = new RemainingTime(currentStageRemaining.seconds + futureStagesTime.seconds);
      
      // 스무딩 및 보수적 조정 적용
      const smoothedRemaining = await this.applySmoothingAndConservatism(totalRemaining);
      
      // 신뢰도 계산
      const confidence = this.calculateConfidence(progressRate, metrics);
      
      // 결과 저장
      await this.repository.saveMetrics(request.stageId, metrics);
      
      return {
        elapsedTime,
        remainingTime: smoothedRemaining,
        confidence,
        lastUpdated: new Date()
      };
    } catch (error) {
      // UseCase 실패 시 간단한 계산으로 폴백
      console.error('[UpdateTimeEstimationUseCase] 실행 실패:', error);
      
      const elapsedTime = new ElapsedTime(request.elapsedTimeMs);
      
      // 더 나은 fallback 로직 - 항상 동적인 계산 제공
      let simpleRemainingMs: number;
      
      if (request.progressPercentage > 0) {
        // 진행률 기반 계산
        const estimatedTotalTime = request.elapsedTimeMs / (request.progressPercentage / 100);
        simpleRemainingMs = estimatedTotalTime - request.elapsedTimeMs;
        // 보수적 조정 (10% 여유시간)
        simpleRemainingMs = simpleRemainingMs * 1.1;
      } else {
        // 초기 단계에서는 아이템 수 기반 보수적 추정
        const estimatedItemsPerSecond = 0.2; // 5초/아이템
        const estimatedTime = (request.totalItems || 60) / estimatedItemsPerSecond * 1000;
        simpleRemainingMs = Math.max(estimatedTime, 900000); // 최소 15분
      }
      
      return {
        elapsedTime,
        remainingTime: new RemainingTime(Math.floor(Math.max(simpleRemainingMs, 60000) / 1000)), // 최소 1분
        confidence: 'low',
        lastUpdated: new Date()
      };
    }
  }

  private async loadOrInitializeMetrics(stageId: string, totalItems: number): Promise<PerformanceMetrics> {
    const existingMetrics = await this.repository.loadMetrics(stageId);
    if (existingMetrics) {
      // 기존 메트릭이 totalItems 속성이 없거나 다를 수 있으므로 업데이트
      existingMetrics.totalItems = totalItems;
      return existingMetrics;
    }

    const characteristics = this.getStageCharacteristics(stageId);
    
    // characteristics가 null이나 undefined인 경우 방어
    if (!characteristics || typeof characteristics.baseTimePerItem !== 'number') {
      console.error(`[TimeEstimationUseCases] Invalid characteristics for stageId: ${stageId}`, characteristics);
      // 안전한 기본값으로 PerformanceMetrics 생성
      return new PerformanceMetrics(5, 0, 0, totalItems); // 기본값: 5초/항목
    }
    
    return new PerformanceMetrics(characteristics.baseTimePerItem, 0, 0, totalItems);
  }

  private async learnPerformance(request: UpdateEstimationRequest, metrics: PerformanceMetrics): Promise<void> {
    if (request.progressPercentage > 0 && request.elapsedTimeMs > 10000) { // 10초 후부터 학습 (더 빨라짐)
      const actualTimePerItem = (request.elapsedTimeMs / 1000) / Math.max(request.completedItems, 1);
      const adjustedTimePerItem = actualTimePerItem * (1 + request.retryCount * 0.2);
      
      metrics.recordSpeed(adjustedTimePerItem);
      metrics.retryCount = request.retryCount;
      metrics.completedItems = request.completedItems;
    }
  }

  private getStageCharacteristics(stageId: string): StageCharacteristics {
    // stageId 매핑: 더 포괄적인 매핑
    let mappedStageId: keyof typeof STAGE_CONFIGURATIONS;
    
    // 1단계 관련 ID들
    if (stageId.startsWith('stage1') || stageId === 'PRODUCT_LIST' || stageId.includes('list')) {
      mappedStageId = 'PRODUCT_LIST';
    } 
    // 2단계 또는 3단계 관련 ID들 (stage2_, stage3_, detail, product 등)
    else if (stageId.startsWith('stage2') || stageId.startsWith('stage3') || 
             stageId === 'PRODUCT_DETAIL' || stageId.includes('detail') || 
             stageId.includes('product') || stageId === '3') {
      mappedStageId = 'PRODUCT_DETAIL';
    } 
    // 숫자만 있는 경우
    else if (stageId === '1') {
      mappedStageId = 'PRODUCT_LIST';
    }
    else {
      // 알 수 없는 stageId의 경우 기본값으로 PRODUCT_DETAIL 사용 (더 일반적)
      console.warn(`[TimeEstimationUseCases] Unknown stageId: ${stageId}, defaulting to PRODUCT_DETAIL`);
      mappedStageId = 'PRODUCT_DETAIL';
    }
    
    const characteristics = STAGE_CONFIGURATIONS[mappedStageId];
    if (!characteristics) {
      throw new Error(`[TimeEstimationUseCases] No characteristics found for stageId: ${stageId} (mapped to: ${mappedStageId})`);
    }
    
    return characteristics;
  }

  private async calculateFutureStagesTime(currentStageId: string, totalItems: number = 60): Promise<RemainingTime> {
    // stage1 또는 list 관련 단계에서는 미래 단계 (상세 정보 수집) 시간 예측
    if (currentStageId.includes('stage1') || currentStageId.includes('list') || currentStageId === 'PRODUCT_LIST') {
      const detailMetrics = await this.repository.loadMetrics('PRODUCT_DETAIL');
      const detailCharacteristics = STAGE_CONFIGURATIONS.PRODUCT_DETAIL;
      
      const estimatedTimePerItem = detailMetrics?.actualTimePerItem || detailCharacteristics.baseTimePerItem;
      const estimatedProductCount = Math.max(totalItems, 60); // 실제 totalItems 사용
      
      const futureTime = estimatedProductCount * estimatedTimePerItem * detailCharacteristics.variabilityFactor;
      return new RemainingTime(Math.round(futureTime));
    }
    
    // 이미 마지막 단계인 경우 추가 시간 없음
    return new RemainingTime(0);
  }

  private async applySmoothingAndConservatism(newEstimate: RemainingTime): Promise<RemainingTime> {
    // 추정 히스토리 로드
    this.estimationHistory = await this.repository.loadEstimationHistory();
    
    // 급격한 변화 방지 (스무딩) - 히스토리에 추가하기 전에 스무딩 적용
    let smoothedValue = newEstimate.seconds;
    if (this.estimationHistory.length > 0) {
      const previousEstimate = this.estimationHistory[this.estimationHistory.length - 1];
      const maxChange = Math.abs(previousEstimate * 0.20); // 20% 변화 허용 (더 빠른 조정)
      
      if (Math.abs(newEstimate.seconds - previousEstimate) > maxChange) {
        const direction = newEstimate.seconds > previousEstimate ? 1 : -1;
        smoothedValue = Math.round(previousEstimate + (maxChange * direction));
        
        console.log(`[TimeEstimation] 급격한 변화 조정: ${newEstimate.seconds}초 → ${smoothedValue}초 (이전: ${previousEstimate}초)`);
      }
    }
    
    // 스무딩된 값을 히스토리에 추가
    this.estimationHistory.push(smoothedValue);
    
    if (this.estimationHistory.length > 6) { // 더 짧은 히스토리로 빠른 적응
      this.estimationHistory.shift();
    }

    // 보수적 보정 (3% 여유시간) - 더 적은 여유시간으로 빠른 피드백
    const conservativeValue = Math.round(smoothedValue * 1.03);
    
    // 히스토리 저장
    await this.repository.saveEstimationHistory(this.estimationHistory);
    
    return new RemainingTime(conservativeValue);
  }

  private calculateConfidence(progressRate: ProgressRate, metrics: PerformanceMetrics): 'low' | 'medium' | 'high' {
    if (progressRate.percentage < 10) return 'low';
    if (progressRate.percentage < 30 || metrics.retryCount > 3) return 'medium';
    return 'high';
  }

  // 새로운 통합 시간 계산 메서드
  private calculateUnifiedRemainingTime(
    elapsedTime: ElapsedTime,
    progressRate: ProgressRate,
    characteristics: StageCharacteristics,
    metrics: PerformanceMetrics,
    request: UpdateEstimationRequest
  ): RemainingTime {
    // 초기 단계에서는 보수적 추정 (2%에서 1%로 낮춤)
    if (progressRate.percentage < 1) {
      const baseEstimate = characteristics.baseTimePerItem * 
                          characteristics.variabilityFactor * 
                          (metrics.totalItems || 60);
      return new RemainingTime(Math.round(baseEstimate));
    }
    
    // 충분한 데이터가 있는 경우 실제 성능 기반 계산
    const actualSpeed = elapsedTime.milliseconds / Math.max(request.completedItems, 1);
    const projectedSpeed = actualSpeed * characteristics.variabilityFactor;
    const remainingItems = (metrics.totalItems || 60) - request.completedItems;
    
    const estimatedTime = (remainingItems * projectedSpeed) / 1000;
    return new RemainingTime(Math.round(Math.max(estimatedTime, 30))); // 최소 30초
  }
}

export class StartCountdownUseCase {
  public execute(initialRemainingTime: RemainingTime): RemainingTime {
    return initialRemainingTime.countdown();
  }
}
