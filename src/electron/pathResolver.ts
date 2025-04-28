import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { isDev } from './util.js';

export function getPreloadPath() {
    return path.join(
        app.getAppPath(),
        isDev() ? '.' : '..',
        '/dist-electron/preload.cjs'
    )
}

export function getUIPath() {
    if (isDev()) {
        return 'http://localhost:5123'; // 개발 모드에서는 URL 반환
    } else {
        return path.join(app.getAppPath(), 'dist-react', 'index.html');
    }
}