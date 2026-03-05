const path = require('path');
const fs = require('fs');

// 사진 업로드 모듈
async function uploadImage(page, frame, imagePath = null) {
  try {
    console.log("사진을 업로드합니다...");
    
    // 이미지 경로 설정
    if (!imagePath) {
      imagePath = path.join(__dirname, '..', '1.png');
    }
    
    // 파일이 존재하는지 확인
    if (!fs.existsSync(imagePath)) {
      console.error(`이미지 파일을 찾을 수 없습니다: ${imagePath}`);
      return;
    }
    
    // waitForFileChooser와 버튼 클릭을 동시에 처리
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser(),
      frame.click('.se-image-toolbar-button')
    ]);
    
    // 파일 선택
    await fileChooser.accept([imagePath]);
    console.log(`${path.basename(imagePath)} 파일을 업로드했습니다.`);
    
    // 업로드 완료 대기
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error("사진 업로드 중 오류:", error.message);
  }
}

module.exports = { uploadImage };