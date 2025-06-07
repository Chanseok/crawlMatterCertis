/**
 * hexUtils.ts
 * 
 * 16진수 ID 관련 유틸리티 함수들
 */

/**
 * 16진수 ID 문자열(0xXXXX 형식)을 정수로 변환
 */
export function hexIdToInteger(hexValue: string | null | undefined): number | null {
  if (!hexValue) return null;
  
  const stringValue = String(hexValue).trim();
  if (['', 'n/a', '-', 'none', 'unknown'].includes(stringValue.toLowerCase())) {
    return null;
  }
  
  try {
    const cleanHex = stringValue.toLowerCase().startsWith('0x')
      ? stringValue.substring(2)
      : stringValue;
    
    const intValue = parseInt(cleanHex, 16);
    return isNaN(intValue) ? null : intValue;
  } catch (e) {
    console.error(`16진수 변환 실패: ${hexValue}`, e);
    return null;
  }
}

/**
 * 정수를 표준 0xXXXX 형식의 16진수 ID 문자열로 변환
 */
export function integerToHexId(value: number | null | undefined): string | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  
  // 16진수로 변환하고 4자리로 패딩
  const hexString = value.toString(16).toUpperCase().padStart(4, '0');
  
  // 4자리로 맞추기
  const normalizedHex = hexString.length > 4 
    ? hexString.substring(hexString.length - 4) 
    : hexString;
  
  return `0x${normalizedHex}`;
}

/**
 * 정수 배열 JSON 문자열을 쉼표로 구분된 16진수 ID 목록으로 변환
 */
export function jsonArrayToHexIdList(jsonArray: string | null | undefined): string | null {
  if (!jsonArray) return null;
  
  try {
    const intArray = JSON.parse(jsonArray);
    if (!Array.isArray(intArray) || intArray.length === 0) return null;
    
    const hexIds = intArray
      .map(value => integerToHexId(value))
      .filter(Boolean);
      
    return hexIds.length > 0 ? hexIds.join(', ') : null;
  } catch (e) {
    console.error(`JSON 배열 파싱 실패: ${jsonArray}`, e);
    return null;
  }
}

/**
 * 쉼표로 구분된 16진수 ID 목록을 정수 배열 JSON 문자열로 변환
 */
export function hexIdListToJsonArray(hexList: string | null | undefined): string | null {
  if (!hexList) return null;
  
  const hexIds = hexList.split(',').map(id => id.trim()).filter(Boolean);
  if (hexIds.length === 0) return '[]';
  
  const intArray = hexIds
    .map(hexId => hexIdToInteger(hexId))
    .filter(value => value !== null);
    
  return JSON.stringify(intArray);
}
