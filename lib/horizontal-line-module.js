// 구분선 추가 모듈
async function addHorizontalLine(page, frame, lineType = 'a') {
  try {
    console.log(`구분선 ${lineType} 타입을 추가합니다...`);
    
    // 구분선 타입에 따른 셀렉터 매핑
    const lineTypeMap = {
      'a': '.se-toolbar-option-insert-horizontal-line-default-button',
      'b': '.se-toolbar-option-insert-horizontal-line-line1-button',
      'c': '.se-toolbar-option-insert-horizontal-line-line2-button',
      'd': '.se-toolbar-option-insert-horizontal-line-line3-button',
      'e': '.se-toolbar-option-insert-horizontal-line-line4-button',
      'f': '.se-toolbar-option-insert-horizontal-line-line5-button',
      'g': '.se-toolbar-option-insert-horizontal-line-line6-button',
      'h': '.se-toolbar-option-insert-horizontal-line-line7-button'
    };
    
    // 유효한 타입인지 확인
    if (!lineTypeMap[lineType]) {
      console.log(`유효하지 않은 구분선 타입입니다. 기본값 'a'를 사용합니다.`);
      lineType = 'a';
    }
    
    // 구분선 드롭다운 화살표 버튼 클릭 (옵션 메뉴 열기)
    await frame.click('.se-document-toolbar-select-option-button[data-name="horizontal-line"]');
    console.log("구분선 드롭다운 메뉴를 열었습니다.");
    
    // 드롭다운 메뉴가 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 드롭다운 옵션 컨테이너 찾기
    const dropdownOptions = await frame.$('.se-toolbar-option-insert-horizontal-line');
    
    if (!dropdownOptions) {
      // 페이지 레벨에서 찾기
      const pageDropdownOptions = await page.$('.se-toolbar-option-insert-horizontal-line');
      if (pageDropdownOptions) {
        console.log("페이지 레벨에서 드롭다운 옵션을 찾았습니다.");
        await page.click(lineTypeMap[lineType]);
      } else {
        console.error("드롭다운 옵션을 찾을 수 없습니다.");
        return;
      }
    } else {
      // 선택한 구분선 타입 클릭
      await frame.click(lineTypeMap[lineType]);
    }
    
    console.log(`구분선 타입 '${lineType}'를 선택했습니다.`);
    
    // 구분선이 삽입될 때까지 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    console.log("구분선이 성공적으로 추가되었습니다.");
    
  } catch (error) {
    console.error("구분선 추가 중 오류 발생:", error.message);
  }
}

module.exports = { addHorizontalLine };