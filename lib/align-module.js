// 정렬 변경 모듈
async function changeAlignment(page, frame, align = '가운데') {
  try {
    console.log(`텍스트를 '${align}' 정렬로 변경합니다...`);
    
    // 정렬 타입 매핑
    const alignTypes = {
      '왼쪽': '.se-toolbar-option-align-left-button',
      '가운데': '.se-toolbar-option-align-center-button',
      '오른쪽': '.se-toolbar-option-align-right-button',
      '양끝': '.se-toolbar-option-align-justify-button'
    };
    
    // 유효한 정렬인지 확인
    if (!alignTypes[align]) {
      console.log(`유효하지 않은 정렬 타입입니다. '왼쪽'을 사용합니다.`);
      align = '왼쪽';
    }
    
    // 정렬 버튼 클릭 (드롭다운 열기) - JSON에 따르면 정확한 셀렉터
    try {
      // 먼저 frame에서 찾기
      const alignButton = await frame.$('.se-align-left-toolbar-button');
      if (alignButton) {
        await frame.click('.se-align-left-toolbar-button');
      } else {
        // frame에서 못 찾으면 page에서 찾기
        await page.click('.se-align-left-toolbar-button');
      }
      console.log("정렬 드롭다운을 열었습니다.");
    } catch (clickError) {
      console.error("정렬 버튼을 찾을 수 없습니다:", clickError.message);
      // 대체 셀렉터 시도
      const alternativeSelectors = [
        '.se-toolbar-button[data-name="align-drop-down-with-justify"]',
        '.se-property-toolbar .se-toolbar-item-align',
        'button[aria-label*="정렬"]'
      ];
      
      for (const selector of alternativeSelectors) {
        try {
          const button = await frame.$(selector) || await page.$(selector);
          if (button) {
            await button.click();
            console.log(`대체 셀렉터로 정렬 드롭다운을 열었습니다: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // 드롭다운이 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 선택할 정렬 셀렉터
    const alignSelector = alignTypes[align];
    
    // 정렬 옵션 찾기
    let alignButton = await frame.$(alignSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!alignButton) {
      alignButton = await page.$(alignSelector);
      if (alignButton) {
        console.log("페이지 레벨에서 정렬 옵션을 찾았습니다.");
        await page.click(alignSelector);
      } else {
        console.error("정렬 옵션을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(alignSelector);
    }
    
    console.log(`정렬이 '${align}'(으)로 변경되었습니다.`);
    
    // 정렬 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("정렬 변경 중 오류 발생:", error.message);
  }
}

module.exports = { changeAlignment };