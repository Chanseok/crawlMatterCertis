import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { isDev } from './util.js';
import { createElectronLogger } from './utils/logger.js';

const logger = createElectronLogger('PathResolver');

export function getPreloadPath() {
    const appPath = app.getAppPath();
    logger.debug('App path', { data: { appPath } });
    
    if (isDev()) {
        // 개발 모드에서는 기존 경로 사용
        const devPath = path.join(appPath, './dist-electron/electron/preload.cjs');
        logger.debug('Development preload path', { data: { devPath } });
        
        // 존재 여부 확인 (디버깅용)
        if (fs.existsSync(devPath)) {
            logger.debug('Preload script exists at development path');
        } else {
            logger.warn('Preload script NOT found at development path');
        }
        
        return devPath;
    } else {
        // 프로덕션 모드에서는 여러 가능한 경로 시도
        const possiblePaths = [
            // 일반적인 Electron 앱 번들 구조 (macOS)
            path.join(appPath, 'dist-electron', 'electron', 'preload.cjs'),
            path.join(appPath, '../dist-electron/electron/preload.cjs'),
            // macOS .app 번들 내부 구조 
            path.join(appPath, '..', '..', 'dist-electron', 'electron', 'preload.cjs'),
            // 상대 경로로 시도
            path.resolve(appPath, './dist-electron/electron/preload.cjs')
        ];
        
        // 가능한 경로들을 순차적으로 확인
        for (const candidatePath of possiblePaths) {
            logger.debug('Checking preload path', { data: { candidatePath } });
            if (fs.existsSync(candidatePath)) {
                logger.info('Preload script found', { data: { candidatePath } });
                return candidatePath;
            }
        }
        
        // 혹은 파일을 직접 검색하여 경로 찾기
        logger.warn('Could not find preload script in expected locations, falling back to first possible path');
        return possiblePaths[0]; // 일단 첫 번째 경로 반환
    }
}

export function getUIPath() {
    if (isDev()) {
        // Test: back to Vite server with working JavaScript settings
        return 'http://localhost:5123'; // 개발 모드에서는 URL 반환
    } else {
        return path.join(app.getAppPath(), 'dist-react', 'index.html');
    }
}