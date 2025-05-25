/**
 * DatabaseService.ts
 * 데이터베이스 관련 비즈니스 로직을 담당하는 서비스
 * 
 * 데이터베이스 CRUD 작업, 검색, 요약 정보 등을 추상화
 */

import { BaseService, ServiceResult } from '../base/BaseService';
import type { MatterProduct } from '../../../shared/types';
import type { DatabaseSummary } from '../../../../types';

export interface DatabaseOperationParams {
  page?: number;
  limit?: number;
  query?: string;
}

export interface ProductsResponse {
  products: MatterProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchParams extends DatabaseOperationParams {
  query: string;
}

export interface SaveProductsParams {
  products: MatterProduct[];
  autoSave?: boolean;
}

export interface SaveResult {
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  message?: string;
}

/**
 * 데이터베이스 서비스 클래스
 * 모든 데이터베이스 관련 작업을 추상화하여 제공
 */
export class DatabaseService extends BaseService {
  private static instance: DatabaseService | null = null;

  constructor() {
    super('DatabaseService');
  }

  /**
   * Get singleton instance of DatabaseService
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * 제품 목록 조회
   */
  async getProducts(params: DatabaseOperationParams = {}): Promise<ServiceResult<ProductsResponse>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const { page = 1, limit = 20 } = params;
      const result = await this.ipcService.getProducts({ page, limit });
      
      if (!result || typeof result.total !== 'number') {
        throw new Error('Invalid response format from database');
      }

      const totalPages = Math.ceil(result.total / limit);

      return {
        ...result,
        page,
        limit,
        totalPages
      };
    }, 'getProducts');
  }

  /**
   * 제품 상세 정보 조회
   */
  async getProductById(id: string): Promise<ServiceResult<MatterProduct | null>> {
    if (!id?.trim()) {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Product ID is required')
      );
    }

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      return await this.ipcService.getProductById(id);
    }, 'getProductById');
  }

  /**
   * 제품 검색
   */
  async searchProducts(params: SearchParams): Promise<ServiceResult<ProductsResponse>> {
    const { query, page = 1, limit = 20 } = params;

    if (!query?.trim()) {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Search query is required')
      );
    }

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.searchProducts({ query, page, limit });
      
      if (!result || typeof result.total !== 'number') {
        throw new Error('Invalid response format from search');
      }

      const totalPages = Math.ceil(result.total / limit);

      return {
        ...result,
        page,
        limit,
        totalPages
      };
    }, 'searchProducts');
  }

  /**
   * 데이터베이스 요약 정보 조회
   */
  async getDatabaseSummary(): Promise<ServiceResult<DatabaseSummary>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      return await this.ipcService.getDatabaseSummary();
    }, 'getDatabaseSummary');
  }

  /**
   * 제품을 데이터베이스에 저장
   */
  async saveProducts(params: SaveProductsParams): Promise<ServiceResult<SaveResult>> {
    const { products, autoSave: _autoSave = false } = params;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Products array is required and must not be empty')
      );
    }

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      // 제품 데이터 유효성 검사
      this.validateProductsData(products);

      const result = await this.ipcService.saveProductsToDb(products);
      
      if (!result || typeof result.added !== 'number') {
        throw new Error('Invalid response format from save operation');
      }

      return result;
    }, 'saveProducts');
  }

  /**
   * 데이터베이스 최종 업데이트 시간 마킹
   */
  async markLastUpdated(count: number): Promise<ServiceResult<void>> {
    if (typeof count !== 'number' || count < 0) {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Count must be a non-negative number')
      );
    }

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      await this.ipcService.markLastUpdated(count);
    }, 'markLastUpdated');
  }

  /**
   * 데이터베이스 정리
   */
  async clearDatabase(): Promise<ServiceResult<{ success: boolean; message?: string }>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      return await this.ipcService.clearDatabase();
    }, 'clearDatabase');
  }

  /**
   * 페이지 범위별 레코드 삭제
   */
  async deleteRecordsByPageRange(startPage: number, endPage: number): Promise<ServiceResult<{ deletedCount: number }>> {
    if (typeof startPage !== 'number' || typeof endPage !== 'number' || startPage > endPage) {
      return this.createFailure(
        this.createError('INVALID_PARAMS', 'Invalid page range parameters')
      );
    }

    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      return await this.ipcService.deleteRecordsByPageRange({ startPageId: startPage, endPageId: endPage });
    }, 'deleteRecordsByPageRange');
  }

  /**
   * 제품 데이터 유효성 검사
   */
  private validateProductsData(products: MatterProduct[]): void {
    for (const product of products) {
      if (!product.url || !product.manufacturer || !product.model) {
        throw new Error('Invalid product data: missing required fields');
      }
    }
  }

  /**
   * 데이터베이스 연결 상태 확인
   */
  async checkDatabaseConnection(): Promise<ServiceResult<boolean>> {
    return this.executeOperation(async () => {
      try {
        await this.getDatabaseSummary();
        return true;
      } catch {
        return false;
      }
    }, 'checkDatabaseConnection');
  }

  /**
   * 데이터베이스 연결 확인 (alias for checkDatabaseConnection)
   */
  async checkConnection(): Promise<ServiceResult<boolean>> {
    return this.checkDatabaseConnection();
  }

  /**
   * 데이터베이스 요약 정보 조회 (alias for getDatabaseSummary)
   */
  async getSummary(): Promise<ServiceResult<DatabaseSummary>> {
    return this.getDatabaseSummary();
  }

  /**
   * 모든 제품 정보 조회 (alias for getProducts with no pagination)
   */
  async getAllProducts(): Promise<ServiceResult<ProductsResponse>> {
    return this.getProducts({ page: 1, limit: 10000 }); // Large limit for "all" products
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
