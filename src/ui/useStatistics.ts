import { useEffect, useState } from "react";
import { getPlatformApi } from "./platform/api";

export function useStatistics(dataPointcount: number): Statistics[] {
    const [value, setValue] = useState<Statistics[]>([]);

    useEffect(() => {
        // 플랫폼 독립적 API 사용
        const platformApi = getPlatformApi();
        const unsub = platformApi.subscribeToEvent('statistics', (stats) => {
            setValue(prev => {
                const newData = [...prev, stats];
                if (newData.length > dataPointcount) {
                    newData.shift();    
                }
                return newData;
            });
        });
        return unsub;
    }, [dataPointcount]);
    
    return value;
}