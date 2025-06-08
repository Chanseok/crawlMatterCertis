import { createRoot } from 'react-dom/client'
import './index.css'

// Simple test component to isolate the issue
function TestApp() {
  console.log('[TestApp] Rendering test component');
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0' }}>
      <h1>Test App</h1>
      <p>If you see this, React is working!</p>
    </div>
  );
}

console.log('[main-test] Starting test app');

try {
  const root = createRoot(document.getElementById('root')!);
  console.log('[main-test] Root created, rendering TestApp');
  root.render(<TestApp />);
  console.log('[main-test] TestApp rendered');
} catch (error) {
  console.error('[main-test] Error rendering TestApp:', error);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">
    <h1>React Error</h1>
    <pre>${error}</pre>
  </div>`;
}
