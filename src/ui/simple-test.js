console.log('[simple-test] Starting simple test');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[simple-test] DOM Content Loaded');
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; background-color: #e8f5e8; border: 2px solid #4CAF50;">
        <h1 style="color: #2E7D32;">Simple Test Page</h1>
        <p>This is a basic JavaScript test without React</p>
        <p>Time: ${new Date().toLocaleTimeString()}</p>
      </div>
    `;
    console.log('[simple-test] Content set successfully');
  } else {
    console.error('[simple-test] Root element not found');
  }
});

console.log('[simple-test] Script loaded');
