#!/bin/zsh
# filepath: scripts/dev-with-logging.sh
# Development server with automatic console logging

echo "🚀 Starting development with browser console logging..."

# dist-output 디렉토리 생성 (없는 경우)
mkdir -p dist-output

# 현재 시간 정보
CURRENT_TIME=$(date '+%Y-%m-%d %H:%M:%S %Z')
SESSION_ID=$(date '+%Y%m%d_%H%M%S')

# 기존 로그 파일 백업
if [ -f "dist-output/browser.log" ]; then
    mv dist-output/browser.log "dist-output/browser.log.backup.${SESSION_ID}"
    echo "📦 Backed up previous browser.log"
fi

if [ -f "dist-output/terminal.log" ]; then
    mv dist-output/terminal.log "dist-output/terminal.log.backup.${SESSION_ID}"
    echo "📦 Backed up previous terminal.log"
fi

# 로그 파일 초기화 (시작 시간 기록)
echo "=== DEVELOPMENT SESSION STARTED: ${CURRENT_TIME} ===" > dist-output/terminal.log
echo "Session ID: ${SESSION_ID}" >> dist-output/terminal.log
echo "Working Directory: $(pwd)" >> dist-output/terminal.log
echo "Node Version: $(node --version)" >> dist-output/terminal.log
echo "NPM Version: $(npm --version)" >> dist-output/terminal.log
echo "========================================" >> dist-output/terminal.log
echo "" >> dist-output/terminal.log

echo "=== BROWSER CONSOLE LOG STARTED: ${CURRENT_TIME} ===" > dist-output/browser.log
echo "Session ID: ${SESSION_ID}" >> dist-output/browser.log
echo "User Agent: Will be updated when Electron starts" >> dist-output/browser.log
echo "========================================" >> dist-output/browser.log
echo "" >> dist-output/browser.log

echo "📝 Log files initialized:"
echo "   - Terminal: dist-output/terminal.log"
echo "   - Browser:  dist-output/browser.log"
echo "   - Session:  ${SESSION_ID}"
echo ""

# Terminal 로그와 함께 개발 서버 실행
echo "🔧 Starting development server..."
npm run dev 2>&1 | tee -a dist-output/terminal.log &
DEV_PID=$!

echo "🔧 Development server started (PID: $DEV_PID)"
echo "📱 Waiting for Electron app to start..."

# Electron 앱이 시작될 때까지 대기
sleep 5

echo "🌐 Browser console logging will start automatically"
echo "📊 Monitor logs in real-time:"
echo "   tail -f dist-output/terminal.log"
echo "   tail -f dist-output/browser.log"
echo ""
echo "⏹️  To stop: Ctrl+C or npm run stop-dev"

# 종료 시 정리 작업
cleanup() {
    echo ""
    echo "🛑 Stopping development server..."
    
    # 종료 시간 기록
    END_TIME=$(date '+%Y-%m-%d %H:%M:%S %Z')
    echo "" >> dist-output/terminal.log
    echo "=== DEVELOPMENT SESSION ENDED: ${END_TIME} ===" >> dist-output/terminal.log
    echo "" >> dist-output/browser.log
    echo "=== BROWSER CONSOLE LOG ENDED: ${END_TIME} ===" >> dist-output/browser.log
    
    # 프로세스 종료
    kill $DEV_PID 2>/dev/null
    
    echo "📊 Session Summary:"
    echo "   Started:  ${CURRENT_TIME}"
    echo "   Ended:    ${END_TIME}"
    echo "   Session:  ${SESSION_ID}"
    echo "   Logs saved in dist-output/"
    
    exit 0
}

# 사용자가 Ctrl+C로 종료할 때까지 대기
trap cleanup SIGINT SIGTERM

wait $DEV_PID
