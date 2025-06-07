import React, { useEffect, useState } from 'react';
import './StatusCheckAnimation.css';

interface StatusCheckAnimationProps {
  isChecking: boolean;
  onAnimationComplete?: () => void;
}

export const StatusCheckAnimation: React.FC<StatusCheckAnimationProps> = ({ 
  isChecking,
  onAnimationComplete
}) => {
  const [animationStage, setAnimationStage] = useState<number>(0);
  
  useEffect(() => {
    if (!isChecking) {
      setAnimationStage(0);
      return;
    }
    
    // 애니메이션 순서와 타이밍 설정
    const stages = [
      { stage: 1, delay: 100 },   // 날아가기
      { stage: 2, delay: 1600 },  // 웹사이트 도착 (비행기 애니메이션이 끝난 후)
      { stage: 3, delay: 2500 },  // 캐비넷 열기
      { stage: 4, delay: 3000 },  // 폴더 열기
      { stage: 5, delay: 3800 },  // 페이지 넘기기
      { stage: 6, delay: 5000 }   // 완료
    ];
    
    let timeouts: number[] = []; // Changed NodeJS.Timeout[] to number[]
    
    stages.forEach(({ stage, delay }) => {
      const timeout = setTimeout(() => {
        setAnimationStage(stage);
        if (stage === 6 && onAnimationComplete) {
          onAnimationComplete();
        }
      }, delay);
      timeouts.push(timeout);
    });
    
    // 컴포넌트 언마운트시 타이머 정리
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isChecking, onAnimationComplete]);
  
  // 애니메이션이 진행 중이 아니면 아무것도 렌더링하지 않음
  if (!isChecking && animationStage === 0) return null;
  
  return (
    <div className="status-check-animation">
      {/* 스테이지 1: 지구 반대편으로 날아가는 애니메이션 */}
      {animationStage >= 1 && (
        <div className={`flying-globe ${animationStage >= 2 ? 'arrived' : ''}`}>
          <div className="airplane">✈️</div>
          <div className="globe">🌎</div>
        </div>
      )}
      
      {/* 스테이지 2-3: 웹사이트와 캐비넷 */}
      {animationStage >= 2 && (
        <div className="website-scene">
          <div className="website-header">
            <div className="url-bar">https://csa-iot.org</div>
            <div className="title">CSA Certified Products Database</div>
          </div>
          
          {animationStage >= 3 && (
            <div className={`filing-cabinet ${animationStage >= 4 ? 'open' : ''}`}>
              <div className="cabinet-label">제품 데이터베이스</div>
              
              {animationStage >= 4 && (
                <div className="folder">
                  <div className="folder-tab">Matter 인증 제품</div>
                  
                  {animationStage >= 5 && (
                    <div className="flipping-pages">
                      <div className="page page-1">
                        <div className="page-content">
                          <div className="page-header">Product Listings</div>
                          <div className="page-data">
                            <div className="data-row">Device ID: 1001</div>
                            <div className="data-row">Name: Smart Light</div>
                            <div className="data-row">Type: Lighting</div>
                          </div>
                        </div>
                      </div>
                      <div className="page page-2">
                        <div className="page-content">
                          <div className="page-header">Product Listings</div>
                          <div className="page-data">
                            <div className="data-row">Device ID: 1002</div>
                            <div className="data-row">Name: Smart Plug</div>
                            <div className="data-row">Type: Power</div>
                          </div>
                        </div>
                      </div>
                      <div className="page page-3">
                        <div className="page-content">
                          <div className="page-header">Product Listings</div>
                          <div className="page-data">
                            <div className="data-row">Device ID: 1003</div>
                            <div className="data-row">Name: Smart Sensor</div>
                            <div className="data-row">Type: Security</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="counting-numbers">
                        <div className="counter-label">총 제품 수:</div>
                        <div className="counter">
                          {Array(5).fill(0).map((_, i) => (
                            <span key={i} className="digit">{Math.floor(Math.random() * 10)}</span>
                          ))}
                        </div>
                        <div className="status-text">데이터 분석 중...</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusCheckAnimation;
