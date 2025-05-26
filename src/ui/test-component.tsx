import React from 'react';

export const TestComponent: React.FC = () => {
  console.log('[TestComponent] Rendering test component');
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#e3f2fd', 
      border: '2px solid #1976d2',
      margin: '20px',
      borderRadius: '8px'
    }}>
      <h1 style={{ color: '#1976d2' }}>✅ Test Component Loaded Successfully!</h1>
      <p>If you can see this message, React is working and the white screen issue is resolved.</p>
      <p>Current time: {new Date().toLocaleString()}</p>
    </div>
  );
};
