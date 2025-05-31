const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/electron/crawler/tasks/page-crawler.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace debugLog calls with logger calls
const replacements = [
  // Basic message logging
  {
    from: /debugLog\(\`\[PageCrawler\]\s*([^`]+)\`\);/g,
    to: "logger.debug('$1', 'PageCrawler');"
  },
  // Error message logging
  {
    from: /debugLog\(error\.message\);/g,
    to: "logger.error(error.message, 'PageCrawler');"
  },
  // Template literals with variables
  {
    from: /debugLog\(\`\[PageCrawler\]\s*([^`]*\$\{[^}]+\}[^`]*)\`\);/g,
    to: "logger.debug(`$1`, 'PageCrawler');"
  },
  // Simple template literals without [PageCrawler]
  {
    from: /debugLog\(\`([^`]*\$\{[^}]+\}[^`]*)\`\);/g,
    to: "logger.debug(`$1`, 'PageCrawler');"
  },
  // Simple strings without [PageCrawler]
  {
    from: /debugLog\(\`([^`]+)\`\);/g,
    to: "logger.debug('$1', 'PageCrawler');"
  },
  // String literals
  {
    from: /debugLog\('([^']+)'\);/g,
    to: "logger.debug('$1', 'PageCrawler');"
  }
];

replacements.forEach(replacement => {
  content = content.replace(replacement.from, replacement.to);
});

// Additional specific replacements for complex cases
content = content.replace(
  /logger\.debug\('\[PageCrawler\]\s*/g,
  "logger.debug('"
);

fs.writeFileSync(filePath, content);
console.log('Fixed debugLog calls in page-crawler.ts');
