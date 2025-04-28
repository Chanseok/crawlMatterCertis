import { ipcMain, WebContents, WebFrameMain } from "electron";
import { pathToFileURL } from "url";
import { getUIPath } from "./pathResolver.js";
import type { EventPayloadMapping } from "../../types.js";

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
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
