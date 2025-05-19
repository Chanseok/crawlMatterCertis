/**
 * hexDisplayUtils.ts
 * 
 * UI에서 hex 값 표시를 위한 유틸리티 함수
 */

/**
 * 정수 값을 0xXXXX 형식의 hex 문자열로 변환
 */
export function intToHexDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  
  // 16진수로 변환하고 4자리로 패딩
  const hexString = value.toString(16).toUpperCase().padStart(4, '0');
  
  return `0x${hexString}`;
}

/**
 * JSON 배열 문자열을 콤마로 구분된 hex 값 목록으로 변환
 */
export function jsonArrayToHexDisplay(jsonArray: string | null | undefined): string {
  if (!jsonArray) return '-';
  
  try {
    const values = JSON.parse(jsonArray);
    if (!Array.isArray(values) || values.length === 0) return '-';
    
    return values
      .map(val => intToHexDisplay(val))
      .join(', ');
  } catch (e) {
    console.error('JSON 배열 파싱 실패:', e);
    return jsonArray; // 파싱 실패 시 원본 값 반환
  }
}
