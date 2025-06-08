#!/bin/bash

# 프로젝트 정리 스크립트
# 실행 전 반드시 git commit 하여 백업을 만들어주세요!

echo "🧹 프로젝트 정리 시작..."

# 1. 즉시 삭제 가능한 파일들
echo "📁 불필요한 백업/임시 파일 삭제..."
rm -f src/electron/database.ts-new
rm -f dist-electron/electron/crawler/gap-detector-new.js
rm -f dist-electron/electron/crawler/gap-detector-new.js.map

# 2. macOS 시스템 파일 삭제
echo "🍎 macOS 시스템 파일 삭제..."
find . -name ".DS_Store" -type f -delete

# 3. 임시 파일 및 백업 파일 삭제
echo "🗑️  임시 파일 삭제..."
find . -name "*.tmp" -type f -delete
find . -name "*.temp" -type f -delete
find . -name "*~" -type f -delete
find . -name "*.bak" -type f -delete

# 4. 로그 파일 백업 및 정리 (선택적)
echo "📄 로그 파일 정리..."
if [ -f "dist-output/browser.log" ]; then
    if [ -s "dist-output/browser.log" ]; then
        mv dist-output/browser.log dist-output/browser.log.$(date +%Y%m%d_%H%M%S)
        echo "기존 로그 파일을 백업했습니다."
    else
        rm -f dist-output/browser.log
        echo "빈 로그 파일을 삭제했습니다."
    fi
fi

echo "✅ 1단계 정리 완료!"

# 5. archive 폴더 분석
echo ""
echo "📂 Archive 폴더 분석..."
echo "다음 파일들이 archive 폴더에 있습니다:"
find archive/ -type f | sort

echo ""
echo "📊 정리 결과:"
echo "- 삭제된 파일: database.ts-new, gap-detector-new.js*, .DS_Store 파일들"
echo "- 백업된 파일: 활성 로그 파일 (있는 경우)"
echo "- 검토 필요: archive/ 폴더 내 파일들"

echo ""
echo "⚠️  다음 단계:"
echo "1. git status로 변경사항 확인"
echo "2. archive/ 폴더 내용 검토 후 필요시 삭제"
echo "3. package.json의 clean-logs 스크립트 활용"
