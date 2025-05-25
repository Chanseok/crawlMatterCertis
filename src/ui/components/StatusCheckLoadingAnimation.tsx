import React, { useState, useEffect } from 'react';
import './StatusCheckLoadingAnimation.css';

const StatusCheckLoadingAnimation: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % 3); // 0, 1, 2 순환
    }, 3000); // 3초마다 단계 변경

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="status-check-loading-container">
      <div className="status-check-animation-sequence">
        
        {/* 1단계: 비행기가 날아가는 애니메이션 */}
        <div className={`airplane-stage ${currentStep === 0 ? 'active' : ''}`}>
          <div className="airplane">✈️</div>
          <div className="flight-path"></div>
          <div className="clouds">
            <div className="cloud cloud1">☁️</div>
            <div className="cloud cloud2">☁️</div>
            <div className="cloud cloud3">☁️</div>
          </div>
        </div>

        {/* 2단계: 캐비넷을 여는 애니메이션 */}
        <div className={`cabinet-stage ${currentStep === 1 ? 'active' : ''}`}>
          <div className="filing-cabinet">
            <div className="cabinet-body">🗄️</div>
            <div className={`cabinet-drawer ${currentStep === 1 ? 'opening' : ''}`}>
              📁
            </div>
          </div>
        </div>

        {/* 3단계: 파일을 확인하는 애니메이션 */}
        <div className={`file-check-stage ${currentStep === 2 ? 'active' : ''}`}>
          <div className="file-search">
            <div className="magnifying-glass">🔍</div>
            <div className="documents">
              <div className="document doc1">📄</div>
              <div className="document doc2">📊</div>
              <div className="document doc3">📈</div>
            </div>
          </div>
        </div>

      </div>

      {/* 단계별 메시지 */}
      <div className="status-message">
        {currentStep === 0 && <p>서버에 연결하고 있습니다...</p>}
        {currentStep === 1 && <p>데이터베이스를 확인하고 있습니다...</p>}
        {currentStep === 2 && <p>상태 정보를 수집하고 있습니다...</p>}
      </div>

      {/* 진행률 표시 */}
      <div className="progress-dots">
        <div className={`dot ${currentStep >= 0 ? 'active' : ''}`}></div>
        <div className={`dot ${currentStep >= 1 ? 'active' : ''}`}></div>
        <div className={`dot ${currentStep >= 2 ? 'active' : ''}`}></div>
      </div>
    </div>
  );
};

export default StatusCheckLoadingAnimation;
