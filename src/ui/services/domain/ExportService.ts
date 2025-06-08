/**
 * ExportService.ts
 * Domain Service for Export Operations
 * 
 * Phase 3: Service Layer Refactoring
 * - Enhanced with resilience management for export operations
 * - Improved error handling and recovery patterns
 * - Standardized service lifecycle management
 * 
 * 책임:
 * - 데이터 내보내기 작업 관리
 * - Excel/CSV 파일 생성 및 저장
 * - 내보내기 설정 관리
 */

import { BaseService } from '../base/BaseService';
import type { ServiceResult } from '../base/BaseService';

/**
 * 내보내기 옵션 인터페이스
 */
export interface ExportOptions {
  format?: 'xlsx' | 'csv';
  path?: string;
  filename?: string;
  includeHeaders?: boolean;
  dateRange?: {
    start?: string;
    end?: string;
  };
  filters?: {
    vendor?: string;
    category?: string;
    certification?: string;
  };
}

/**
 * 내보내기 결과 인터페이스
 */
export interface ExportResult {
  success: boolean;
  path?: string;
  filename?: string;
  recordCount?: number;
  error?: string;
}

/**
 * 내보내기 진행 상태 인터페이스
 */
export interface ExportProgress {
  stage: 'preparing' | 'exporting' | 'saving' | 'completed' | 'error';
  current: number;
  total: number;
  percentage: number;
  message?: string;
}

/**
 * 내보내기 서비스 클래스
 * 모든 데이터 내보내기 관련 작업을 추상화하여 제공
 * 
 * Phase 3 Enhanced Features:
 * - Resilience patterns for export operations
 * - Enhanced error handling and recovery
 * - Improved service lifecycle management
 */
export class ExportService extends BaseService {
  private static _instance: ExportService | null = null;

  constructor() {
    super('ExportService');
    // Initialize resilience patterns for minimal operations (file I/O)
    this.initializeResilience({ 
      serviceType: 'minimal',
      enableCircuitBreaker: false,
      enableRetry: true 
    });
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): ExportService {
    if (!ExportService._instance) {
      ExportService._instance = new ExportService();
    }
    return ExportService._instance;
  }

  /**
   * Excel 파일로 내보내기
   */
  async exportToExcel(options: ExportOptions = {}): Promise<ServiceResult<ExportResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const exportParams = {
        path: options.path,
        filename: options.filename,
        format: 'xlsx',
        includeHeaders: options.includeHeaders ?? true,
        ...options
      };

      const result = await this.ipcService.call<ExportResult>('exportToExcel', exportParams);
      
      if (!result) {
        throw new Error('No response from export operation');
      }

