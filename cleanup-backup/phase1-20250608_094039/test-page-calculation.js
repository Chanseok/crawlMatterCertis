/**
 * 페이지 계산 테스트
 * 사용자 제공 데이터로 계산 공식 검증
 */

// 사용자 제공 데이터
const incompletePageIds = [198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 406, 407, 408, 410, 412, 456, 457, 458, 459, 460, 463];
const totalPages = 464;

// 새로운 계산 공식
function pageIdToPageNumber(pageId, totalPages = 464) {
  return totalPages - pageId + 1;
}

function pageIdToSitePages(pageId, totalPages = 464) {
  const primaryPage = pageIdToPageNumber(pageId, totalPages);
  const nextPage = primaryPage - 1; // 다음 페이지는 번호가 1 작음 (역순이므로)
  
  if (nextPage >= 1) {
    return [primaryPage, nextPage];
  } else {
    return [primaryPage];
  }
}

console.log('🧪 페이지 계산 공식 테스트');
console.log('==============================');

// 몇 가지 샘플 테스트
console.log('\n📝 개별 pageId 변환 테스트:');
const testPageIds = [198, 199, 200, 407, 456, 460, 463];
testPageIds.forEach(pageId => {
  const sitePageNumber = pageIdToPageNumber(pageId);
  const sitePages = pageIdToSitePages(pageId);
  console.log(`pageId ${pageId} → 사이트 페이지 ${sitePageNumber} → 수집 대상 [${sitePages.join(', ')}]`);
});

// 전체 수집 대상 페이지 계산
console.log('\n🎯 전체 수집 대상 페이지:');
const allSitePages = [];
incompletePageIds.forEach(pageId => {
  const sitePages = pageIdToSitePages(pageId);
  allSitePages.push(...sitePages);
});

// 중복 제거 및 정렬
const uniqueSitePages = [...new Set(allSitePages)].sort((a, b) => b - a);
console.log('수집 대상 사이트 페이지:', uniqueSitePages.join(', '));

// 연속 범위 계산
function calculateRanges(pages) {
  if (pages.length === 0) return [];
  
  const sortedPages = [...pages].sort((a, b) => b - a); // 내림차순 정렬
  const ranges = [];
  
  let rangeStart = sortedPages[0];
  let rangeEnd = sortedPages[0];
  
  for (let i = 1; i < sortedPages.length; i++) {
    const currentPage = sortedPages[i];
    const previousPage = sortedPages[i - 1];
    
    // 연속된 페이지인지 확인 (내림차순이므로 차이가 -1)
    if (currentPage === previousPage - 1) {
      rangeEnd = currentPage;
    } else {
      // 범위 종료
      if (rangeStart === rangeEnd) {
        ranges.push(rangeStart.toString());
      } else {
        ranges.push(`${rangeStart}~${rangeEnd}`);
      }
      
      // 새로운 범위 시작
      rangeStart = currentPage;
      rangeEnd = currentPage;
    }
  }
  
  // 마지막 범위 처리
  if (rangeStart === rangeEnd) {
    ranges.push(rangeStart.toString());
  } else {
    ranges.push(`${rangeStart}~${rangeEnd}`);
  }
  
  return ranges;
}

console.log('\n📋 페이지 범위 (Copy & Paste 형태):');
const ranges = calculateRanges(uniqueSitePages);
console.log(ranges.join(', '));

console.log('\n✅ 기대값과 비교:');
console.log('기대값: 267~257, 59~52, 9~4, 2~1');
console.log('계산값:', ranges.join(', '));
