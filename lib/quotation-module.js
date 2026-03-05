// 인용구 모듈
async function addQuotation(page, frame, quotationType = 'c') {
  try {
    console.log(`인용구를 추가합니다... (타입: ${quotationType})`);
    
    // 인용구 버튼 클릭 (드롭다운 열기)
    await frame.click('.se-insert-quotation-default-toolbar-button');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("인용구 드롭다운이 열렸습니다.");
    
    // 인용구 타입에 따른 버튼 선택
    let quotationButton;
    const dataValue = {
      'a': 'default',                // 인용구 1
      'b': 'quotation_line',         // 인용구 2
      'c': 'quotation_bubble',       // 인용구 3  
      'd': 'quotation_underline',    // 인용구 4
      'e': 'quotation_postit',       // 인용구 5
      'f': 'quotation_corner'        // 인용구 6
    };
    
    const selectedValue = dataValue[quotationType] || 'quotation_line';
    const buttonSelector = `button[data-value="${selectedValue}"]`;
    
    // iframe에서 먼저 찾기
    quotationButton = await frame.$(buttonSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!quotationButton) {
      quotationButton = await page.$(buttonSelector);
      if (quotationButton) {
        console.log("페이지 레벨에서 인용구 버튼을 찾았습니다.");
      }
    }
    
    if (quotationButton) {
      console.log(`인용구 타입 '${quotationType}'를 선택합니다.`);
      await quotationButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      console.log("인용구 추가 완료");
    } else {
      console.error(`인용구 타입 '${quotationType}'을 찾을 수 없습니다.`);
    }
    
  } catch (error) {
    console.error("인용구 추가 중 오류:", error.message);
  }
}

module.exports = { addQuotation };