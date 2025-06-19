/**
 * TimeEstimationService.ts
 * Service Layer - 시간 예측 비즈니스 서비스
 * 
 * Clean Architecture: Interface Adapters 계층
 * Use Cases를 조합하여 애플리케이션 서비스 제공
 */

import {
  EstimateInitialTimeUseCase,
  UpdateTimeEstimationUseCase,
  StartCountdownUseCase,
  EstimateInitialTimeRequest,
  UpdateEstimationRequest,
  TimeEstimationResult
} from '../application/time-estimation/TimeEstimationUseCases.js';
import { timeEstimationRepository } from '../infrastructure/repositories/TimeEstimationRepository.js';
import { RemainingTime, ElapsedTime } from '../domain/time-estimation/TimeEstimationDomain.js';
import { Logger } from '../../../shared/utils/Logger.js';

export class TimeEstimationService {
  private readonly logger = new Logger('TimeEstimationService');
  private readonly estimateInitialTimeUseCase: EstimateInitialTimeUseCase;
  private readonly updateTimeEstimationUseCase: UpdateTimeEstimationUseCase;
  private readonly startCountdownUseCase: StartCountdownUseCase;

  constructor() {
    this.estimateInitialTimeUseCase = new EstimateInitialTimeUseCase(timeEstimationRepository);
    this.updateTimeEstimationUseCase = new UpdateTimeEstimationUseCase(timeEstimationRepository);
    this.startCountdownUseCase = new StartCountdownUseCase();
  }

  /**
   * 크롤링 시작 시 초기 보수적 시간 예측
   */
  public async estimateInitialTime(totalPages: number, estimatedProducts: number): Promise<RemainingTime> {
    try {
      this.logger.info('초기 시간 예측 시작', { totalPages, estimatedProducts });
      
      const request: EstimateInitialTimeRequest = {
        totalPages,
        estimatedProducts
      };

      const result = await this.estimateInitialTimeUseCase.execute(request);
      
      this.logger.info('초기 시간 예측 완료', { 
        estimatedSeconds: result.seconds,
        formattedTime: result.toString()
      });

      return result;
    } catch (error) {
      this.logger.error('초기 시간 예측 실패', { error });
      // 기본값 반환 (보수적)
      return new RemainingTime(3600); // 1시간
    }
  }

  /**
   * 진행률 업데이트 시 시간 예측 갱신
   */
  public async updateEstimation(
    stageId: string,
    progressPercentage: number,
    elapsedTimeMs: number,
    retryCount: number = 0,
    totalItems: number,
    completedItems: number
  ): Promise<TimeEstimationResult> {
    try {
      this.logger.info('🔍 [TimeEstimationService] updateEstimation 호출됨', {
        stageId,
        progressPercentage,
        elapsedTimeMs,
        retryCount,
        totalItems,
        completedItems
      });

      const request: UpdateEstimationRequest = {
        stageId,
        progressPercentage,
        elapsedTimeMs,
        retryCount,
        totalItems,
        completedItems
      };

      const result = await this.updateTimeEstimationUseCase.execute(request);
      
      this.logger.info('✅ [TimeEstimationService] 시간 예측 업데이트 성공', {
        stageId,
        progressPercentage,
        remainingSeconds: result.remainingTime.seconds,
        confidence: result.confidence
      });

      return result;
    } catch (error) {
      this.logger.error('❌ [TimeEstimationService] 시간 예측 업데이트 실패', { 
        error: error instanceof Error ? error.message : String(error), 
        stack: error instanceof Error ? error.stack : undefined,
        stageId,
        progressPercentage,
        elapsedTimeMs
      });
      
      // 기본값으로 fallback - 진행률 기반 동적 계산
      const fallbackRemainingMs = progressPercentage > 0 
        ? Math.max(300000, (elapsedTimeMs / progressPercentage) * (100 - progressPercentage)) // 최소 5분, 실제 진행률 기반 계산
        : 900000; // 15분 기본값 (30분에서 단축)
      
      const fallbackResult = {
        elapsedTime: new ElapsedTime(elapsedTimeMs),
        remainingTime: new RemainingTime(Math.floor(fallbackRemainingMs / 1000)), // 초 단위로 변환
        confidence: 'low' as const,
        lastUpdated: new Date()
      };

      this.logger.warn('🔄 [TimeEstimationService] Fallback 사용', { 
        계산된_남은시간_초: fallbackResult.remainingTime.seconds,
        진행률: progressPercentage,
        경과시간_ms: elapsedTimeMs
      });
      
      return fallbackResult;
    }
  }

  /**
   * 카운트다운 시작
   */
  public startCountdown(currentRemainingTime: RemainingTime): RemainingTime {
    return this.startCountdownUseCase.execute(currentRemainingTime);
  }

  /**
   * 크롤링 세션 초기화
   */
  public resetSession(): void {
    this.logger.info('시간 예측 세션 초기화');
    timeEstimationRepository.reset();
  }

  /**
   * 현재 예측 신뢰도 기반 UI 힌트 제공
   */
  public getConfidenceMessage(confidence: 'low' | 'medium' | 'high'): string {
    switch (confidence) {
      case 'low':
        return '예상 시간이 조정될 수 있습니다';
      case 'medium':
        return '예상 시간이 점점 정확해지고 있습니다';
      case 'high':
        return '예상 시간의 정확도가 높습니다';
      default:
        return '';
    }
  }
}

// Singleton for application-wide access
export const timeEstimationService = new TimeEstimationService();
