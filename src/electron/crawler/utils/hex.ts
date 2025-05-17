/**
 * hex.ts
 * 16진수 값을 표준화하는 유틸리티 함수
 */

/**
 * VID(Vendor ID)와 PID(Product ID)를 표준화된 16진수 형식으로 변환합니다.
 * - 0x 접두사 처리(대소문자 구분 없음)
 * - 자릿수를 4자리로 맞추기 위한 패딩
 * - 숫자값의 16진수 변환
 * - 표준 형식(0x+4자리 대문자 16진수)으로 정규화
 * 
 * @param value VID 또는 PID 원본 값
 * @returns 표준화된 16진수 ID (0xXXXX 형식)
 */
export function normalizeHexId(value: string | undefined): string | undefined {
  // 값이 없거나 의미 없는 값인 경우 그대로 반환
  if (!value || ['', 'n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim())) {
    return value;
  }

  const trimmedValue = value.trim();
  
  // 이미 정규화된 형식인지 확인 (0xXXXX 형식)
  const normalizedRegex = /^0x[0-9A-F]{4}$/;
  if (normalizedRegex.test(trimmedValue)) {
    return trimmedValue;
  }
  
  let hexValue: string;
  
  // 0x 접두사가 있는 16진수 (대소문자 구분 없음)
  if (/^0x[0-9A-Fa-f]+$/i.test(trimmedValue)) {
    // 0x 뒤의 16진수 부분만 추출
    hexValue = trimmedValue.substring(2).toUpperCase();
  } 
  // 16진수처럼 보이는 문자열 (숫자와 A-F로만 구성, 0x 접두사 없음)
  else if (/^[0-9A-Fa-f]+$/i.test(trimmedValue)) {
    hexValue = trimmedValue.toUpperCase();
  } 
  // 순수 10진수로 보이는 값
  else if (/^\d+$/.test(trimmedValue)) {
    try {
      // 10진수를 16진수로 변환 (앞에 0x 제외)
      hexValue = parseInt(trimmedValue, 10).toString(16).toUpperCase();
    } catch (e) {
      // 변환 실패 시 원본 값 반환
      return value;
    }
  } 
  // 그 외의 경우 변환 불가
  else {
    return value;
  }
  
  // 4자리로 패딩 (0 채우기)
  hexValue = hexValue.padStart(4, '0');
  
  // 최대 4자리만 유지 (초과하는 경우 잘라냄)
  if (hexValue.length > 4) {
    hexValue = hexValue.substring(hexValue.length - 4);
  }
  
  // 최종 형식으로 반환 (0x + 4자리 대문자 16진수)
  return `0x${hexValue}`;
}
