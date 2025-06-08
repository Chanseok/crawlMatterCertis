// 간단한 계산 검증
const pageIds = [198, 199, 200, 201, 202, 203, 204, 205, 206, 207];

console.log('🧪 간단한 페이지 계산 검증');
console.log('========================');

// pageId를 사이트 페이지로 변환 (464 - pageId)
const sitePageConversions = pageIds.map(pageId => {
  const primaryPage = 464 - pageId;
  const nextPage = primaryPage + 1;
  return { pageId, primaryPage, nextPage, pages: [primaryPage, nextPage] };
});

console.log('📋 PageId → 사이트 페이지 변환:');
sitePageConversions.forEach(({ pageId, primaryPage, nextPage, pages }) => {
  console.log(`  pageId ${pageId} → 사이트 페이지 ${primaryPage}, ${nextPage} (${pages.join(', ')})`);
});

// 모든 사이트 페이지 수집
const allSitePages = [];
sitePageConversions.forEach(({ pages }) => {
  allSitePages.push(...pages);
});

// 중복 제거 및 정렬
const uniqueSitePages = [...new Set(allSitePages)].sort((a, b) => a - b);

console.log('\n📊 모든 사이트 페이지 (중복 제거 후):');
console.log('  ', uniqueSitePages);

// 연속 범위 계산
const ranges = [];
let start = uniqueSitePages[0];
let end = uniqueSitePages[0];

for (let i = 1; i < uniqueSitePages.length; i++) {
  if (uniqueSitePages[i] === uniqueSitePages[i-1] + 1) {
    end = uniqueSitePages[i];
  } else {
    ranges.push({ start, end });
    start = uniqueSitePages[i];
    end = uniqueSitePages[i];
  }
}
ranges.push({ start, end });

console.log('\n📈 계산된 범위 (오름차순):');
ranges.forEach((range, index) => {
  const totalPages = range.end - range.start + 1;
  console.log(`  ${index + 1}. ${range.start}~${range.end} (총 ${totalPages}페이지)`);
});

console.log('\n📈 표시용 범위 (내림차순):');
ranges.forEach((range, index) => {
  const totalPages = range.end - range.start + 1;
  // 내림차순으로 표시: 큰 번호~작은 번호
  console.log(`  ${index + 1}. ${range.end}~${range.start} (총 ${totalPages}페이지)`);
});

const displayFormat = ranges.map(range => {
  const totalPages = range.end - range.start + 1;
  if (totalPages === 1) {
    return `${range.start}`;
  } else {
    return `${range.end}~${range.start}`;
  }
}).join(', ');

console.log('\n✨ 최종 표시 형태:', displayFormat);
console.log('🎯 사용자 예상: 267~257, 59~52, 9~4, 2~1');
