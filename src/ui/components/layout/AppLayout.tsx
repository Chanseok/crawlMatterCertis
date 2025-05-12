import React, { ReactNode } from 'react';
import { appModeStore, toggleAppMode } from '../../stores';

type AppLayoutProps = {
  children: ReactNode;
};

export const AppLayout = React.memo(function AppLayout({ children }: AppLayoutProps) {
  // nanostores를 useState로 래핑하여 안정성 향상
  const [mode, setMode] = React.useState(() => appModeStore.get());
  
  // 모드 변경 감지
  React.useEffect(() => {
    const unsubscribe = appModeStore.listen(setMode);
    return unsubscribe;
  }, []);

  // 모드 토글 핸들러
  const handleToggleMode = React.useCallback(() => {
    toggleAppMode();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 헤더 영역 */}
      <header className="bg-white dark:bg-gray-800 shadow-md p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Matter 인증 정보 수집기</h1>

          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <span className="mr-2 text-gray-600 dark:text-gray-300">모드:</span>
              <button
                onClick={handleToggleMode}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  mode === 'development' ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'
                }`}
              >
                {mode === 'development' ? '개발 모드' : '실사용 모드'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {children}
      </main>

      {/* 푸터 영역 */}
      <footer className="bg-white dark:bg-gray-800 shadow-inner py-4 mt-10">
        <div className="container mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          © {new Date().getFullYear()} Matter 인증 정보 수집기 - 버전 1.0
        </div>
      </footer>
    </div>
  );
});
