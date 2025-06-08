/**
 * ProgressUtils - 진행률 계산 유틸리티 함수 통합
 * 
 * 분산된 진행률 계산 로직을 하나로 통합하여 일관성 있는 진행률 처리를 제공합니다.
 * Clean Code 원칙에 따라 계산 로직의 책임을 명확히 분리합니다.
 */

export interface StageProgressInfo {
  stage: number;
  currentPage: number;
  totalPages: number;
  successCount: number;
  failureCount: number;
}

export interface OverallProgressInfo {
  currentStage: number;
  totalStages: number;
  stageProgresses: number[];
  overallPercentage: number;
}

export class ProgressUtils {
  /**
   * 단일 스테이지의 진행률을 계산
   * 
   * @param currentPage 현재 페이지
   * @param totalPages 전체 페이지 수
   * @param successCount 성공한 페이지 수 (선택사항)
   * @returns 0-100 사이의 진행률
   * 
   * @example
   * ProgressUtils.calculateStageProgress(30, 100) // 30
   * ProgressUtils.calculateStageProgress(25, 100, 30) // 30 (successCount가 더 클 때)
   */
  static calculateStageProgress(
    currentPage: number,
    totalPages: number,
    successCount: number = 0
  ): number {
    if (totalPages <= 0) return 0;
    
    // 현재 페이지와 성공 카운트 중 더 큰 값을 사용
    const effectiveProgress = Math.max(currentPage, successCount);
    const progress = effectiveProgress / totalPages;
    
    // 0-100 범위로 제한
    return Math.min(Math.max(progress * 100, 0), 100);
  }

  /**
   * 여러 스테이지의 전체 진행률을 계산
   * 
   * @param currentStage 현재 스테이지 (1부터 시작)
   * @param totalStages 전체 스테이지 수
   * @param currentStageProgress 현재 스테이지의 진행률 (0-100)
   * @returns 0-100 사이의 전체 진행률
   * 
   * @example
   * ProgressUtils.calculateOverallProgress(2, 3, 50) // 50 (2단계 중 50% 완료)
   */
  static calculateOverallProgress(
    currentStage: number,
    totalStages: number,
    currentStageProgress: number
  ): number {
    if (totalStages <= 0) return 0;
    if (currentStage <= 0) return 0;
    
    // 완료된 스테이지들의 진행률 (100%)
    const completedStages = Math.max(0, currentStage - 1);
    const completedProgress = (completedStages / totalStages) * 100;
    
    // 현재 스테이지의 부분 진행률
    const currentStageWeight = (1 / totalStages) * 100;
    const currentProgress = (currentStageProgress / 100) * currentStageWeight;
    
    const totalProgress = completedProgress + currentProgress;
    
    return Math.min(Math.max(totalProgress, 0), 100);
  }

  /**
   * 가중치를 적용한 전체 진행률 계산
   * 
   * @param stageProgresses 각 스테이지별 진행률 배열
   * @param stageWeights 각 스테이지별 가중치 배열 (선택사항)
   * @returns 0-100 사이의 가중 평균 진행률
   * 
   * @example
   * ProgressUtils.calculateWeightedProgress([100, 50, 0], [0.3, 0.5, 0.2]) // 55
   */
  static calculateWeightedProgress(
    stageProgresses: number[],
    stageWeights?: number[]
  ): number {
    if (stageProgresses.length === 0) return 0;
    
    // 가중치가 없으면 균등 분배
    const weights = stageWeights || stageProgresses.map(() => 1 / stageProgresses.length);
    
    // 가중치 배열 길이가 다르면 조정
    if (weights.length !== stageProgresses.length) {
      throw new Error('Stage progresses and weights arrays must have the same length');
    }
    
    // 가중치 정규화
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) return 0;
    
    const normalizedWeights = weights.map(weight => weight / totalWeight);
    
    // 가중 평균 계산
    const weightedSum = stageProgresses.reduce(
      (sum, progress, index) => sum + (progress * normalizedWeights[index]),
      0
    );
    
    return Math.min(Math.max(weightedSum, 0), 100);
  }

  /**
   * 진행률을 기반으로 예상 완료 시간 계산
   * 
   * @param currentProgress 현재 진행률 (0-100)
   * @param elapsedMs 경과 시간(밀리초)
   * @returns 예상 완료까지 남은 시간(밀리초)
   * 
   * @example
   * ProgressUtils.calculateEstimatedTimeRemaining(30, 60000) // 140000 (약 2분 20초)
   */
  static calculateEstimatedTimeRemaining(
    currentProgress: number,
    elapsedMs: number
  ): number {
    if (currentProgress <= 0) return Number.MAX_SAFE_INTEGER;
    if (currentProgress >= 100) return 0;
    
    const progressRatio = currentProgress / 100;
    const estimatedTotalTime = elapsedMs / progressRatio;
    const remainingTime = estimatedTotalTime - elapsedMs;
    
    return Math.max(0, remainingTime);
  }

  /**
   * 진행률 애니메이션을 위한 부드러운 전환 값 계산
   * 
   * @param currentValue 현재 값
   * @param targetValue 목표 값
   * @param animationProgress 애니메이션 진행률 (0-1)
   * @param easeFunction 이징 함수 (선택사항)
   * @returns 부드럽게 전환된 값
   * 
   * @example
   * ProgressUtils.calculateSmoothTransition(20, 80, 0.5) // 50
   */
  static calculateSmoothTransition(
    currentValue: number,
    targetValue: number,
    animationProgress: number,
    easeFunction?: (t: number) => number
  ): number {
    // 기본 이징 함수 (ease-out)
    const defaultEase = (t: number) => 1 - Math.pow(1 - t, 3);
    const ease = easeFunction || defaultEase;
    
    const easedProgress = ease(Math.min(Math.max(animationProgress, 0), 1));
    const difference = targetValue - currentValue;
    
    return currentValue + (difference * easedProgress);
  }

  /**
   * 진행률을 시각적 상태로 변환
   * 
   * @param progress 진행률 (0-100)
   * @returns 진행률에 따른 상태 문자열
   * 
   * @example
   * ProgressUtils.getProgressStatus(85) // "거의 완료"
   */
  static getProgressStatus(progress: number): 'idle' | 'starting' | 'in-progress' | 'nearly-complete' | 'complete' {
    if (progress <= 0) return 'idle';
    if (progress < 10) return 'starting';
    if (progress < 90) return 'in-progress';
    if (progress < 100) return 'nearly-complete';
    return 'complete';
  }

  /**
   * 진행률 정보를 종합한 상세 정보 계산
   * 
   * @param stageInfo 스테이지별 상세 정보
   * @returns 종합 진행률 정보
   */
  static calculateDetailedProgress(stageInfo: StageProgressInfo[]): OverallProgressInfo {
    if (stageInfo.length === 0) {
      return {
        currentStage: 0,
        totalStages: 0,
        stageProgresses: [],
        overallPercentage: 0
      };
    }

    const stageProgresses = stageInfo.map(info => 
      this.calculateStageProgress(info.currentPage, info.totalPages, info.successCount)
    );

    // 현재 활성 스테이지 찾기 (진행률이 100% 미만인 첫 번째 스테이지)
    const currentStageIndex = stageProgresses.findIndex(progress => progress < 100);
    const currentStage = currentStageIndex >= 0 ? currentStageIndex + 1 : stageInfo.length;

    const overallPercentage = this.calculateWeightedProgress(stageProgresses);

    return {
      currentStage,
      totalStages: stageInfo.length,
      stageProgresses,
      overallPercentage
    };
  }
}
