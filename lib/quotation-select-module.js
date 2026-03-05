// 인용구 선택 모듈 (텍스트 입력 없이 인용구만 선택)
async function selectQuotationType(page, frame, quotationType = 'c') {
  try {
    console.log(`인용구 타입 '${quotationType}'를 선택합니다...`);
    
    // 인용구 버튼 클릭 (드롭다운 열기)
    await frame.click('.se-insert-quotation-default-toolbar-button');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("인용구 드롭다운이 열렸습니다.");
    
    // 인용구 타입에 따른 버튼 선택
    let quotationButton;
    const dataValue = {
      'a': 'default',
      'b': 'simple', 
      'c': 'line',
      'd': 'solid',
      'e': 'box'
    };
    
    const selectedValue = dataValue[quotationType] || 'line';
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
      console.log("인용구 선택 완료");
    } else {
      console.error(`인용구 타입 '${quotationType}'을 찾을 수 없습니다.`);
    }
    
  } catch (error) {
    console.error("인용구 선택 중 오류:", error.message);
  }
}

module.exports = { selectQuotationType };