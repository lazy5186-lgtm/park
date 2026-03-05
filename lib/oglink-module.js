// 링크 추가 모듈
async function addOgLink(page, frame, url = 'ttj.kr') {
  try {
    console.log(`링크를 추가합니다... (URL: ${url})`);
    
    // 링크 버튼 클릭
    await frame.click('.se-oglink-toolbar-button');
    console.log("링크 팝업을 열었습니다.");
    
    // 팝업이 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 팝업 내의 입력 필드 찾기
    const inputSelector = '.se-popup-oglink-input';
    let inputField = await frame.$(inputSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!inputField) {
      inputField = await page.$(inputSelector);
      
      if (inputField) {
        console.log("페이지 레벨에서 링크 입력 필드를 찾았습니다.");
        
        // URL 입력
        await page.click(inputSelector);
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Delete'); // 삭제
        await page.type(inputSelector, url, { delay: 50 });
        
        // 검색 버튼 클릭
        await page.click('.se-popup-oglink-button');
        console.log("링크 검색 버튼을 클릭했습니다.");
        
        // 로딩이 완료될 때까지 대기 (프리뷰가 나타날 때까지)
        await new Promise((resolve) => setTimeout(resolve, 3000));
        
        // 확인 버튼이 활성화될 때까지 대기
        await page.waitForSelector('.se-popup-button-confirm:not([disabled])', { timeout: 5000 });
        
        // 확인 버튼 클릭
        await page.click('.se-popup-button-confirm');
        console.log("확인 버튼을 클릭했습니다.");
      } else {
        console.error("링크 입력 필드를 찾을 수 없습니다.");
        return;
      }
    } else {
      // iframe에서 찾은 경우
      console.log("iframe에서 링크 입력 필드를 찾았습니다.");
      
      // URL 입력
      await frame.click(inputSelector);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Delete');
      await frame.type(inputSelector, url, { delay: 50 });
      
      // 검색 버튼 클릭
      await frame.click('.se-popup-oglink-button');
      console.log("링크 검색 버튼을 클릭했습니다.");
      
      // 로딩이 완료될 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // 확인 버튼이 활성화될 때까지 대기
      await frame.waitForSelector('.se-popup-button-confirm:not([disabled])', { timeout: 5000 });
      
      // 확인 버튼 클릭
      await frame.click('.se-popup-button-confirm');
      console.log("확인 버튼을 클릭했습니다.");
    }
    
    // 링크가 삽입될 때까지 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    console.log("링크가 성공적으로 추가되었습니다.");
    
  } catch (error) {
    console.error("링크 추가 중 오류 발생:", error.message);
  }
}

module.exports = { addOgLink };