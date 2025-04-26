type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageUsage: number;
};

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
};

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
};

type UnsubscribeFunction = () => void;

// 플랫폼 독립적인 API 인터페이스
interface IPlatformAPI {
    // 구독 기반 API
    subscribeToEvent<K extends keyof EventPayloadMapping>(
        eventName: K, 
        callback: (data: EventPayloadMapping[K]) => void
    ): UnsubscribeFunction;
    
    // 요청-응답 기반 API
    invokeMethod<K extends keyof EventPayloadMapping>(
        methodName: K
    ): Promise<EventPayloadMapping[K]>;
}

// 구현체는 실제 구현에서 각 플랫폼별 API로 연결됩니다
interface IElectronAPI extends IPlatformAPI {
    subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
}

// 미래의 Tauri 구현을 위한 인터페이스 (주석 처리)
// interface ITauriAPI extends IPlatformAPI {
//     // Tauri 특화 메서드가 필요한 경우 여기에 추가
// }

interface Window {
    electron: IElectronAPI;
    // 미래에 Tauri로 전환 시 다음과 같이 확장 가능
    // tauri?: ITauriAPI;
    // platformAPI: IPlatformAPI; // 플랫폼 독립적 접근을 위한 참조
}