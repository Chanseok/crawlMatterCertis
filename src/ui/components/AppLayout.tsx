import React from 'react';

interface AppLayoutProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isDevelopment?: boolean;
    children: React.ReactNode;
}

export function AppLayout({ activeTab, onTabChange, isDevelopment, children }: AppLayoutProps) {
    // 탭 정의 - 4개 탭 모두 포함
    const tabs = [
        { id: 'settings', label: '설정', icon: '⚙️' },
        { id: 'status', label: '상태 & 제어', icon: '📊' },
        { id: 'localDB', label: '로컬DB', icon: '💾' },
        { id: 'analysis', label: '분석', icon: '📈' }, // 4번째 탭
    ];

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* 헤더 */}
            <header className="bg-white shadow-sm border-b">
                <div className="px-6 py-4">
                    <h1 className="text-2xl font-bold text-gray-900">
                        Matter Certification Crawler
                    </h1>
                </div>
            </header>

            {/* 탭 네비게이션 */}
            <nav className="bg-white border-b">
                <div className="px-6">
                    <div className="flex space-x-8">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`
                  py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }
                `}
                            >
                                <span className="mr-2">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </nav>

            {/* 메인 콘텐츠 */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>

            {/* 개발 모드 표시 */}
            {isDevelopment && (
                <div className="bg-yellow-100 border-t border-yellow-200 px-6 py-2">
                    <p className="text-yellow-800 text-sm">
                        🚧 Development Mode
                    </p>
                </div>
            )}
        </div>
    );
}