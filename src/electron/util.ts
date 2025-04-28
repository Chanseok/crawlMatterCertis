import { ipcMain, WebContents, WebFrameMain } from "electron";
import { pathToFileURL } from "url";
import { getUIPath } from "./pathResolver.js";
import type { EventPayloadMapping } from "../../types.js";
import path from "path";

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 디버깅용 로그 출력 유틸리티 함수
 * 초록색으로 'DBG [파일명]' 접두어와 함께 콘솔에 출력
 * @param message 출력할 메시지
 * @param data 추가 데이터 (선택사항)
 * @param fileName 로그를 출력하는 파일 이름 (기본값: 호출된 스택에서 자동 추출)
 */
export function debugLog(message: string, data?: any, fileName?: string): void {
    // 파일 이름이 제공되지 않은 경우 Error 스택을 이용해 호출된 파일명 추출
    if (!fileName) {
        try {
            const stack = new Error().stack;
            if (stack) {
                const stackLines = stack.split('\n');
                // 첫 번째 줄은 Error 객체 생성, 두 번째 줄은 debugLog 함수 호출
                // 세 번째 줄이 실제 호출한 파일 정보를 담고 있음
                if (stackLines.length >= 3) {
                    const callerLine = stackLines[2].trim();
                    // 파일 경로 추출 시도
                    const match = callerLine.match(/at.*\((.+?):[\d]+:[\d]+\)/) ||
                                callerLine.match(/at (.+?):.*/);
                    
                    if (match && match[1]) {
                        fileName = path.basename(match[1]);
                    } else {
                        fileName = 'unknown';
                    }
                }
            }
        } catch (e) {
            fileName = 'unknown';
        }
    }
    
    const greenColor = '\x1b[32m'; // 초록색 ANSI 코드
    const resetColor = '\x1b[0m';  // 색상 리셋 ANSI 코드
    
    const prefix = `${greenColor}DBG [${fileName}]${resetColor}`;
    
    if (data !== undefined) {
        console.log(`${prefix} ${message}`, data);
    } else {
        console.log(`${prefix} ${message}`);
    }
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key]
) {
  // key를 string으로 변환하여 호환성 문제 해결
  webContents.send(String(key), payload);
}

export function ipcMainHandle<Key extends keyof EventPayloadMapping>(
  key: Key, handler: () => EventPayloadMapping[Key]) {
  // key를 string으로 변환하여 호환성 문제 해결
  ipcMain.handle(String(key), (event) => {
    if (event.senderFrame) {
      validateEventFrame(event.senderFrame);
      return handler();
    }
    
  });
}

export function validateEventFrame(frame: WebFrameMain){
  if(isDev() && new URL(frame.url).host === 'localhost:5123'){
    return;
  }
  if(frame.url !== pathToFileURL(getUIPath()).toString()){
    throw new Error('Malicious frame');
  }
}
