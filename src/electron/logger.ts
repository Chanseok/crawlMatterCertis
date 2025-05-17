import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// 로그 파일 위치 지정 (userData/logs)
log.transports.file.resolvePath = () => {
  const userData = app.getPath('userData');
  return path.join(userData, 'logs/main.log');
};

// 로그 파일 최대 크기 및 포맷 지정
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// 개발 환경에서는 콘솔 로그 레벨을 debug로
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
log.transports.file.level = 'info';

// 기존 debugLog 대체 함수
export function debugLog(message: string, data?: any, fileName?: string): void {
  const fileLabel = fileName || extractCallerFilename();
  const formattedMessage = `[${fileLabel}] ${message}`;
  if (data !== undefined) {
    log.debug(formattedMessage, data);
  } else {
    log.debug(formattedMessage);
  }
}

function extractCallerFilename(): string {
  try {
    const stack = new Error().stack;
    if (stack) {
      const match = stack.split('\n')[3]?.match(/\((.*?):\d+:\d+\)/);
      if (match && match[1]) {
        return path.basename(match[1]);
      }
    }
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

export default log;
