import React from 'react';

interface AppLayoutProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isDevelopment?: boolean;
    children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = React.memo(({ activeTab, onTabChange, isDevelopment, children }) => {
    const [animatingTabs, setAnimatingTabs] = React.useState<Set<string>>(new Set());

    // Add CSS animation for focus ring fade-out - memoized to prevent recreation
    React.useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes focusRingFadeOut {
                0% {
                    box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.75);
                }
                100% {
                    box-shadow: 0 0 0 2px rgba(251, 146, 60, 0);
                }
            }
            
            .tab-focus-animation {
                animation: focusRingFadeOut 2s ease-out forwards;
            }
        `;
        document.head.appendChild(style);
        
        return () => {
            if (document.head.contains(style)) {
                document.head.removeChild(style);
            }
        };
    }, []);

    // Memoized tab click handler to prevent recreation
    const handleTabClick = React.useCallback((tabId: string) => {
        // Add animation class
        setAnimatingTabs(prev => new Set(prev).add(tabId));
        
        // Remove animation class after 2 seconds
        setTimeout(() => {
            setAnimatingTabs(prev => {
                const newSet = new Set(prev);
                newSet.delete(tabId);
                return newSet;
            });
        }, 2000);
        
        onTabChange(tabId);
    }, [onTabChange]);

    // Memoized tabs configuration to prevent recreation
    const tabs = React.useMemo(() => [
        { 
            id: 'settings', 
            label: '설정', 
            icon: '⚙️',
            theme: {
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                text: 'text-emerald-700',
                accent: 'from-emerald-500 to-teal-500'
            }
        },
        { 
            id: 'status', 
            label: '상태 & 제어', 
            icon: '📊',
            theme: {
                bg: 'bg-blue-50',
                border: 'border-blue-200',
                text: 'text-blue-700',
                accent: 'from-blue-500 to-indigo-500'
            }
        },
        { 
            id: 'localDB', 
            label: '로컬DB',
            icon: '🗄️',
            theme: {
                bg: 'bg-purple-50',
                border: 'border-purple-200',
                text: 'text-purple-700',
                accent: 'from-purple-500 to-violet-500'
            }
        },
        { 
            id: 'analysis', 
            label: '분석', 
            icon: '📈',
            theme: {
                bg: 'bg-amber-50',
                border: 'border-amber-200',
                text: 'text-amber-700',
                accent: 'from-amber-500 to-orange-500'
            }
        }
    ], []);

    // Memoized active tab theme to prevent recalculation
    const activeTabTheme = React.useMemo(() => 
        tabs.find(tab => tab.id === activeTab)?.theme, [tabs, activeTab]);

    // Memoized tab renderer for performance
    const renderTab = React.useCallback((tab: any, index: number) => {
        const isAnimating = animatingTabs.has(tab.id);
        
        return (
            <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`
                    relative px-6 py-3 font-medium text-sm whitespace-nowrap
                    transition-all duration-200 ease-in-out rounded-t-lg
                    focus:outline-none
                    ${isAnimating ? 'tab-focus-animation' : ''}
                    ${activeTab === tab.id
                        ? `${tab.theme.bg} ${tab.theme.text} ${tab.theme.border} border-t border-l border-r border-b-0 shadow-md -mb-px z-10`
                        : 'bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200'
                    }
                    ${index === 0 ? 'ml-0' : ''}
                `}
                style={{
                    boxShadow: activeTab === tab.id 
                        ? '0 -2px 8px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)' 
                        : 'none'
                }}
            >
                <span className="mr-2 text-base">{tab.icon}</span>
                <span className="font-semibold">{tab.label}</span>
                
                {/* 활성 탭에 그라데이션 언더라인 */}
                {activeTab === tab.id && (
                    <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${tab.theme.accent} rounded-b-lg`} />
                )}
            </button>
        );
    }, [activeTab, animatingTabs, handleTabClick]);

    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-gray-100">
            {/* 헤더 */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="px-6 py-4">
                    <h1 className="text-2xl font-bold text-gray-900">
                        Matter Certification Crawler
                    </h1>
                </div>
            </header>

            {/* 탭 네비게이션 - 프랭클린 다이어리 스타일 */}
            <div className="bg-white shadow-sm">
                <div className="px-6 pt-4">
                    <div className="flex space-x-1">
                        {tabs.map(renderTab)}
                    </div>
                </div>
            </div>

            {/* 메인 컨텐츠 */}
            <main className={`flex-1 ${activeTabTheme?.bg || 'bg-gray-50'} transition-colors duration-200`}>
                <div className="px-6 py-6 h-full">
                    {children}
                </div>
            </main>

            {/* 개발자 모드 표시 */}
            {isDevelopment && (
                <div className="fixed bottom-4 right-4 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                    🚧 DEV MODE
                </div>
            )}
        </div>
    );
});

AppLayout.displayName = 'AppLayout';

export { AppLayout };