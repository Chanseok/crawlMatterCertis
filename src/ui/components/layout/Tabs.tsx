import React from 'react';

type TabType = 'settings' | 'status' | 'localDB';

interface TabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Tabs: React.FC<TabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
      <button
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'settings'
            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        onClick={() => onTabChange('settings')}
      >
        설정
      </button>
      <button
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'status'
            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        onClick={() => onTabChange('status')}
      >
        상태 & 제어
      </button>
      <button
        className={`px-4 py-2 text-sm font-medium ${
          activeTab === 'localDB'
            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        onClick={() => onTabChange('localDB')}
      >
        로컬DB
      </button>
    </div>
  );
};
