/**
 * normalizeHexIds.ts
 * 
 * 애플리케이션 전체에서 16진수 ID 정규화에 사용할 수 있는 유틸리티 함수들
 */

import { hexUtilsLogger } from './logger.js';

/**
 * Hex ID를 표준 0xXXXX 형식으로 정규화하는 함수
 * @param value 정규화할 값 (문자열, 숫자 또는 null/undefined)
 * @returns 정규화된 hex 문자열 또는 null (값이 없거나 변환 불가능한 경우)
 */
export function normalizeHexId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  
  // 숫자 타입 처리
  if (typeof value === 'number') {
    return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  
  const stringValue = String(value).trim();
  if (['', 'n/a', '-', 'none', 'unknown'].includes(stringValue.toLowerCase())) {
    return null;
  }
  
  // 이미 정규화된 형식인지 확인
  const normalizedRegex = /^0x[0-9A-F]{4}$/;
  if (normalizedRegex.test(stringValue)) {
    return stringValue;
  }
  
  let hexValue: string;
  
  // 형식에 따른 hex 값 추출
  if (/^0x[0-9A-Fa-f]+$/i.test(stringValue)) {
    hexValue = stringValue.substring(2).toUpperCase();
  } else if (/^[0-9A-Fa-f]+$/i.test(stringValue)) {
    hexValue = stringValue.toUpperCase();
  } else if (/^\d+$/.test(stringValue)) {
    try {
      hexValue = parseInt(stringValue, 10).toString(16).toUpperCase();
    } catch (e) {
      hexUtilsLogger.error('Failed to parse numeric string to hex', { data: { stringValue, error: e } });
      return null;
    }
  } else {
    hexUtilsLogger.warn('Cannot convert value to hex', { data: { stringValue } });
    return null;
  }
  
  // 4자리로 표준화
  hexValue = hexValue.padStart(4, '0');
  if (hexValue.length > 4) {
    hexValue = hexValue.substring(hexValue.length - 4);
  }
  
  return `0x${hexValue}`;
}

/**
 * primaryDeviceTypeId의 콤마로 구분된 값을 정규화하는 함수
 * @param value 정규화할 콤마로 구분된 ID 문자열
 * @returns 정규화된 콤마로 구분된 ID 문자열 또는 null (값이 없는 경우)
 */
export function normalizePrimaryDeviceTypeIds(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const idList = value.split(',').map(id => id.trim());
  const normalizedIds = idList
    .map(id => normalizeHexId(id))
    .filter(Boolean); // null/undefined 제거
  
  return normalizedIds.length > 0 ? normalizedIds.join(', ') : null;
}
