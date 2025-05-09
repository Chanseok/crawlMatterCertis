import osUtils from 'os-utils';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { ipcWebContentsSend } from './util.js';

const POLLING_INTERVAL = 500; // .5 second

// 애플리케이션 리소스 경로 관리를 위한 객체 추가
export const electronResourcePaths = {
    // 앱 기본 경로
    appPath: app ? app.getAppPath() : process.cwd(),
    
    // 데이터 저장 경로
    get dataPath() {
        if (app) {
            return path.join(app.getPath('userData'), 'data');
        }
        return path.join(process.cwd(), 'data');
    },
    
    // 임시 파일 경로
    get tempPath() {
        if (app) {
            return app.getPath('temp');
        }
        return os.tmpdir();
    },
    
    // 로그 파일 경로
    get logsPath() {
        if (app) {
            return path.join(app.getPath('logs'));
        }
        return path.join(process.cwd(), 'logs');
    }
};

export function pollResources(mainWindow: BrowserWindow) {
    setInterval(async () => {
        const cpuUsage = await getCpuUsage();
        const ramUsage = getRamUsage();
        const storageData = getStorageData();

        ipcWebContentsSend('statistics', mainWindow.webContents, {
            timestamp: Date.now(),
            cpuUsage,
            memoryUsage: ramUsage, // 새 타입에 맞춰 memoryUsage로 함께 전달
            ramUsage,  // 이전 호환성 유지
            storageUsage: storageData.usage
        });
    }, POLLING_INTERVAL);
}

export function getStaticData() {
    const totalStorage = getStorageData().total;
    const cpuModel = os.cpus()[0].model;
    const totalMemoryGB = Math.floor(os.totalmem() / 1024);

    return {
        totalStorage,
        cpuModel,
        totalMemoryGB,
    }
}

function getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
        osUtils.cpuUsage(resolve)
    })
}

function getRamUsage() {
    return 1 - osUtils.freememPercentage();
}

function getStorageData() {
    // requires node >= 18
    const stats = fs.statfsSync(process.platform === 'win32' ? 'C://' : '/');
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;

    return {
        total: Math.floor(total / 1_000_000_000),
        usage: 1 - free / total,
    }
}