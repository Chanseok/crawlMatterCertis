import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { isDev } from './util.js';

export function getPreloadPath() {
    // 개발 환경에서는 실제 preload.cjs 파일의 위치가 중요합니다
    // 이 함수는 preload.cjs 파일을 찾아내고, 필요하면 생성까지 합니다
    
    // 최종 사용할 preload 경로 (개발 모드에서 사용할 경로)
    const devPreloadPath = path.join(app.getAppPath(), 'dist-electron', 'preload.cjs');
    
    // 프로덕션 모드에서는 __dirname 기준으로 찾는 것이 더 안정적입니다
    if (!isDev()) {
        const prodPreloadPath = path.join(__dirname, 'preload.cjs');
        console.log(`Production mode: Using preload path: ${prodPreloadPath}`);
        return prodPreloadPath;
    }
    
    // 가능한 소스 경로들 (컴파일된 preload 스크립트가 있을 수 있는 위치들)
    const possibleSourcePaths = [
        path.join(app.getAppPath(), 'dist-electron', 'electron', 'preload.cjs'),
        path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
        path.resolve(__dirname, 'preload.cjs'),
        path.resolve(__dirname, '..', 'preload.cjs')
    ];
    
    // 존재하는 소스 파일 찾기
    let sourcePath = null;
    for (const p of possibleSourcePaths) {
        console.log(`Checking source preload path: ${p}, exists: ${fs.existsSync(p)}`);
        if (fs.existsSync(p)) {
            sourcePath = p;
            console.log(`Found source preload path: ${p}`);
            break;
        }
    }
    
    // 소스 파일이 대상 경로와 다르고 소스 파일이 존재하면 복사
    if (sourcePath && sourcePath !== devPreloadPath) {
        try {
            // 대상 디렉토리 확인 및 생성
            const preloadDir = path.dirname(devPreloadPath);
            if (!fs.existsSync(preloadDir)) {
                fs.mkdirSync(preloadDir, { recursive: true });
                console.log(`Created directory: ${preloadDir}`);
            }
            
            // 파일 복사
            fs.copyFileSync(sourcePath, devPreloadPath);
            console.log(`Copied preload script from ${sourcePath} to ${devPreloadPath}`);
        } catch (err) {
            console.error('Failed to copy preload script:', err);
        }
    }
    
    // 최종 경로에 파일이 없으면 생성
    if (!fs.existsSync(devPreloadPath)) {
        try {
            const preloadDir = path.dirname(devPreloadPath);
            if (!fs.existsSync(preloadDir)) {
                fs.mkdirSync(preloadDir, { recursive: true });
                console.log(`Created directory: ${preloadDir}`);
            }
            
            // 최소한의 preload 스크립트 생성
            const minimalPreload = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    subscribeToEvent: (event, callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on(event, listener);
        return () => ipcRenderer.removeListener(event, listener);
    },
    invokeMethod: (method, params) => ipcRenderer.invoke(method, params)
});
`;
            
            fs.writeFileSync(devPreloadPath, minimalPreload);
            console.log(`Created minimal preload script at: ${devPreloadPath}`);
        } catch (err) {
            console.error('Failed to create preload script:', err);
        }
    }
    
    console.log(`Development mode: Using preload path: ${devPreloadPath}`);
    return devPreloadPath;
}

export function getUIPath(){
    if (isDev()) {
        return 'http://localhost:5123'; // 개발 모드에서는 URL 반환
    } else {
        return path.join(app.getAppPath(), 'dist-react', 'index.html');
    }
}