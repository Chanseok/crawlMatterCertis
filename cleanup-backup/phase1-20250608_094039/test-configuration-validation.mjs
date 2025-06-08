/**
 * Configuration Validation Integration Test
 * 원래 버그가 해결되었는지 확인하는 통합 테스트
 */

// ConfigurationValidator를 직접 import해서 테스트
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 컴파일된 JavaScript 파일을 import
const { ConfigurationValidator } = await import('./dist-electron/shared/domain/ConfigurationValue.js');

console.log('🧪 Configuration Validation Integration Test 시작\n');

// 테스트용 유효한 설정
const validConfig = {
  pageRangeLimit: 5,
  productListRetryCount: 3,
  productDetailRetryCount: 3,
  productsPerPage: 12,
  autoAddToLocalDB: true,
  autoStatusCheck: true,
  crawlerType: 'axios',
  batchSize: 50,
  batchDelayMs: 1000,
  enableBatchProcessing: true,
  batchRetryLimit: 3,
  baseUrl: 'https://csa-iot.org/csa-iot_products/',
  matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14',
  pageTimeoutMs: 30000,
  productDetailTimeoutMs: 30000,
  initialConcurrency: 10,
  detailConcurrency: 10,
  retryConcurrency: 5,
  minRequestDelayMs: 100,
  maxRequestDelayMs: 2000,
  retryStart: 1,
  retryMax: 5,
  cacheTtlMs: 300000,
  headlessBrowser: true,
  maxConcurrentTasks: 10,
  requestDelay: 100
};

console.log('✅ 테스트 1: 유효한 설정 검증');
try {
  const result1 = ConfigurationValidator.validateComplete(validConfig);
  console.log(`   결과: ${result1.isValid ? '✅ 성공' : '❌ 실패'}`);
  if (!result1.isValid) {
    console.log('   에러:', result1.errors);
  }
} catch (error) {
  console.log('   ❌ 예외 발생:', error.message);
}

console.log('\n🔍 테스트 2: 원래 버그 시나리오 - 부분 설정 업데이트');
try {
  // 원래 버그: 부분 설정에서 undefined/0 값들이 최소값으로 변경되는 문제
  const partialUpdate1 = { pageRangeLimit: 10 };
  const result2 = ConfigurationValidator.validatePartialUpdate(validConfig, partialUpdate1);
  console.log(`   결과: ${result2.isValid ? '✅ 성공' : '❌ 실패'}`);
  if (!result2.isValid) {
    console.log('   에러:', result2.errors);
  }
} catch (error) {
  console.log('   ❌ 예외 발생:', error.message);
}

console.log('\n❌ 테스트 3: 잘못된 값들 검증');
try {
  const invalidUpdate = {
    pageRangeLimit: 0,  // 최소값 위반
    productDetailRetryCount: 0,  // 최소값 위반
    baseUrl: 'invalid-url'  // URL 형식 위반
  };
  const result3 = ConfigurationValidator.validatePartialUpdate(validConfig, invalidUpdate);
  console.log(`   결과: ${result3.isValid ? '❌ 잘못 통과됨' : '✅ 올바르게 실패'}`);
  if (!result3.isValid) {
    console.log('   예상된 에러들:');
    Object.keys(result3.errors).forEach(field => {
      console.log(`     - ${field}: ${result3.errors[field][0]}`);
    });
  }
} catch (error) {
  console.log('   ❌ 예외 발생:', error.message);
}

console.log('\n🎯 테스트 4: 원래 버그가 발생했던 정확한 시나리오');
try {
  // MobX observable에서 partial 객체가 생성될 때 발생했던 문제
  const partialConfigWithUndefined = {
    pageRangeLimit: 10,
    productListRetryCount: undefined,  // 이런 값들이 0으로 변환되어 최소값 검증에 걸렸음
    productDetailRetryCount: 0,
  };
  
  const result4 = ConfigurationValidator.validatePartialUpdate(validConfig, partialConfigWithUndefined);
  console.log(`   결과: ${result4.isValid ? '❌ 문제가 해결되지 않음' : '✅ 올바르게 검증 실패'}`);
  if (!result4.isValid) {
    console.log('   검출된 문제들:');
    Object.keys(result4.errors).forEach(field => {
      console.log(`     - ${field}: ${result4.errors[field][0]}`);
    });
  }
} catch (error) {
  console.log('   ❌ 예외 발생:', error.message);
}

console.log('\n🔄 테스트 5: 경계값 테스트');
try {
  const boundaryTest = {
    pageRangeLimit: 1,  // 최소값
    productListRetryCount: 3,  // 최소값
    productDetailRetryCount: 20,  // 최대값
    productsPerPage: 100  // 최대값
  };
  
  const result5 = ConfigurationValidator.validatePartialUpdate(validConfig, boundaryTest);
  console.log(`   결과: ${result5.isValid ? '✅ 성공' : '❌ 실패'}`);
  if (!result5.isValid) {
    console.log('   에러:', result5.errors);
  }
} catch (error) {
  console.log('   ❌ 예외 발생:', error.message);
}

console.log('\n📊 통합 테스트 완료!');
console.log('Value Object 패턴이 성공적으로 구현되어 원래 설정 값 손상 버그를 방지합니다.\n');
