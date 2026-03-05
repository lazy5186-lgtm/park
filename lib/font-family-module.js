// 글꼴 변경 모듈
async function changeFontFamily(page, frame, fontName = 'random') {
  try {
    // 글꼴 목록
    const fontFamilies = [
      '기본서체',
      '나눔고딕',
      '나눔명조',
      '나눔바른고딕',
      '나눔스퀘어',
      '마루부리',
      '다시시작해',
      '바른히피',
      '우리딸손글씨'
    ];
    
    // 랜덤 선택
    if (fontName === 'random') {
      fontName = fontFamilies[Math.floor(Math.random() * fontFamilies.length)];
    }
    
    console.log(`글꼴을 '${fontName}'(으)로 변경합니다...`);
    
    // 글꼴 선택기 매핑
    const fontSelectors = {
      '기본서체': '.se-toolbar-option-font-family-system-button',
      '나눔고딕': '.se-toolbar-option-font-family-nanumgothic-button',
      '나눔명조': '.se-toolbar-option-font-family-nanummyeongjo-button',
      '나눔바른고딕': '.se-toolbar-option-font-family-nanumbarungothic-button',
      '나눔스퀘어': '.se-toolbar-option-font-family-nanumsquare-button',
      '마루부리': '.se-toolbar-option-font-family-nanummaruburi-button',
      '다시시작해': '.se-toolbar-option-font-family-nanumdasisijaghae-button',
      '바른히피': '.se-toolbar-option-font-family-nanumbareunhipi-button',
      '우리딸손글씨': '.se-toolbar-option-font-family-nanumuriddalsongeulssi-button'
    };
    
    // 유효한 글꼴인지 확인
    if (!fontSelectors[fontName]) {
      console.log(`유효하지 않은 글꼴입니다. '나눔고딕'을 사용합니다.`);
      fontName = '나눔고딕';
    }
    
    // 글꼴 버튼 클릭
    await frame.click('.se-font-family-toolbar-button');
    console.log("글꼴 드롭다운을 열었습니다.");
    
    // 드롭다운이 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 선택할 글꼴 셀렉터
    const fontSelector = fontSelectors[fontName];
    
    // 드롭다운 옵션 찾기
    let optionButton = await frame.$(fontSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!optionButton) {
      optionButton = await page.$(fontSelector);
      if (optionButton) {
        console.log("페이지 레벨에서 글꼴 옵션을 찾았습니다.");
        await page.click(fontSelector);
      } else {
        console.error("글꼴 옵션을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(fontSelector);
    }
    
    console.log(`글꼴이 '${fontName}'(으)로 변경되었습니다.`);
    
    // 글꼴 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("글꼴 변경 중 오류 발생:", error.message);
  }
}

module.exports = { changeFontFamily };