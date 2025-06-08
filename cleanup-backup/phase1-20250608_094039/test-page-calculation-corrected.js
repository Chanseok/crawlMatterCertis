/**
 * Test the corrected page calculation logic
 */

// Test data from user
const incompletePageIds = [198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 406, 407, 408, 410, 412, 456, 457, 458, 459, 460, 463];
const totalPages = 464;

// Test the new formula: sitePageNumber = totalPages - pageId
function pageIdToPageNumber(pageId, totalPages = 464) {
  return totalPages - pageId;
}

function pageIdToSitePages(pageId, totalPages = 464) {
  const primaryPage = pageIdToPageNumber(pageId, totalPages);
  const nextPage = primaryPage + 1;
  
  if (nextPage <= totalPages) {
    return [primaryPage, nextPage];
  } else {
    return [primaryPage];
  }
}

console.log('Testing corrected page calculation logic:');
console.log('=====================================');

// Test specific examples from user
console.log('Test examples:');
console.log('pageId 198 →', pageIdToSitePages(198)); // Should be [266, 267]
console.log('pageId 199 →', pageIdToSitePages(199)); // Should be [265, 266]
console.log('pageId 463 →', pageIdToSitePages(463)); // Should be [1, 2]

console.log('\nExpected site pages for incomplete pageIds:');
const expectedSitePages = incompletePageIds.map(pageId => {
  const sitePages = pageIdToSitePages(pageId);
  return { pageId, sitePages };
});

expectedSitePages.forEach(({ pageId, sitePages }) => {
  console.log(`pageId ${pageId} → site pages [${sitePages.join(', ')}]`);
});

// Calculate all unique site pages
const allSitePages = [];
expectedSitePages.forEach(({ sitePages }) => {
  allSitePages.push(...sitePages);
});

const uniqueSitePages = [...new Set(allSitePages)].sort((a, b) => a - b);
console.log('\nAll unique site pages to crawl:');
console.log(uniqueSitePages.join(', '));

// Calculate ranges
function calculateRanges(pages) {
  const sortedPages = [...pages].sort((a, b) => a - b);
  const ranges = [];
  let start = sortedPages[0];
  let end = sortedPages[0];
  
  for (let i = 1; i < sortedPages.length; i++) {
    if (sortedPages[i] === end + 1) {
      end = sortedPages[i];
    } else {
      if (start === end) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}~${end}`);
      }
      start = sortedPages[i];
      end = sortedPages[i];
    }
  }
  
  // Add last range
  if (start === end) {
    ranges.push(`${start}`);
  } else {
    ranges.push(`${start}~${end}`);
  }
  
  return ranges.join(', ');
}

console.log('\nRange format:');
console.log(calculateRanges(uniqueSitePages));
