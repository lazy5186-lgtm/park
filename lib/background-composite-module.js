const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// src/img 폴더에서 랜덤으로 배경 이미지 선택
function getRandomBackgroundImage() {
  const imgDir = path.join(__dirname, '..', 'src', 'img');
  
  if (!fs.existsSync(imgDir)) {
    console.log('src/img 폴더가 존재하지 않습니다.');
    return null;
  }
  
  // jpg, jpeg, png, webp 파일들만 필터링
  const imageFiles = fs.readdirSync(imgDir).filter(file => 
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );
  
  if (imageFiles.length === 0) {
    console.log('src/img 폴더에 이미지 파일이 없습니다.');
    return null;
  }
  
  // 랜덤으로 선택
  const randomIndex = Math.floor(Math.random() * imageFiles.length);
  const selectedImage = imageFiles[randomIndex];
  const imagePath = path.join(imgDir, selectedImage);
  
  console.log(`랜덤 배경 이미지 선택: ${selectedImage}`);
  return imagePath;
}

// 배경 이미지와 상품 이미지를 합성하는 모듈
async function compositeImageWithBackground(inputPath, outputPath, backgroundPath = null) {
  try {
    console.log(`배경 합성 중: ${path.basename(inputPath)}`);

    // 배경 이미지 경로 설정 (랜덤 선택 또는 지정된 경로)
    if (!backgroundPath) {
      backgroundPath = getRandomBackgroundImage();
      if (!backgroundPath) {
        // 랜덤 선택 실패 시 기본값 사용
        backgroundPath = path.join(__dirname, '..', 'src', 'img', '11.webp');
      }
    }

    // 파일 존재 여부 확인
    if (!fs.existsSync(inputPath)) {
      console.error(`상품 이미지를 찾을 수 없습니다: ${inputPath}`);
      return { success: false, error: 'Input image not found' };
    }

    if (!fs.existsSync(backgroundPath)) {
      console.error(`배경 이미지를 찾을 수 없습니다: ${backgroundPath}`);
      return { success: false, error: 'Background image not found' };
    }

    // 배경 이미지와 상품 이미지 로드
    // 배경 이미지에 30% 블러 효과 적용
    const background = sharp(backgroundPath).blur(5); // blur(5)로 30% 정도의 블러 효과
    const backgroundMetadata = await sharp(backgroundPath).metadata(); // 메타데이터는 원본에서 가져옴
    const productImage = sharp(inputPath);
    const productMetadata = await productImage.metadata();

    console.log(`배경 크기: ${backgroundMetadata.width}x${backgroundMetadata.height}`);
    console.log(`상품 이미지 크기: ${productMetadata.width}x${productMetadata.height}`);

    // 상품 이미지를 배경 이미지 크기에 맞게 조정
    // 배경의 90% 크기로 조정하여 자연스러운 액자 효과 연출
    const maxProductWidth = Math.floor(backgroundMetadata.width * 0.9);
    const maxProductHeight = Math.floor(backgroundMetadata.height * 0.9);

    // 비율을 유지하면서 크기 조정
    let newWidth, newHeight;
    const aspectRatio = productMetadata.width / productMetadata.height;

    if (productMetadata.width / maxProductWidth > productMetadata.height / maxProductHeight) {
      // 너비를 기준으로 조정
      newWidth = maxProductWidth;
      newHeight = Math.floor(maxProductWidth / aspectRatio);
    } else {
      // 높이를 기준으로 조정
      newHeight = maxProductHeight;
      newWidth = Math.floor(maxProductHeight * aspectRatio);
    }

    console.log(`조정된 상품 이미지 크기: ${newWidth}x${newHeight}`);

    // 상품 이미지 리사이즈 및 둥근 모서리 적용 (자연스러운 효과)
    const resizedProductImage = await productImage
      .resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .png()
      .toBuffer();

    // 중앙에 배치할 위치 계산
    const left = Math.floor((backgroundMetadata.width - newWidth) / 2);
    const top = Math.floor((backgroundMetadata.height - newHeight) / 2);

    console.log(`배치 위치: left=${left}, top=${top}`);

    // 배경 이미지 위에 상품 이미지 합성
    const compositeResult = await background
      .composite([{
        input: resizedProductImage,
        top: top,
        left: left,
        blend: 'over' // 자연스러운 합성
      }])
      .jpeg({ 
        quality: 90, 
        progressive: true 
      })
      .toBuffer();

    // 임시 파일명으로 먼저 저장
    const tempOutputPath = outputPath.replace(/(\.[^.]+)$/, '_temp$1');
    
    // 임시 파일로 저장
    await sharp(compositeResult).toFile(tempOutputPath);
    
    // 원본 파일 삭제 후 임시 파일을 원본 파일명으로 이동
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    await new Promise(resolve => setTimeout(resolve, 50)); // 파일 시스템 동기화 대기
    fs.renameSync(tempOutputPath, outputPath);

    console.log(`✅ 배경 합성 완료: ${path.basename(outputPath)}`);
    return { 
      success: true, 
      backgroundSize: `${backgroundMetadata.width}x${backgroundMetadata.height}`,
      productSize: `${newWidth}x${newHeight}`,
      position: `${left},${top}`
    };

  } catch (error) {
    console.error(`❌ 배경 합성 실패 (${path.basename(inputPath)}):`, error.message);
    
    // 임시 파일이 남아있다면 정리
    const tempOutputPath = outputPath.replace(/(\.[^.]+)$/, '_temp$1');
    if (fs.existsSync(tempOutputPath)) {
      try {
        fs.unlinkSync(tempOutputPath);
      } catch (cleanupError) {
        console.error(`임시 파일 정리 실패:`, cleanupError.message);
      }
    }
    
    // 실패 시 원본 이미지 그대로 유지
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
      try {
        fs.copyFileSync(inputPath, outputPath);
        console.log(`원본 이미지 복사: ${path.basename(inputPath)}`);
      } catch (copyError) {
        console.error(`원본 이미지 복사 실패:`, copyError.message);
      }
    }
    
    return { success: false, error: error.message };
  }
}