      return {
        success: result.success || false,
        path: result.path,
        filename: result.filename,
        recordCount: result.recordCount,
        error: result.error
      };
    }, 'exportToExcel');
  }

  /**
   * CSV 파일로 내보내기
   */
  async exportToCSV(options: ExportOptions = {}): Promise<ServiceResult<ExportResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const exportParams = {
        ...options,
        format: 'csv' as const,
        includeHeaders: options.includeHeaders ?? true
      };

      // CSV 내보내기는 Excel 내보내기와 동일한 IPC 메서드 사용
      const result = await this.ipcService.call<ExportResult>('exportToExcel', exportParams);
      
      if (!result) {
        throw new Error('No response from export operation');
      }

      return {
        success: result.success || false,
        path: result.path,
        filename: result.filename,
        recordCount: result.recordCount,
        error: result.error
      };
    }, 'exportToCSV');
  }

  /**
   * 내보내기 기본 경로 조회
   */
  async getDefaultExportPath(): Promise<ServiceResult<string>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // 기본 다운로드 경로 반환 (실제 구현은 electron에서 처리)
      return 'Downloads';
    }, 'getDefaultExportPath');
  }

  /**
   * 내보내기 파일명 생성
   */
  generateExportFilename(prefix: string = 'matter_products', format: 'xlsx' | 'csv' = 'xlsx'): string {
    const now = new Date();
    const dateStr = now.toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS

    return `${prefix}_${dateStr}.${format}`;
  }

  /**
   * 내보내기 미리보기 (레코드 수 등)
   */
  async getExportPreview(_options: ExportOptions = {}): Promise<ServiceResult<{ recordCount: number; estimatedSize: string }>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // 데이터베이스 요약 정보를 통해 예상 레코드 수 조회
      const summaryResult = await this.ipcService.call<any>('getDatabaseSummary');
      
      if (!summaryResult) {
        throw new Error('Failed to get database summary');
      }

      const recordCount = summaryResult.total || 0;
      
      // 대략적인 파일 크기 추정 (레코드당 평균 200 바이트 가정)
      const estimatedBytes = recordCount * 200;
      let estimatedSize: string;
      
      if (estimatedBytes < 1024) {
        estimatedSize = `${estimatedBytes} B`;
      } else if (estimatedBytes < 1024 * 1024) {
        estimatedSize = `${(estimatedBytes / 1024).toFixed(1)} KB`;
      } else {
        estimatedSize = `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      return {
        recordCount,
        estimatedSize
      };
    }, 'getExportPreview');
  }

  /**
   * 내보내기 옵션 유효성 검사
   */
  validateExportOptions(options: ExportOptions): ServiceResult<boolean> {
    try {
      // 파일 형식 검사
      if (options.format && !['xlsx', 'csv'].includes(options.format)) {
        return this.createFailure(
          this.createError('INVALID_PARAMS', 'Invalid export format. Supported formats: xlsx, csv')
        );
      }

      // 경로 검사 (기본적인 검사만)
      if (options.path && typeof options.path !== 'string') {
        return this.createFailure(
          this.createError('INVALID_PARAMS', 'Export path must be a string')
        );
      }

      // 파일명 검사
      if (options.filename && typeof options.filename !== 'string') {
        return this.createFailure(
          this.createError('INVALID_PARAMS', 'Filename must be a string')
        );
      }

      // 날짜 범위 검사
      if (options.dateRange) {
        const { start, end } = options.dateRange;
        if (start && end && new Date(start) > new Date(end)) {
          return this.createFailure(
            this.createError('INVALID_PARAMS', 'Start date must be before end date')
          );
        }
      }

      return this.createSuccess(true);
    } catch (error) {
      return this.createFailure(
        this.createError('VALIDATION_ERROR', error instanceof Error ? error.message : 'Validation failed')
      );
    }
  }

  /**
   * 내보내기 이력 관리 (향후 구현)
   */
  async getExportHistory(): Promise<ServiceResult<ExportResult[]>> {
    return this.executeOperation(async () => {
      // 향후 내보내기 이력을 저장하고 조회하는 기능 구현
      // 현재는 빈 배열 반환
      return [];
    }, 'getExportHistory');
  }

  /**
   * 파일로 내보내기 (범용 메서드)
   */
  async exportToFile(
    _data: any[], 
    filePath: string, 
    options: ExportOptions = {}
  ): Promise<ServiceResult<ExportResult>> {
    return this.executeOperation(async () => {
      const format = options.format || 'xlsx';
      
      // 파일 확장자가 형식과 일치하는지 확인
      const expectedExtension = format === 'xlsx' ? '.xlsx' : '.csv';
      if (!filePath.endsWith(expectedExtension)) {
        filePath += expectedExtension;
      }

      // Excel 형식으로 내보내기
      if (format === 'xlsx') {
        const exportOptions: ExportOptions = {
          ...options,
          path: filePath,
          format: 'xlsx'
        };
        
        const result = await this.exportToExcel(exportOptions);
        return result.data || { success: false, error: 'Export failed' };
      }

      // CSV 형식으로 내보내기 (향후 구현)
      if (format === 'csv') {
        const exportOptions: ExportOptions = {
          ...options,
          path: filePath,
          format: 'csv'
        };
        
        const result = await this.exportToCSV(exportOptions);
        return result.data || { success: false, error: 'Export failed' };
      }

      throw new Error(`Unsupported export format: ${format}`);
    }, 'exportToFile');
  }
}

// 싱글톤 인스턴스 익스포트
export const exportService = ExportService.getInstance();

// 기본 익스포트
export default exportService;
