/**
 * 개발 환경에서만 로그를 출력하는 유틸리티 함수
 * 프로덕션 환경에서는 로그를 출력하지 않음
 */
// Vite에서는 import.meta.env를 사용합니다
export const debugLog = import.meta.env.DEV 
  ? console.log 
  : () => {};
