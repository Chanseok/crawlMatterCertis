import React from 'react';
import './StatusCheckLoadingAnimation.css';

const StatusCheckLoadingAnimation: React.FC = () => {
  return (
    <div className="status-check-loading-container">
      <div className="status-check-loading-animation">
        <div className="magnifying-glass">
          <div className="magnifying-glass-handle"></div>
          <div className="magnifying-glass-lens"></div>
        </div>
        <div className="dots">
          <div className="dot dot1"></div>
          <div className="dot dot2"></div>
          <div className="dot dot3"></div>
        </div>
      </div>
      <p>상태를 확인하고 있습니다. 잠시만 기다려 주세요...</p>
    </div>
  );
};

export default StatusCheckLoadingAnimation;
