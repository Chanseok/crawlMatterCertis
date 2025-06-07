#!/usr/bin/env node

/**
 * 수정된 페이지 계산 로직 테스트
 */

// 임시 MissingPageCalculator 클래스
class MissingPageCalculator {
  
  pageIdToPageNumber(pageId, totalPages = 464) {
    return totalPages - pageId;
  }

  pageIdToSitePages(pageId, totalPages = 464) {
    const primaryPage = this.pageIdToPageNumber(pageId, totalPages);
    const nextPage = primaryPage + 1; // 다음 페이지는 번호가 1 큼
    
    // nextPage가 totalPages보다 크면 포함하지 않음
    if (nextPage <= totalPages) {
      return [primaryPage, nextPage];
    } else {
      return [primaryPage];
    }
  }

  pageIdsToSitePages(pageIds, totalPages = 464) {
    const sitePages = [];
    pageIds.forEach(pageId => {
      const sitePagesForId = this.pageIdToSitePages(pageId, totalPages);
      sitePages.push(...sitePagesForId);
    });
    
    // 중복 제거 및 오름차순 정렬 (범위 계산용)
    return [...new Set(sitePages)].sort((a, b) => a - b);
  }

  calculatePageRanges(pageIds) {
    if (pageIds.length === 0) {
      return { continuousRanges: [], nonContinuousRanges: [] };
    }

    // 1. 모든 pageId를 사이트 페이지들로 변환
    const allSitePages = this.pageIdsToSitePages(pageIds);
    
    // 2. 사이트 페이지들을 오름차순으로 정렬 (연속 범위 계산을 위해)
    const sortedSitePages = [...allSitePages].sort((a, b) => a - b);
    
    const continuousRanges = [];
    const nonContinuousRanges = [];

    let currentRangeStart = sortedSitePages[0];
    let currentRangeEnd = sortedSitePages[0];

    for (let i = 1; i < sortedSitePages.length; i++) {
      const currentPage = sortedSitePages[i];
      const previousPage = sortedSitePages[i - 1];

      // 연속된 페이지인지 확인 (차이가 1)
      if (currentPage === previousPage + 1) {
        currentRangeEnd = currentPage;
      } else {
        // 범위 종료 - 현재까지의 범위를 저장
        const totalPages = currentRangeEnd - currentRangeStart + 1;
        const range = {
          startPage: currentRangeEnd, // 큰 번호가 startPage (내림차순 표시를 위해)
          endPage: currentRangeStart, // 작은 번호가 endPage
          reason: `Missing data detected`,
          priority: totalPages >= 3 ? 1 : 2,
          estimatedProducts: totalPages * 12
        };

        // 연속 범위 판단 (3페이지 이상이면 연속으로 간주)
        if (totalPages >= 3) {
          continuousRanges.push(range);
        } else {
          nonContinuousRanges.push(range);
        }

        // 새로운 범위 시작
        currentRangeStart = currentPage;
        currentRangeEnd = currentPage;
      }
    }

    // 마지막 범위 처리
    const lastTotalPages = currentRangeEnd - currentRangeStart + 1;
    const lastRange = {
      startPage: currentRangeEnd, // 큰 번호가 startPage (내림차순 표시를 위해)
      endPage: currentRangeStart, // 작은 번호가 endPage
      reason: `Missing data detected`,
      priority: lastTotalPages >= 3 ? 1 : 2,
      estimatedProducts: lastTotalPages * 12
    };

    if (lastTotalPages >= 3) {
      continuousRanges.push(lastRange);
    } else {
      nonContinuousRanges.push(lastRange);
    }

    return { continuousRanges, nonContinuousRanges };
  }

  formatRangesForDisplay(ranges) {
    const formattedRanges = ranges.map(range => {
      const totalPages = Math.abs(range.endPage - range.startPage) + 1;
      if (totalPages === 1) {
        return `${range.startPage}`;
      } else {
        return `${range.startPage}~${range.endPage}`;
      }
    });
    
    return formattedRanges.join(', ');
  }
}

// 테스트 실행
const calculator = new MissingPageCalculator();

console.log('🧪 수정된 페이지 계산 로직 테스트');
console.log('=====================================');

// 사용자 제공 데이터
const incompletePageIds = [198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 406, 407, 408, 410, 412, 456, 457, 458, 459, 460, 463];

console.log('\n📊 입력 데이터:');
console.log('Incomplete pageIds:', incompletePageIds);

// 1. 각 pageId의 사이트 페이지 변환 확인
console.log('\n🔄 PageId → 사이트 페이지 변환:');
incompletePageIds.slice(0, 5).forEach(pageId => {
  const sitePages = calculator.pageIdToSitePages(pageId);
  console.log(`  pageId ${pageId} → 사이트 페이지 [${sitePages.join(', ')}]`);
});

// 2. 모든 사이트 페이지 변환
const allSitePages = calculator.pageIdsToSitePages(incompletePageIds);
console.log('\n📋 모든 사이트 페이지 (정렬됨):');
console.log('  ', allSitePages);

// 3. 범위 계산
const { continuousRanges, nonContinuousRanges } = calculator.calculatePageRanges(incompletePageIds);

console.log('\n📈 연속 범위:');
continuousRanges.forEach((range, index) => {
  console.log(`  ${index + 1}. ${range.startPage}~${range.endPage} (총 ${Math.abs(range.endPage - range.startPage) + 1}페이지)`);
});

console.log('\n📈 비연속 범위:');
nonContinuousRanges.forEach((range, index) => {
  console.log(`  ${index + 1}. ${range.startPage}~${range.endPage} (총 ${Math.abs(range.endPage - range.startPage) + 1}페이지)`);
});

// 4. 최종 포맷팅 결과
const allRanges = [...continuousRanges, ...nonContinuousRanges];
const formattedResult = calculator.formatRangesForDisplay(allRanges);

console.log('\n✨ 최종 결과:');
console.log('📋 포맷팅된 범위:', formattedResult);

console.log('\n🎯 사용자 예상 결과: 267~257, 59~52, 9~4, 2~1');
console.log('🔍 실제 계산 결과:', formattedResult);

// 예상 결과와 비교
console.log('\n✅ 결과 검증:');
if (formattedResult.includes('267~257')) {
  console.log('  ✅ 첫 번째 범위 (267~257) - 올바름');
} else {
  console.log('  ❌ 첫 번째 범위 - 불일치');
}