// 모든 이미지에 배경 합성 적용
async function compositeAllImagesWithBackground(imgsDir, backgroundPath = null) {
  console.log('\n🖼️  배경 합성 시작...');
  
  if (!fs.existsSync(imgsDir)) {
    console.log('imgs 폴더가 존재하지 않습니다.');
    return [];
  }

  // backgroundPath가 지정된 경우에만 존재 여부 확인
  if (backgroundPath && !fs.existsSync(backgroundPath)) {
    console.error(`지정된 배경 이미지를 찾을 수 없습니다: ${backgroundPath}`);
    return [];
  }

  const files = fs.readdirSync(imgsDir).filter(file => 
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  if (files.length === 0) {
    console.log('합성할 이미지가 없습니다.');
    return [];
  }

  console.log(`${files.length}개 이미지에 배경 합성 적용 중...`);
  if (backgroundPath) {
    console.log(`지정된 배경 이미지: ${path.basename(backgroundPath)}`);
  } else {
    console.log('각 이미지마다 랜덤 배경 이미지 사용');
  }

  const results = [];
  
  // 순차 처리로 안정성 확보
  for (const file of files) {
    const inputPath = path.join(imgsDir, file);
    const outputPath = path.join(imgsDir, file); // 같은 파일로 덮어쓰기
    
    // 각 이미지마다 새로운 랜덤 배경 선택 (backgroundPath가 지정되지 않은 경우)
    let currentBackgroundPath = backgroundPath;
    if (!backgroundPath) {
      currentBackgroundPath = getRandomBackgroundImage();
      if (!currentBackgroundPath) {
        // 랜덤 선택 실패 시 기본값 사용
        currentBackgroundPath = path.join(__dirname, '..', 'src', 'img', '11.webp');
      }
    }
    
    try {
      const result = await compositeImageWithBackground(inputPath, outputPath, currentBackgroundPath);
      results.push({ file, ...result });
    } catch (error) {
      console.error(`이미지 처리 실패 ${file}:`, error.message);
      results.push({ file, success: false, error: error.message });
    }
    
    // 이미지 간 짧은 대기 (시스템 안정성)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 결과 요약
  const successCount = results.filter(r => r.success).length;
  console.log(`\n🎨 배경 합성 완료: ${successCount}/${files.length}개 성공`);
  
  if (successCount > 0) {
    console.log('합성 결과:');
    results
      .filter(r => r.success)
      .forEach(r => console.log(`  - ${r.file}: ${r.backgroundSize} 배경에 ${r.productSize} 상품 이미지 합성`));
  }

  return results;
}

// 배경 합성 옵션 설정
const ENABLE_BACKGROUND_COMPOSITE = true; // true: 배경 합성 적용, false: 건너뛰기

module.exports = {
  compositeImageWithBackground,
  compositeAllImagesWithBackground,
  ENABLE_BACKGROUND_COMPOSITE
};