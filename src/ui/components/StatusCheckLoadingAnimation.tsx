import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './StatusCheckLoadingAnimation.css';

const StatusCheckLoadingAnimation: React.FC = React.memo(() => {
  const [currentStep, setCurrentStep] = useState(0);
  const airplaneRef = useRef<HTMLDivElement>(null);
  const airplaneElementRef = useRef<HTMLDivElement>(null);
  const animationStartedRef = useRef(false);
  
  // Memoized status messages to prevent recreation on every render
  const statusMessages = useMemo(() => ({
    0: "서버에 연결하고 있습니다...",
    1: "데이터베이스를 확인하고 있습니다...",
    2: "상태 정보를 수집하고 있습니다..."
  }), []);

  // Memoized CSS classes for optimization
  const getCabinetStageClass = useCallback((step: number) => 
    `cabinet-stage ${step === 1 ? 'active' : ''}`, []);

  const getFileCheckStageClass = useCallback((step: number) => 
    `file-check-stage ${step === 2 ? 'active' : ''}`, []);

  const getCabinetDrawerClass = useCallback((step: number) => 
    `cabinet-drawer ${step === 1 ? 'opening' : ''}`, []);

  const getDotClass = useCallback((step: number, currentStep: number) => 
    `dot ${currentStep >= step ? 'active' : ''}`, []);

  // 첫 렌더링 시에만 비행기 애니메이션 실행
  useEffect(() => {
    if (animationStartedRef.current) return;
    
    // 애니메이션 시작 상태로 표시
    animationStartedRef.current = true;
    
    // 처음 비행기 애니메이션 시작
    setTimeout(() => {
      if (airplaneRef.current) {
        // 비행기 컨테이너를 보이게 설정
        airplaneRef.current.style.display = 'block';
        
        // 비행기 애니메이션 트리거
        if (airplaneElementRef.current) {
          airplaneElementRef.current.style.opacity = '1'; 
          airplaneRef.current.classList.add('fly-animation');
        }
      }
      
      // 비행기 애니메이션 끝난 후 다음 단계로 이동
      setTimeout(() => {
        setCurrentStep(1);
        
        // 이후 단계 순환
        const interval = setInterval(() => {
          setCurrentStep(prev => (prev === 1) ? 2 : 1);
        }, 3000);
        
        return () => clearInterval(interval);
      }, 3000);  // 비행기 애니메이션 시간
    }, 100);
  }, []);

  return (
    <div className="status-check-loading-container">
      <div className="status-check-animation-sequence">
        
        {/* 비행기 애니메이션 - 분리된 엘리먼트로 관리 */}
        <div 
          ref={airplaneRef} 
          className="airplane-container"
        >
          <div ref={airplaneElementRef} className="airplane">✈️</div>
        </div>
        
        {/* 구름 배경은 항상 표시 */}
        <div className="clouds-background">
          <div className="cloud cloud1">☁️</div>
          <div className="cloud cloud2">☁️</div>
          <div className="cloud cloud3">☁️</div>
        </div>

        {/* 2단계: 캐비넷을 여는 애니메이션 */}
        <div className={getCabinetStageClass(currentStep)}>
          <div className="filing-cabinet">
            <div className="cabinet-body">🗄️</div>
            <div className={getCabinetDrawerClass(currentStep)}>
              📁
            </div>
          </div>
        </div>

        {/* 3단계: 파일을 확인하는 애니메이션 */}
        <div className={getFileCheckStageClass(currentStep)}>
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
        <p>{statusMessages[currentStep as keyof typeof statusMessages]}</p>
      </div>

      {/* 진행률 표시 */}
      <div className="progress-dots">
        <div className={getDotClass(0, currentStep)}></div>
        <div className={getDotClass(1, currentStep)}></div>
        <div className={getDotClass(2, currentStep)}></div>
      </div>
    </div>
  );
});

StatusCheckLoadingAnimation.displayName = 'StatusCheckLoadingAnimation';

export default StatusCheckLoadingAnimation;
