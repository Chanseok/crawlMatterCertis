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
  // 배치 모드를 위한 전체 크롤링 컨텍스트
  globalContext?: {
    totalPages?: number;
    totalBatches?: number;
    currentBatch?: number;
  };
}

export interface TimeEstimationResult {
  elapsedTime: ElapsedTime;
  remainingTime: RemainingTime;
  confidence: 'low' | 'medium' | 'high';
  lastUpdated: Date;
}

// === Configuration ===
export const STAGE_CONFIGURATIONS = {
  // 1단계: 페이지 목록 수집 - 배치 병렬 처리
  // 실제 경험: 20페이지/2분 = 5페이지 배치당 30초
  // 병렬 처리는 배치 내에서만 적용되며, 배치 간에는 순차 처리
  PRODUCT_LIST: new StageCharacteristics('PRODUCT_LIST', 30, 1.05, 1.02, 0.95), // 30초/배치(5페이지), 극소 변동성
  // 3단계: 제품 상세 정보 수집 - 매우 빠른 처리, 전체 시간의 극소 비중  
  // 실제로는 제품당 0.1-0.3초 정도, 전체 시간의 5% 미만
  PRODUCT_DETAIL: new StageCharacteristics('PRODUCT_DETAIL', 0.15, 1.01, 1.005, 0.05) // 0.15초/제품, 거의 무변동
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
      const smoothedRemaining = await this.applySmoothingAndConservatism(totalRemaining, request.stageId, request);
      
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
      return new PerformanceMetrics(5, 0, 0, totalItems, undefined); // 기본값: 5초/항목
    }
    
    // 단계 타입을 전달하여 단계별 특성 적용
    return new PerformanceMetrics(
      characteristics.baseTimePerItem, 
      0, 
      0, 
      totalItems, 
      characteristics.stageName
    );
  }

  private async learnPerformance(request: UpdateEstimationRequest, metrics: PerformanceMetrics): Promise<void> {
    // 1단계 페이지 수집에서는 배치 처리 특성을 고려한 학습
    const isStage1 = request.stageId.startsWith('stage1') || request.stageId.includes('list') || request.stageId === 'PRODUCT_LIST';
    
    // 배치 처리 모드 감지
    const isBatchMode = request.stageId.includes('batch');
    
    // 📊 성능 학습 시작 로그
    console.log(`[TimeEstimation] 🎯 성능 학습 시작:`, {
      단계: isStage1 ? '1단계(페이지수집)' : '3단계(제품상세)',
      배치모드: isBatchMode,
      진행률: `${request.progressPercentage.toFixed(1)}%`,
      완료항목: request.completedItems,
      총항목: request.totalItems,
      경과시간_초: Math.round(request.elapsedTimeMs / 1000),
      재시도: request.retryCount
    });
    
    // 1단계: 충분한 데이터가 수집된 후에만 학습
    if (isStage1 && request.completedItems >= 3 && request.elapsedTimeMs > 20000) {
      let adjustedTimePerItem: number;
      
      if (isBatchMode) {
        // 배치 처리 모드: 실제 경험 - 5페이지 배치당 약 30초
        // 배치당 처리 시간을 페이지당 평균 시간으로 환산
        const completedBatches = Math.max(Math.floor(request.completedItems / 5), 1);
        const actualTimePerBatch = (request.elapsedTimeMs / 1000) / completedBatches;
        const pagesPerBatch = 5;
        const actualTimePerPage = actualTimePerBatch / pagesPerBatch;
        
        // 배치 처리에서는 병렬 효과가 이미 반영되므로 추가 조정 최소화
        const retryAdjustmentFactor = 1 + (request.retryCount * 0.03); // 재시도 영향 3%로 축소
        adjustedTimePerItem = actualTimePerPage * retryAdjustmentFactor;
        
        // 📊 배치 처리 성능 학습 로그 - 더 자주 출력
        if (request.completedItems % 3 === 0) { // 3페이지마다 로그
          console.log(`[TimeEstimation] 📈 배치 처리 성능 학습:`, {
            완료된_페이지: request.completedItems,
            완료된_배치: completedBatches,
            배치당_실제시간_초: actualTimePerBatch.toFixed(2),
            페이지당_평균시간_초: actualTimePerPage.toFixed(2),
            조정후_시간_초: adjustedTimePerItem.toFixed(2),
            진행률: `${request.progressPercentage.toFixed(1)}%`,
            예상_총배치: Math.ceil((request.totalItems || 20) / 5)
          });
        }
      } else {
        // 일반 처리 모드: 기존 방식
        const actualTimePerPage = (request.elapsedTimeMs / 1000) / request.completedItems;
        const retryAdjustmentFactor = 1 + (request.retryCount * 0.08); // 8%로 축소
        const parallelAdjustmentFactor = 1.03; // 3%로 축소
        adjustedTimePerItem = actualTimePerPage * retryAdjustmentFactor * parallelAdjustmentFactor;
      }
      
      metrics.recordSpeed(adjustedTimePerItem);
      metrics.retryCount = request.retryCount;
      metrics.completedItems = request.completedItems;
      
      // 성능 변화 감지를 매우 보수적으로 적용
      if (metrics.hasEnoughDataForLearning(6)) { // 6개 샘플로 축소하여 더 빠른 학습
        const recentAverage = this.calculateRecentPerformance(metrics, 3); // 최근 3개 평균
        const overallAverage = metrics.getAverageSpeed();
        
        // 변화 임계값을 더 크게 설정 (50% 이상 차이날 때만 조정)
        if (Math.abs(recentAverage - overallAverage) / overallAverage > 0.5) {
          console.log(`[TimeEstimation] ⚡ 1단계 성능 변화 감지 (극도로 보수적):`, {
            전체_평균: overallAverage.toFixed(2),
            최근_평균: recentAverage.toFixed(2),
            변화율: `${((recentAverage - overallAverage) / overallAverage * 100).toFixed(1)}%`,
            배치모드: isBatchMode,
            적용여부: '예'
          });
          
          // 최근 성능 가중치를 더 낮게 설정 (15%만 반영)
          const adaptedSpeed = overallAverage * 0.85 + recentAverage * 0.15;
          metrics.recordSpeed(adaptedSpeed);
        }
      }
    } 
    // 3단계: 제품 상세 정보 수집 - 매우 안정적이고 보수적인 학습
    else if (!isStage1 && request.progressPercentage > 0 && request.elapsedTimeMs > 10000) { // 10초 후부터 학습 (더 빠르게 시작)
      const isStage3 = request.stageId.startsWith('stage3') || request.stageId === 'PRODUCT_DETAIL' || request.stageId.includes('detail');
      
      if (isStage3 && request.completedItems >= 2) { // 최소 2개 완료 후부터 (더 빠른 학습)
        // 3단계: 제품 상세 정보 - 매우 안정적이고 보수적인 학습
        const actualTimePerItem = (request.elapsedTimeMs / 1000) / Math.max(request.completedItems, 1);
        
        // 3단계는 재시도가 적고 안정적이므로 최소한의 조정만
        const retryAdjustmentFactor = 1 + (request.retryCount * 0.02); // 재시도 영향 2%로 더 축소
        const adjustedTimePerItem = actualTimePerItem * retryAdjustmentFactor;
        
        // 📊 3단계 성능 학습 로그 - 더 자주 출력하여 가시성 향상
        if (request.completedItems % 3 === 0) { // 3개마다 로그
          console.log(`[TimeEstimation] 🔍 3단계 성능 학습 (극도 안정화):`, {
            완료된_제품: request.completedItems,
            총_제품: request.totalItems,
            실제_제품당시간_초: actualTimePerItem.toFixed(3),
            조정후_시간_초: adjustedTimePerItem.toFixed(3),
            진행률: `${request.progressPercentage.toFixed(1)}%`,
            재시도_영향: `+${(request.retryCount * 2).toFixed(1)}%`
          });
        }
        
        // 3단계에서는 매우 보수적인 학습
        metrics.recordSpeed(adjustedTimePerItem);
        metrics.retryCount = request.retryCount;
        metrics.completedItems = request.completedItems;
        
        // 3단계에서는 성능 변화 감지를 거의 하지 않음 - 최소 6개 이후, 매우 큰 변화만
        if (metrics.hasEnoughDataForLearning(6)) { // 6개 샘플로 축소
          const recentAverage = this.calculateRecentPerformance(metrics, 4); // 최근 4개 평균
          const overallAverage = metrics.getAverageSpeed();
          
          // 변화 임계값을 극도로 크게 설정 (70% 이상 차이날 때만 조정)
          if (Math.abs(recentAverage - overallAverage) / overallAverage > 0.7) {
            console.log(`[TimeEstimation] 🔄 3단계 성능 변화 감지 (극한적 보수):`, {
              전체_평균: overallAverage.toFixed(3),
              최근_평균: recentAverage.toFixed(3),
              변화율: `${((recentAverage - overallAverage) / overallAverage * 100).toFixed(1)}%`,
              적용여부: '극소량만'
            });
            
            // 3단계에서는 최근 성능 가중치를 극소량만 반영 (10%만)
            const adaptedSpeed = overallAverage * 0.9 + recentAverage * 0.1;
            metrics.recordSpeed(adaptedSpeed);
          }
        }
      } else if (!isStage3) {
        // 기타 단계들 (기존 로직을 더 보수적으로)
        if (request.completedItems >= 2) { // 더 빠른 시작
          const actualTimePerItem = (request.elapsedTimeMs / 1000) / Math.max(request.completedItems, 1);
          const adjustedTimePerItem = actualTimePerItem * (1 + request.retryCount * 0.12);
          
          metrics.recordSpeed(adjustedTimePerItem);
          metrics.retryCount = request.retryCount;
          metrics.completedItems = request.completedItems;
        }
      }
    }
  }

  /**
   * 최근 N개 항목의 평균 성능 계산
   */
  private calculateRecentPerformance(metrics: PerformanceMetrics, recentCount: number): number {
    return metrics.getRecentAverageSpeed(recentCount);
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

  private async applySmoothingAndConservatism(
    newEstimate: RemainingTime, 
    stageId?: string,
    request?: UpdateEstimationRequest
  ): Promise<RemainingTime> {
    // 3단계 제품 상세 정보 수집인지 확인
    const isProductDetail = stageId?.startsWith('stage3') || stageId === 'PRODUCT_DETAIL' || stageId?.includes('detail');
    
    // 추정 히스토리 로드
    this.estimationHistory = await this.repository.loadEstimationHistory();
    
    console.log(`[TimeEstimation] 🎛️ 스무딩 적용 시작:`, {
      단계: isProductDetail ? '3단계(제품상세)' : '1단계(페이지수집)',
      새로운_추정_초: newEstimate.seconds,
      히스토리_길이: this.estimationHistory.length,
      이전_추정: this.estimationHistory.length > 0 ? this.estimationHistory[this.estimationHistory.length - 1] : '없음'
    });
    
    // 매우 강력한 스무딩 적용 - 3단계에서는 거의 변화 없음
    let smoothedValue = newEstimate.seconds;
    if (this.estimationHistory.length > 0) {
      const previousEstimate = this.estimationHistory[this.estimationHistory.length - 1];
      
      // 배치 모드 초기 단계 감지: 진행률 5% 미만이고 배치 모드인 경우
      const isBatchInitialPhase = request && 
                                  (request.globalContext?.totalBatches || 0) > 1 && 
                                  request.progressPercentage < 5;
      
      if (isProductDetail) {
        // 3단계: 거의 변화 허용 안함 - 최대 2% 변화만 (더 강화)
        const maxChange = Math.max(Math.abs(previousEstimate * 0.02), 0.5); // 최소 0.5초는 변화 허용
        
        if (Math.abs(newEstimate.seconds - previousEstimate) > maxChange) {
          const direction = newEstimate.seconds > previousEstimate ? 1 : -1;
          smoothedValue = Math.round(previousEstimate + (maxChange * direction));
          
          console.log(`[TimeEstimation] 🔒 3단계 극도 안정화: ${newEstimate.seconds}초 → ${smoothedValue}초 (이전: ${previousEstimate}초, 최대변화: ${maxChange.toFixed(1)}초)`);
        }
      } else if (isBatchInitialPhase) {
        // 배치 모드 초기: 큰 변화 허용 - 최대 300% 변화 허용
        const maxChange = Math.max(Math.abs(previousEstimate * 3.0), 30); // 최대 30초 변화 허용
        
        if (Math.abs(newEstimate.seconds - previousEstimate) > maxChange) {
          const direction = newEstimate.seconds > previousEstimate ? 1 : -1;
          smoothedValue = Math.round(previousEstimate + (maxChange * direction));
          
          console.log(`[TimeEstimation] 🚀 배치 초기 관대한 스무딩: ${newEstimate.seconds}초 → ${smoothedValue}초 (이전: ${previousEstimate}초, 최대변화: ${maxChange.toFixed(1)}초)`);
        } else {
          console.log(`[TimeEstimation] ✅ 배치 초기 변화 수용: ${newEstimate.seconds}초 (이전: ${previousEstimate}초, 변화량 허용범위 내)`);
        }
      } else {
        // 1단계 일반: 보수적 변화 허용 - 최대 8% (더 강화)
        const maxChange = Math.max(Math.abs(previousEstimate * 0.08), 2); // 최소 2초는 변화 허용
        
        if (Math.abs(newEstimate.seconds - previousEstimate) > maxChange) {
          const direction = newEstimate.seconds > previousEstimate ? 1 : -1;
          smoothedValue = Math.round(previousEstimate + (maxChange * direction));
          
          console.log(`[TimeEstimation] 📈 1단계 강력한 스무딩: ${newEstimate.seconds}초 → ${smoothedValue}초 (이전: ${previousEstimate}초, 최대변화: ${maxChange.toFixed(1)}초)`);
        }
      }
    } else {
      console.log(`[TimeEstimation] 📋 첫 번째 추정: ${smoothedValue}초 (스무딩 없음)`);
    }
    
    // 스무딩된 값을 히스토리에 추가
    this.estimationHistory.push(smoothedValue);
    
    // 더 긴 히스토리 유지로 더 안정적인 스무딩
    if (this.estimationHistory.length > 10) { // 10개로 확장
      this.estimationHistory.shift();
    }

    // 3단계에서는 거의 보정 없음
    const conservativeRate = isProductDetail ? 1.002 : 1.01; // 3단계: 0.2%, 1단계: 1%
    const conservativeValue = Math.round(smoothedValue * conservativeRate);
    
    console.log(`[TimeEstimation] ✅ 최종 결과:`, {
      단계: isProductDetail ? '3단계(제품상세)' : '1단계(페이지수집)',
      스무딩후: smoothedValue,
      보정률: isProductDetail ? '0.2%' : '1.0%',
      최종시간_초: conservativeValue,
      히스토리_크기: this.estimationHistory.length
    });
    
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
    // 3단계 제품 상세 정보 수집인지 확인
    const isProductDetail = characteristics.stageName === 'PRODUCT_DETAIL';
    // 배치 처리 모드 감지
    const isBatchMode = request.stageId.includes('batch');
    
    console.log(`[TimeEstimation] 🎯 통합 시간 계산 시작:`, {
      단계: isProductDetail ? '3단계(제품상세)' : '1단계(페이지수집)',
      배치모드: isBatchMode,
      진행률: `${progressRate.percentage.toFixed(1)}%`,
      완료항목: request.completedItems,
      총항목: metrics.totalItems,
      경과시간_초: Math.round(elapsedTime.seconds)
    });
    
    // 초기 단계에서는 보수적 추정
    if (progressRate.percentage < 1) {
      if (isProductDetail) {
        // 3단계 초기: 매우 짧은 시간으로 추정 (실제로는 매우 빠름)
        const totalProducts = metrics.totalItems || 60;
        const baseEstimate = characteristics.baseTimePerItem * totalProducts * 1.05; // 5% 여유만
        const finalEstimate = Math.min(baseEstimate, 15); // 최대 15초
        
        console.log(`[TimeEstimation] 📋 3단계 초기 추정: ${totalProducts}개 제품 → ${finalEstimate}초`);
        return new RemainingTime(Math.round(finalEstimate));
      } else if (isBatchMode) {
        // 1단계 배치 처리: 전체 크롤링 컨텍스트를 활용한 정확한 추정
        // 전역 컨텍스트가 있으면 사용, 없으면 기본값 추정
        const totalPages = request.globalContext?.totalPages || metrics.totalItems || 20;
        const totalBatches = request.globalContext?.totalBatches || Math.ceil(totalPages / 5);
        const maxConcurrency = 16; // 병렬 처리 최대 크기
        const batchSize = 5; // 기본 배치 크기
        
        // 배치 크기가 병렬 처리 한도보다 작은 경우와 큰 경우를 구분
        let estimatedTime: number;
        if (batchSize <= maxConcurrency) {
          // 배치 전체가 병렬 처리됨: 하지만 실제로는 30초/배치 소요
          // 실제 관찰 데이터: 20페이지(4배치) → 2분, 14페이지(3배치) → 1.5분
          const timePerBatch = 30; // 실제 관찰된 배치당 소요 시간
          estimatedTime = totalBatches * timePerBatch;
        } else {
          // 배치가 병렬 처리 한도 초과: 배치 내에서도 순차 처리 필요
          const parallelSetsPerBatch = Math.ceil(batchSize / maxConcurrency);
          const timePerParallelSet = 6; // 병렬 세트당 시간
          const timePerBatch = parallelSetsPerBatch * timePerParallelSet;
          estimatedTime = totalBatches * timePerBatch;
        }
        
        const finalEstimate = estimatedTime * 1.05; // 5% 여유
        
        console.log(`[TimeEstimation] 📋 1단계 개선된 배치 초기 추정:`, {
          총페이지: totalPages,
          배치크기: batchSize,
          최대병렬처리: maxConcurrency,
          총배치수: totalBatches,
          배치당예상시간_초: batchSize <= maxConcurrency ? 30 : Math.ceil(batchSize / maxConcurrency) * 6, // 실제 사용값으로 수정
          총예상시간_초: Math.round(finalEstimate),
          병렬처리모드: batchSize <= maxConcurrency ? '전체병렬' : '부분병렬',
          전역컨텍스트: request.globalContext ? '사용' : '기본값'
        });
        
        return new RemainingTime(Math.round(finalEstimate));
      } else {
        // 1단계 일반 처리: 기존 방식
        const totalPages = metrics.totalItems || 60;
        const baseEstimate = characteristics.baseTimePerItem * characteristics.variabilityFactor * totalPages;
        
        console.log(`[TimeEstimation] 📋 1단계 일반 초기 추정: ${totalPages}페이지 → ${Math.round(baseEstimate)}초`);
        return new RemainingTime(Math.round(baseEstimate));
      }
    }
    
    // 충분한 데이터가 있는 경우
    if (isProductDetail) {
      // 3단계: 매우 보수적이고 짧은 시간 추정
      const actualSpeed = elapsedTime.milliseconds / Math.max(request.completedItems, 1);
      const conservativeSpeed = actualSpeed * 1.01; // 1% 여유만 (매우 보수적)
      const remainingItems = (metrics.totalItems || 60) - request.completedItems;
      
      const estimatedTime = (remainingItems * conservativeSpeed) / 1000;
      const finalEstimate = Math.min(Math.max(estimatedTime, 2), 20); // 2-20초 범위
      
      console.log(`[TimeEstimation] 🔍 3단계 실시간 추정:`, {
        실제속도_ms: actualSpeed.toFixed(1),
        남은제품: remainingItems,
        추정시간_초: finalEstimate.toFixed(1),
        범위: '2-20초'
      });
      
      return new RemainingTime(Math.round(finalEstimate));
    } else if (isBatchMode) {
      // 1단계 배치 처리: 전체 크롤링 컨텍스트를 활용한 정확한 배치 단위 계산
      const batchSize = 5; // 기본 배치 크기
      const maxConcurrency = 16; // 병렬 처리 최대 크기
      const completedBatches = Math.floor(request.completedItems / batchSize);
      
      // 전역 컨텍스트 활용
      const totalPages = request.globalContext?.totalPages || metrics.totalItems || 20;
      const totalBatches = request.globalContext?.totalBatches || Math.ceil(totalPages / batchSize);
      const remainingBatches = totalBatches - completedBatches;
      
      if (completedBatches > 0) {
        // 실제 배치 처리 시간 기반 계산
        const actualTimePerBatch = elapsedTime.milliseconds / completedBatches;
        let projectedTimePerBatch: number;
        
        // 배치 크기가 병렬 처리 한도 이하면 병렬 효과 적용
        if (batchSize <= maxConcurrency) {
          // 배치 전체가 병렬 처리: 실제 시간이 이미 병렬 효과를 반영함
          projectedTimePerBatch = actualTimePerBatch * 1.02; // 2% 여유만
        } else {
          // 배치가 병렬 처리 한도 초과: 배치 내 순차 처리 고려
          projectedTimePerBatch = actualTimePerBatch * 1.05; // 5% 여유
        }
        
        const estimatedTime = (remainingBatches * projectedTimePerBatch) / 1000;
        const finalEstimate = Math.max(estimatedTime, 6); // 최소 6초 (병렬 처리 효과)
        
        console.log(`[TimeEstimation] 📈 1단계 개선된 배치 실시간 추정:`, {
          배치크기: batchSize,
          최대병렬처리: maxConcurrency,
          완료배치: completedBatches,
          총배치수: totalBatches,
          남은배치: remainingBatches,
          배치당실제시간_ms: actualTimePerBatch.toFixed(0),
          배치당예상시간_ms: projectedTimePerBatch.toFixed(0),
          병렬효과적용: batchSize <= maxConcurrency ? '전체병렬' : '부분병렬',
          추정시간_초: finalEstimate.toFixed(1),
          전역컨텍스트: request.globalContext ? '사용' : '기본값',
          전체페이지: totalPages
        });
        
        return new RemainingTime(Math.round(finalEstimate));
      } else {
        // 아직 배치 완료 없음: 병렬 처리를 고려한 기본 추정
        let timePerBatch: number;
        if (batchSize <= maxConcurrency) {
          // 배치 전체가 병렬 처리: 약 6초/배치 (가장 느린 페이지 시간)
          timePerBatch = 6;
        } else {
          // 배치가 병렬 처리 한도 초과: 순차 처리 고려
          const parallelSetsPerBatch = Math.ceil(batchSize / maxConcurrency);
          timePerBatch = parallelSetsPerBatch * 6; // 병렬 세트당 6초
        }
        
        const estimatedTime = remainingBatches * timePerBatch;
        
        console.log(`[TimeEstimation] 📋 1단계 개선된 배치 기본 추정:`, {
          배치크기: batchSize,
          최대병렬처리: maxConcurrency,
          남은배치: remainingBatches,
          총배치수: totalBatches,
          배치당예상시간_초: timePerBatch,
          병렬효과: batchSize <= maxConcurrency ? '전체병렬' : '부분병렬',
          총예상시간_초: estimatedTime,
          전역컨텍스트: request.globalContext ? '사용' : '기본값',
          전체페이지: totalPages
        });
        
        return new RemainingTime(Math.round(estimatedTime));
      }
    } else {
      // 1단계 일반 처리: 기존 방식
      const actualSpeed = elapsedTime.milliseconds / Math.max(request.completedItems, 1);
      const projectedSpeed = actualSpeed * characteristics.variabilityFactor;
      const remainingItems = (metrics.totalItems || 60) - request.completedItems;
      
      const estimatedTime = (remainingItems * projectedSpeed) / 1000;
      const finalEstimate = Math.max(estimatedTime, 20); // 최소 20초
      
      console.log(`[TimeEstimation] 📈 1단계 일반 실시간 추정:`, {
        실제속도_ms: actualSpeed.toFixed(1),
        예상속도_ms: projectedSpeed.toFixed(1),
        남은페이지: remainingItems,
        추정시간_초: finalEstimate.toFixed(1)
      });
      
      return new RemainingTime(Math.round(finalEstimate));
    }
  }
}

export class StartCountdownUseCase {
  public execute(initialRemainingTime: RemainingTime): RemainingTime {
    return initialRemainingTime.countdown();
  }
}
