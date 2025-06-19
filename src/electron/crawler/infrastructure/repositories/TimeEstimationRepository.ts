/**
 * TimeEstimationRepository.ts
 * Infrastructure Layer - 시간 예측 데이터 영속성
 * 
 * Clean Architecture: Infrastructure 계층
 * 외부 시스템과의 연동 (파일 시스템, 메모리 등)
 */

import { PerformanceMetrics } from '../../domain/time-estimation/TimeEstimationDomain.js';
import { ITimeEstimationRepository } from '../../application/time-estimation/TimeEstimationUseCases.js';

export class InMemoryTimeEstimationRepository implements ITimeEstimationRepository {
  private metricsStorage = new Map<string, PerformanceMetrics>();
  private estimationHistory: number[] = [];

  public async saveMetrics(stageId: string, metrics: PerformanceMetrics): Promise<void> {
    this.metricsStorage.set(stageId, metrics);
  }

  public async loadMetrics(stageId: string): Promise<PerformanceMetrics | null> {
    return this.metricsStorage.get(stageId) || null;
  }

  public async saveEstimationHistory(history: number[]): Promise<void> {
    this.estimationHistory = [...history];
  }

  public async loadEstimationHistory(): Promise<number[]> {
    return [...this.estimationHistory];
  }

  public reset(): void {
    this.metricsStorage.clear();
    this.estimationHistory = [];
  }
}

// Singleton pattern for application-wide access
export const timeEstimationRepository = new InMemoryTimeEstimationRepository();
