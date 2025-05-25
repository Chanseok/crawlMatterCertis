/**
 * VendorService.ts
 * Domain Service for Vendor Operations
 * 
 * 책임:
 * - 벤더 정보 조회 및 관리
 * - 벤더 목록 갱신 및 동기화
 * - 벤더 관련 비즈니스 로직 캡슐화
 */

import { BaseService } from '../base/BaseService';
import type { ServiceResult } from '../base/BaseService';

/**
 * 벤더 정보 인터페이스
 */
export interface Vendor {
  id: string;
  name: string;
  description?: string;
  lastUpdated?: string;
  [key: string]: any;
}

/**
 * 벤더 갱신 결과 인터페이스
 */
export interface VendorUpdateResult {
  success: boolean;
  added: number;
  updated: number;
  total: number;
  error?: string;
}

/**
 * 벤더 서비스 클래스
 * 모든 벤더 관련 작업을 추상화하여 제공
 */
export class VendorService extends BaseService {
  private static _instance: VendorService | null = null;

  constructor() {
    super('VendorService');
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): VendorService {
    if (!VendorService._instance) {
      VendorService._instance = new VendorService();
    }
    return VendorService._instance;
  }

  /**
   * 벤더 목록 조회
   */
  async getVendors(): Promise<ServiceResult<Vendor[]>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.getVendors();
      
      if (!result || !Array.isArray(result.vendors)) {
        throw new Error('Invalid vendor data format');
      }

      return result.vendors;
    }, 'getVendors');
  }

  /**
   * 벤더 정보 갱신
   */
  async fetchAndUpdateVendors(): Promise<ServiceResult<VendorUpdateResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.fetchAndUpdateVendors();
      
      if (!result || typeof result.added !== 'number') {
        throw new Error('Invalid vendor update response format');
      }

      return {
        success: result.success || false,
        added: result.added,
        updated: result.updated || 0,
        total: result.total || 0,
        error: result.error
      };
    }, 'fetchAndUpdateVendors');
  }

  /**
   * 벤더 정보 동기화 (갱신 후 목록 조회)
   */
  async syncVendors(): Promise<ServiceResult<{ vendors: Vendor[]; updateResult: VendorUpdateResult }>> {
    return this.executeOperation(async () => {
      // 먼저 벤더 정보 갱신
      const updateResult = await this.fetchAndUpdateVendors();
      
      if (!updateResult.success) {
        throw new Error(`Vendor update failed: ${updateResult.error?.message}`);
      }

      // 갱신된 벤더 목록 조회
      const vendorsResult = await this.getVendors();
      
      if (!vendorsResult.success) {
        throw new Error(`Vendor list fetch failed: ${vendorsResult.error?.message}`);
      }

      return {
        vendors: vendorsResult.data || [],
        updateResult: updateResult.data || {
          success: false,
          added: 0,
          updated: 0,
          total: 0
        }
      };
    }, 'syncVendors');
  }

  /**
   * 벤더 검색 (로컬 필터링)
   */
  async searchVendors(query: string): Promise<ServiceResult<Vendor[]>> {
    return this.executeOperation(async () => {
      const vendorsResult = await this.getVendors();
      
      if (!vendorsResult.success || !vendorsResult.data) {
        throw new Error('Failed to get vendors for search');
      }

      const vendors = vendorsResult.data;
      
      if (!query || query.trim() === '') {
        return vendors;
      }

      const searchTerm = query.toLowerCase().trim();
      const filteredVendors = vendors.filter(vendor => 
        vendor.name?.toLowerCase().includes(searchTerm) ||
        vendor.description?.toLowerCase().includes(searchTerm) ||
        vendor.id?.toLowerCase().includes(searchTerm)
      );

      return filteredVendors;
    }, 'searchVendors');
  }

  /**
   * 벤더 통계 조회
   */
  async getVendorStatistics(): Promise<ServiceResult<{ total: number; lastUpdated?: string }>> {
    return this.executeOperation(async () => {
      const vendorsResult = await this.getVendors();
      
      if (!vendorsResult.success || !vendorsResult.data) {
        throw new Error('Failed to get vendors for statistics');
      }

      const vendors = vendorsResult.data;
      const lastUpdatedVendor = vendors
        .filter(v => v.lastUpdated)
        .sort((a, b) => new Date(b.lastUpdated!).getTime() - new Date(a.lastUpdated!).getTime())[0];

      return {
        total: vendors.length,
        lastUpdated: lastUpdatedVendor?.lastUpdated
      };
    }, 'getVendorStatistics');
  }
}

// 싱글톤 인스턴스 익스포트
export const vendorService = VendorService.getInstance();

// 기본 익스포트
export default vendorService;
