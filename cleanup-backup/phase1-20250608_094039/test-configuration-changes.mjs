#!/usr/bin/env node

/**
 * Configuration Changes Test
 * 설정 변경 감지 및 저장 버튼 활성화 테스트
 */

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

console.log('🧪 Configuration Changes Test');
console.log('==============================');

let browser, page;

async function setupBrowser() {
  browser = await puppeteer.launch({
    headless: false, // UI를 보기 위해 headless 모드 비활성화
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  // 콘솔 로그 캡처
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('MobX')) {
      console.log('❌ MobX Error:', msg.text());
    }
  });
  
  await page.goto('http://localhost:5123', { waitUntil: 'networkidle0' });
}

async function testConfigurationChanges() {
  console.log('\n📝 Testing Configuration Changes...');
  
  try {
    // 설정 탭으로 이동
    await page.waitForSelector('[data-testid="tab-settings"], .tab[data-tab="settings"], button:contains("설정")', { timeout: 5000 });
    
    // 설정 탭 클릭 시도 (여러 선택자 시도)
    const settingsTabClicked = await page.evaluate(() => {
      // 여러 방법으로 설정 탭 찾기
      const selectors = [
        '[data-testid="tab-settings"]',
        '.tab[data-tab="settings"]',
        'button[data-tab="settings"]',
        '.tab-button[data-tab="settings"]',
        '.tab-settings'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          element.click();
          return true;
        }
      }
      
      // 텍스트로 찾기
      const buttons = Array.from(document.querySelectorAll('button, .tab'));
      for (const button of buttons) {
        if (button.textContent?.includes('설정')) {
          button.click();
          return true;
        }
      }
      
      return false;
    });
    
    if (settingsTabClicked) {
      console.log('✅ Settings tab clicked');
    } else {
      console.log('⚠️ Could not find settings tab, continuing with current view');
    }
    
    await page.waitForTimeout(1000);
    
    // 페이지 범위 제한 입력 필드 찾기
    const pageRangeInput = await page.waitForSelector('input[type="number"], input[name*="pageRange"], input[name*="limit"]', { timeout: 3000 });
    
    if (pageRangeInput) {
      console.log('✅ Found configuration input field');
      
      // 현재 값 가져오기
      const originalValue = await page.evaluate(input => input.value, pageRangeInput);
      console.log(`📊 Original value: ${originalValue}`);
      
      // 새 값으로 변경
      const newValue = parseInt(originalValue) + 1;
      await pageRangeInput.click();
      await page.keyboard.selectAll();
      await page.keyboard.type(newValue.toString());
      
      console.log(`📝 Changed value to: ${newValue}`);
      
      // 변경사항이 감지되는지 확인
      await page.waitForTimeout(500);
      
      // 저장 버튼 상태 확인
      const saveButtonState = await page.evaluate(() => {
        const saveButtons = Array.from(document.querySelectorAll('button'));
        const saveButton = saveButtons.find(btn => 
          btn.textContent?.includes('저장') || 
          btn.textContent?.includes('Save') ||
          btn.className?.includes('save')
        );
        
        if (saveButton) {
          return {
            found: true,
            enabled: !saveButton.disabled,
            text: saveButton.textContent,
            className: saveButton.className
          };
        }
        
        return { found: false };
      });
      
      if (saveButtonState.found) {
        console.log(`✅ Save button found: "${saveButtonState.text}"`);
        console.log(`📊 Save button enabled: ${saveButtonState.enabled}`);
        
        if (saveButtonState.enabled) {
          console.log('🎉 SUCCESS: Save button is enabled after configuration change!');
          return true;
        } else {
          console.log('❌ ISSUE: Save button is still disabled after configuration change');
          return false;
        }
      } else {
        console.log('⚠️ Save button not found');
        return false;
      }
      
    } else {
      console.log('❌ Could not find configuration input field');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error during configuration test:', error.message);
    return false;
  }
}

async function checkMobXErrors() {
  console.log('\n🔍 Checking for MobX errors...');
  
  const errors = await page.evaluate(() => {
    const errorElements = Array.from(document.querySelectorAll('[class*="error"], .error-message'));
    return errorElements.map(el => el.textContent).filter(text => text?.includes('MobX'));
  });
  
  if (errors.length === 0) {
    console.log('✅ No MobX errors found in UI');
    return true;
  } else {
    console.log('❌ MobX errors found:', errors);
    return false;
  }
}

async function runTests() {
  try {
    await setupBrowser();
    
    const results = {
      mobxErrors: await checkMobXErrors(),
      configurationChanges: await testConfigurationChanges()
    };
    
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`✅ No MobX Errors: ${results.mobxErrors}`);
    console.log(`✅ Configuration Changes Work: ${results.configurationChanges}`);
    
    const allTestsPassed = Object.values(results).every(result => result);
    
    if (allTestsPassed) {
      console.log('\n🎉 All tests passed! MobX issues have been resolved.');
    } else {
      console.log('\n⚠️ Some tests failed. Please check the issues above.');
    }
    
    // 브라우저를 열어둬서 수동 테스트 가능하도록 함
    console.log('\n🔍 Browser left open for manual inspection...');
    console.log('Press Ctrl+C to close when done');
    
    // 종료 신호 대기
    process.on('SIGINT', async () => {
      console.log('\n👋 Closing browser...');
      await browser.close();
      process.exit(0);
    });
    
    // 무한 대기
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

runTests();
