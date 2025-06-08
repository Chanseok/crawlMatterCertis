import { toJS } from 'mobx';

/**
 * IPC Communication Service
 * 
 * Provides safe IPC communication by automatically converting MobX observables
 * to plain objects before transmission to Electron backend.
 */
export class IPCService {
  private static instance: IPCService;
  
  public static getInstance(): IPCService {
    if (!IPCService.instance) {
      IPCService.instance = new IPCService();
    }
    return IPCService.instance;
  }
  
  /**
   * Safely call IPC methods with automatic MobX observable conversion
   */
  public async call<T>(channel: string, data?: any): Promise<T> {
    // MobX observable 자동 변환
    const plainData = data ? this.sanitizeForIPC(data) : undefined;
    
    console.log(`📡 IPCService: Calling ${channel}`, {
      originalData: data,
      plainData: plainData,
      dataType: data?.constructor?.name,
      hasWindow: typeof window !== 'undefined',
      hasElectron: typeof window !== 'undefined' && !!(window as any).electron
    });
    
    if (typeof window === 'undefined' || !(window as any).electron) {
      throw new Error(`IPCService: Electron IPC not available for channel: ${channel}`);
    }
    
    return (window as any).electron[channel](plainData);
  }
  
  /**
   * IPC 전송을 위한 데이터 정화
   * MobX observable, Proxy, 순환 참조 등을 안전한 형태로 변환
   */
  private sanitizeForIPC(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    // 원시 타입은 그대로 반환
    if (typeof data !== 'object') {
      return data;
    }
    
    try {
      // MobX observable 감지 및 변환
      const converted = toJS(data);
      
      // 추가 안전 검증: 순환 참조 제거
      return this.removeCircularReferences(converted);
      
    } catch (error) {
      console.warn('IPCService: Failed to convert MobX observable, using JSON fallback:', error);
      
      try {
        // 최후의 수단: JSON 직렬화/역직렬화
        return JSON.parse(JSON.stringify(data));
      } catch (jsonError) {
        console.error('IPCService: Failed to serialize data for IPC:', jsonError);
        throw new Error(`Failed to serialize data for IPC transmission: ${jsonError}`);
      }
    }
  }
  
  /**
   * 순환 참조 제거
   */
  private removeCircularReferences(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (seen.has(obj)) {
      return '[Circular Reference]';
    }
    
    seen.add(obj);
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeCircularReferences(item, seen));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.removeCircularReferences(value, seen);
    }
    
    return result;
  }
  
  /**
   * IPC 연결 상태 확인
   */
  public isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electron;
  }
  
  /**
   * 사용 가능한 IPC 채널 목록 (디버깅용)
   */
  public getAvailableChannels(): string[] {
    if (!this.isAvailable()) {
      return [];
    }
    
    const electron = (window as any).electron;
    return Object.keys(electron).filter(key => typeof electron[key] === 'function');
  }
}
