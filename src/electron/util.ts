import { ipcMain, WebContents, WebFrameMain } from "electron";
import { pathToFileURL } from "url";
import { getUIPath } from "./pathResolver.js";

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key]
) {
  webContents.send(key, payload);
}

export function ipcMainHandle<Key extends keyof EventPayloadMapping>(
  key: Key, handler: () => EventPayloadMapping[Key]) {
  ipcMain.handle(key, (event) => {
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
