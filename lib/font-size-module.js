// 글자 크기 변경 모듈
// 기본값 복원: changeFontSize(page, frame, '15') - 15가 기본 크기
async function changeFontSize(page, frame, size = 'random') {
  try {
    // 글자 크기 목록
    const fontSizes = ['11', '13', '15', '16', '19', '24', '28', '30', '34', '38'];
    
    // 랜덤 선택
    if (size === 'random') {
      size = fontSizes[Math.floor(Math.random() * fontSizes.length)];
    }
    
    console.log(`글자 크기를 '${size}'로 변경합니다...`);
    
    // 글자 크기 선택기 매핑
    const sizeSelectors = {
      '11': '.se-toolbar-option-font-size-code-fs11-button',
      '13': '.se-toolbar-option-font-size-code-fs13-button',
      '15': '.se-toolbar-option-font-size-code-fs15-button',
      '16': '.se-toolbar-option-font-size-code-fs16-button',
      '19': '.se-toolbar-option-font-size-code-fs19-button',
      '24': '.se-toolbar-option-font-size-code-fs24-button',
      '28': '.se-toolbar-option-font-size-code-fs28-button',
      '30': '.se-toolbar-option-font-size-code-fs30-button',
      '34': '.se-toolbar-option-font-size-code-fs34-button',
      '38': '.se-toolbar-option-font-size-code-fs38-button'
    };
    
    // 유효한 크기인지 확인
    if (!sizeSelectors[size]) {
      console.log(`유효하지 않은 글자 크기입니다. '15'를 사용합니다.`);
      size = '15';
    }
    
    // 글자 크기 버튼 클릭
    await frame.click('.se-font-size-code-toolbar-button');
    console.log("글자 크기 드롭다운을 열었습니다.");
    
    // 드롭다운이 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 선택할 크기 셀렉터
    const sizeSelector = sizeSelectors[size];
    
    // 드롭다운 옵션 찾기
    let optionButton = await frame.$(sizeSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!optionButton) {
      optionButton = await page.$(sizeSelector);
      if (optionButton) {
        console.log("페이지 레벨에서 글자 크기 옵션을 찾았습니다.");
        await page.click(sizeSelector);
      } else {
        console.error("글자 크기 옵션을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(sizeSelector);
    }
    
    console.log(`글자 크기가 '${size}'로 변경되었습니다.`);
    
    // 글자 크기 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("글자 크기 변경 중 오류 발생:", error.message);
  }
}

module.exports = { changeFontSize };