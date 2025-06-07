#!/bin/zsh
# filepath: scripts/analyze-logs.sh
# Log analysis and summary script

echo "📊 Development Session Log Analysis"
echo "===================================="

CURRENT_TIME=$(date '+%Y-%m-%d %H:%M:%S %Z')
echo "Analysis Time: ${CURRENT_TIME}"
echo ""

# Browser Log 분석
if [ -f "dist-output/browser.log" ]; then
    echo "🌐 Browser Console Log Analysis:"
    
    # 세션 정보 추출
    SESSION_START=$(grep "BROWSER CONSOLE LOG STARTED" dist-output/browser.log | head -1)
    SESSION_END=$(grep "BROWSER CONSOLE LOG ENDED" dist-output/browser.log | tail -1)
    
    if [ -n "$SESSION_START" ]; then
        echo "   📅 Session Start: $(echo $SESSION_START | cut -d':' -f2- | xargs)"
    fi
    
    if [ -n "$SESSION_END" ]; then
        echo "   📅 Session End:   $(echo $SESSION_END | cut -d':' -f2- | xargs)"
    fi
    
    echo "   📄 Total lines: $(wc -l < dist-output/browser.log)"
    echo "   ❌ Errors: $(grep -c "\[ERROR\]" dist-output/browser.log)"
    echo "   ⚠️  Warnings: $(grep -c "\[WARN\]" dist-output/browser.log)"
    echo "   📈 Progress events: $(grep -c "crawlingProgress" dist-output/browser.log)"
    echo "   🔄 Store updates: $(grep -c "Progress updated in store" dist-output/browser.log)"
    echo "   🎯 Component renders: $(grep -c "ProgressBarDisplay.*Rendering" dist-output/browser.log)"
    echo ""
    
    # 최근 에러 표시
    echo "   🔍 Recent errors (last 5):"
    if grep -q "\[ERROR\]" dist-output/browser.log; then
        grep "\[ERROR\]" dist-output/browser.log | tail -5 | while read line; do
            echo "      ${line}"
        done
    else
        echo "      No errors found"
    fi
    echo ""
else
    echo "🌐 Browser Log: Not found"
    echo ""
fi

# Terminal Log 분석
if [ -f "dist-output/terminal.log" ]; then
    echo "🖥️  Terminal Log Analysis:"
    
    # 세션 정보 추출
    SESSION_START=$(grep "DEVELOPMENT SESSION STARTED" dist-output/terminal.log | head -1)
    SESSION_END=$(grep "DEVELOPMENT SESSION ENDED" dist-output/terminal.log | tail -1)
    
    if [ -n "$SESSION_START" ]; then
        echo "   📅 Session Start: $(echo $SESSION_START | cut -d':' -f2- | xargs)"
    fi
    
    if [ -n "$SESSION_END" ]; then
        echo "   📅 Session End:   $(echo $SESSION_END | cut -d':' -f2- | xargs)"
    fi
    
    echo "   📄 Total lines: $(wc -l < dist-output/terminal.log)"
    echo "   🔨 Build errors: $(grep -ci "error" dist-output/terminal.log)"
    echo "   📡 IPC events: $(grep -c "crawlingProgress" dist-output/terminal.log)"
    echo "   🚀 App starts: $(grep -c "Electron app started" dist-output/terminal.log)"
    echo ""
else
    echo "🖥️  Terminal Log: Not found"
    echo ""
fi

# 백업 파일 정보
echo "💾 Log Backups:"
BACKUP_COUNT=$(ls dist-output/*.backup.* 2>/dev/null | wc -l)
if [ $BACKUP_COUNT -gt 0 ]; then
    echo "   Found ${BACKUP_COUNT} backup files:"
    ls -la dist-output/*.backup.* 2>/dev/null | while read line; do
        echo "   ${line}"
    done
else
    echo "   No backup files found"
fi
echo ""

# 권장 사항
echo "💡 Recommendations:"
if [ -f "dist-output/browser.log" ]; then
    ERROR_COUNT=$(grep -c "\[ERROR\]" dist-output/browser.log)
    PROGRESS_COUNT=$(grep -c "crawlingProgress" dist-output/browser.log)
    
    if [ $ERROR_COUNT -gt 0 ]; then
        echo "   ⚠️  Found ${ERROR_COUNT} errors - check browser log for details"
    fi
    
    if [ $PROGRESS_COUNT -eq 0 ]; then
        echo "   ⚠️  No progress events found - check IPC communication"
    fi
    
    if [ $ERROR_COUNT -eq 0 ] && [ $PROGRESS_COUNT -gt 0 ]; then
        echo "   ✅ Logs look healthy - progress events are flowing"
    fi
else
    echo "   ⚠️  No browser log found - run 'npm run dev:with-logs' first"
fi
