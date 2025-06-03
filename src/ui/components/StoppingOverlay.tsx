import React, { useEffect } from 'react';

interface StoppingOverlayProps {
  isVisible: boolean;
}

/**
 * 크롤링 중지 중일 때 표시되는 오버레이 컴포넌트
 * 사용자에게 중지 과정이 진행 중임을 알려주는 시각적 피드백 제공
 */
export const StoppingOverlay: React.FC<StoppingOverlayProps> = ({ isVisible }) => {
  // 디버깅을 위한 로그와 useEffect
  useEffect(() => {
    console.log('[StoppingOverlay] isVisible changed to:', isVisible);
  }, [isVisible]);
  
  console.log('[StoppingOverlay] Render with isVisible:', isVisible);
  
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 shadow-xl max-w-md w-full mx-4">
        <div className="text-center">
          {/* 애니메이션 아이콘 */}
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full animate-pulse">
              <svg 
                className="w-8 h-8 text-red-600 animate-spin" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>
          
          {/* 메시지 */}
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            크롤링 중지 중
          </h3>
          <p className="text-gray-600 mb-4">
            진행 중인 작업을 안전하게 중지하고 있습니다...
          </p>
          
          {/* 진행 바 */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-red-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
          </div>
          
          {/* 추가 안내 */}
          <p className="text-sm text-gray-500 mt-4">
            잠시만 기다려 주세요. 강제로 종료하지 마세요.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StoppingOverlay;
