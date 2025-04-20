export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function ipcWebContentsSend(event: string, webContents: Electron.WebContents, data: Statistics) {
    webContents.send(event, data);
}

