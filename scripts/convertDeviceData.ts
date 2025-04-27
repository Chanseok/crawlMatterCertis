/**
 * 데이터 변환 스크립트 
 * 
 * data-for-dev 폴더에 있는 devices_pageId로 시작하는 JSON 파일들을 읽어서
 * 각 object별로 다음과 같은 변환 작업을 수행합니다:
 * 1. pageId는 값을 1만큼 감소
 * 2. indexInPage의 값은 -11을 한 후 절대값을 취함
 * 
 * 변환된 데이터는 pageId와 indexInPage를 기준으로 오름차순 정렬하여
 * devices_cov_ 접두어를 붙여 /data-for-dev/converted/ 폴더에 저장합니다.
 */

import fs from 'fs';
import path from 'path';

// 소스 및 대상 디렉토리 설정
const sourceDir = path.resolve('./data-for-dev');
const targetDir = path.resolve('./data-for-dev/converted');

// 변환된 대상 디렉토리가 없으면 생성
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`대상 디렉토리 생성됨: ${targetDir}`);
}

// devices_pageId로 시작하는 모든 JSON 파일 찾기
const deviceFiles = fs.readdirSync(sourceDir)
  .filter(file => file.startsWith('devices_pageId') && file.endsWith('.json'))
  .map(file => path.join(sourceDir, file));

console.log(`변환할 파일 ${deviceFiles.length}개를 찾았습니다.`);

// 데이터 변환 및 처리 함수
function processDeviceFile(filePath: string): void {
  try {
    const fileName = path.basename(filePath);
    const targetFileName = fileName.replace('devices_pageId', 'devices_cov');
    const targetFilePath = path.join(targetDir, targetFileName);
    
    console.log(`처리 중: ${fileName}`);
    
    // 파일 읽기
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const devices = JSON.parse(fileContent);
    
    if (!Array.isArray(devices)) {
      console.error(`오류: ${fileName}은 배열 형식이 아닙니다.`);
      return;
    }
    
    // 데이터 변환
    const transformedDevices = devices.map(device => ({
      ...device,
      pageId: device.pageId - 1, // pageId 감소
      indexInPage: Math.abs(device.indexInPage - 11) // indexInPage 변환
    }));
    
    // 정렬: 1차 - pageId, 2차 - indexInPage
    const sortedDevices = transformedDevices.sort((a, b) => {
      if (a.pageId !== b.pageId) {
        return a.pageId - b.pageId;
      }
      return a.indexInPage - b.indexInPage;
    });
    
    // 변환된 데이터 저장
    fs.writeFileSync(targetFilePath, JSON.stringify(sortedDevices, null, 2));
    console.log(`변환 완료: ${targetFilePath}`);
    
  } catch (error) {
    console.error(`파일 처리 중 오류 발생: ${filePath}`);
    console.error(error);
  }
}

// 모든 파일 처리
function processAllFiles(): void {
  try {
    for (const filePath of deviceFiles) {
      processDeviceFile(filePath);
    }
    console.log('모든 파일 변환 완료!');
  } catch (error) {
    console.error('데이터 변환 중 오류 발생:');
    console.error(error);
  }
}

// 메인 처리
processAllFiles();