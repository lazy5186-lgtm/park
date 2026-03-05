// 텍스트 서식 변경 모듈
async function changeTextFormat(page, frame, formatType = '소제목') {
  try {
    console.log(`텍스트 서식을 '${formatType}'(으)로 변경합니다...`);
    
    // 기존 드롭다운 방식 (fallback)
    // 텍스트 서식 버튼 클릭
    await frame.click('.se-text-format-toolbar-button');
    console.log("텍스트 서식 드롭다운을 열었습니다.");
    
    // 드롭다운이 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 서식 타입에 따른 셀렉터 선택
    let formatSelector;
    switch(formatType) {
      case '본문':
        formatSelector = '.se-toolbar-option-text-format-text-button';
        break;
      case '소제목':
        formatSelector = '.se-toolbar-option-text-format-sectionTitle-button';
        break;
      case '인용구':
        formatSelector = '.se-toolbar-option-text-format-quotation-button';
        break;
      case '인용구4':
        // 드롭다운에서도 인용구4 선택 시도
        formatSelector = '.se-toolbar-option-text-format-quotation_underline-button';
        break;
      default:
        console.log(`유효하지 않은 서식 타입입니다. '소제목'을 사용합니다.`);
        formatSelector = '.se-toolbar-option-text-format-sectionTitle-button';
    }
    
    // 드롭다운 옵션 찾기
    let optionButton = await frame.$(formatSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!optionButton) {
      optionButton = await page.$(formatSelector);
      if (optionButton) {
        console.log("페이지 레벨에서 서식 옵션을 찾았습니다.");
        await page.click(formatSelector);
      } else {
        console.error("서식 옵션을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(formatSelector);
    }
    
    console.log(`텍스트 서식이 '${formatType}'(으)로 변경되었습니다.`);
    
    // 서식 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("텍스트 서식 변경 중 오류 발생:", error.message);
  }
}

module.exports = { changeTextFormat };