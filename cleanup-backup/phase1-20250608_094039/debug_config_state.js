// Debug script to check configuration state
setTimeout(() => {
  console.log('=== Configuration Debug Info ===');
  
  // Check if global objects exist
  if (window.configurationViewModel) {
    console.log('ConfigurationViewModel found');
    console.log('Config keys:', Object.keys(window.configurationViewModel.config || {}));
    console.log('Config data:', window.configurationViewModel.config);
    console.log('Original config:', window.configurationViewModel.originalConfig);
    console.log('Session status:', window.configurationViewModel.getSessionStatus?.());
  } else {
    console.log('ConfigurationViewModel not found on window');
  }
  
  if (window.crawlingStore) {
    console.log('CrawlingStore found');
    console.log('Store config:', window.crawlingStore.config);
    console.log('Store debug info:', window.crawlingStore.getDebugInfo?.());
  } else {
    console.log('CrawlingStore not found on window');
  }
  
  // Check for other global state
  console.log('Available globals:', Object.keys(window).filter(k => k.includes('ViewModel') || k.includes('Store')));
}, 2000);
