import React from 'react';
import { observer } from 'mobx-react-lite';
import { useUIStore } from '../../hooks/useUIStore';

export const Header: React.FC = observer(() => {
  const { appMode, toggleAppMode } = useUIStore();
  
  return (
    <header className="bg-white dark:bg-gray-800 shadow-md p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Matter 인증 정보 수집기</h1>

        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <span className="mr-2 text-gray-600 dark:text-gray-300">모드:</span>
            <button
              onClick={toggleAppMode}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                appMode === 'development'
                  ? 'bg-amber-500 text-white'
                  : 'bg-green-500 text-white'
              }`}
            >
              {appMode === 'development' ? '개발 모드' : '실사용 모드'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});
