const path = require('path');
const fs = require('fs');

// 동영상 업로드 모듈
async function uploadVideo(page, frame, videoPath = null, title = '테스트 동영상') {
  try {
    console.log("동영상을 업로드합니다...");
    
    // 동영상 버튼 클릭
    await frame.click('.se-video-toolbar-button');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // 동영상 업로드 모달에서 '동영상 추가' 버튼 클릭
    console.log("동영상 추가 버튼을 찾는 중...");
    
    // 동영상 추가 버튼을 iframe 내부에서 찾기
    let addVideoButton = await frame.$('.nvu_btn_append.nvu_local');
    
    // iframe에 없으면 page 레벨에서도 찾아보기
    if (!addVideoButton) {
      addVideoButton = await page.$('.nvu_btn_append.nvu_local');
    }
    
    if (addVideoButton) {
      console.log("동영상 추가 버튼을 찾았습니다.");
      
      // waitForFileChooser와 버튼 클릭을 동시에 처리
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser(),
        addVideoButton.click()
      ]);
      
      // 동영상 경로 설정
      if (!videoPath) {
        videoPath = path.join(__dirname, '..', '1.mp4');
      }
      
      if (!fs.existsSync(videoPath)) {
        console.error(`동영상 파일을 찾을 수 없습니다: ${videoPath}`);
        return;
      }
      
      console.log(`동영상 파일 경로: ${videoPath}`);
      
      // 파일 선택
      await fileChooser.accept([videoPath]);
      console.log("동영상 파일 선택 완료, 업로드 대기 중...");
      
      // 업로드 완료 상태 확인 (업로드 완료 텍스트가 나타날 때까지 대기)
      const maxWaitTime = 30000; // 최대 30초 대기
      const startTime = Date.now();
      let uploadCompleted = false;
      
      while (!uploadCompleted && (Date.now() - startTime < maxWaitTime)) {
        try {
          // iframe 내부에서 "업로드 완료" 텍스트 찾기
          const uploadStatus = await frame.$('.nvu_state');
          if (uploadStatus) {
            const statusText = await frame.evaluate(el => el.textContent, uploadStatus);
            if (statusText && statusText.includes('업로드 완료')) {
              uploadCompleted = true;
              console.log("동영상 업로드 완료 확인!");
              break;
            }
          }
        } catch (e) {
          // 요소를 찾지 못한 경우 무시
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초마다 확인
      }
      
      if (!uploadCompleted) {
        console.log("업로드 완료를 확인할 수 없지만 계속 진행합니다.");
      }
      
      // 제목 입력
      console.log(`동영상 제목을 입력합니다: ${title}`);
      const titleInput = await frame.$('#nvu_inp_box_title');
      if (titleInput) {
        await titleInput.click();
        await titleInput.type(title, { delay: 50 });
      }
      
      // 정보 입력
      console.log("동영상 정보를 입력합니다...");
      const descriptionInput = await frame.$('#nvu_inp_box_description');
      if (descriptionInput) {
        await descriptionInput.click();
        await descriptionInput.type(`${title} 소개 동영상입니다.`, { delay: 50 });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 완료 버튼 클릭
      console.log("완료 버튼을 클릭합니다...");
      
      // iframe 내부에서 완료 버튼 찾기
      const completeButton = await frame.$('.nvu_btn_submit.nvu_btn_type2');
      if (completeButton) {
        await completeButton.click();
        console.log("완료 버튼을 클릭했습니다.");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.error("완료 버튼을 찾을 수 없습니다.");
      }
      
    } else {
      console.error("동영상 추가 버튼을 찾을 수 없습니다.");
    }
    
  } catch (error) {
    console.error("동영상 업로드 중 오류:", error.message);
  }
}

module.exports = { uploadVideo };