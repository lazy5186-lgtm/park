// 컬러 피커 모듈 (글자색, 배경색)

// 글자색 변경
// 기본값 복원: changeFontColor(page, frame, '없음') - 글자색 제거
async function changeFontColor(page, frame, color = 'random') {
  try {
    // 글자색 옵션
    const fontColors = {
      '없음': '',
      '검정': '#000000',
      '빨강': '#ff0010',
      '파랑': '#0078cb',
      '초록': '#00a84b',
      '노랑': '#ffd300',
      '보라': '#aa1f91',
      '핑크': '#ff65a8',
      '주황': '#ff9300',
      '회색': '#777777'
    };
    
    // 랜덤 선택
    if (color === 'random') {
      const colorKeys = Object.keys(fontColors);
      color = colorKeys[Math.floor(Math.random() * colorKeys.length)];
    }
    
    console.log(`글자색을 '${color}'(으)로 변경합니다...`);
    
    // 글자색 버튼 클릭
    await frame.click('.se-font-color-toolbar-button');
    console.log("글자색 팔레트를 열었습니다.");
    
    // 팔레트가 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 색상 선택
    const colorValue = fontColors[color];
    let colorSelector;
    
    if (color === '없음' || colorValue === '') {
      colorSelector = '.se-color-palette-no-color';
    } else {
      colorSelector = `.se-color-palette[data-color='${colorValue}']`;
    }
    
    // 색상 찾기
    let colorButton = await frame.$(colorSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!colorButton) {
      colorButton = await page.$(colorSelector);
      if (colorButton) {
        console.log("페이지 레벨에서 색상을 찾았습니다.");
        await page.click(colorSelector);
      } else {
        console.error("색상을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(colorSelector);
    }
    
    console.log(`글자색이 '${color}'(으)로 변경되었습니다.`);
    
    // 색상 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("글자색 변경 중 오류 발생:", error.message);
  }
}

// 배경색 변경
// 기본값 복원: changeBackgroundColor(page, frame, '없음') - 배경색 제거
async function changeBackgroundColor(page, frame, color = 'random') {
  try {
    // 배경색 옵션
    const bgColors = {
      '없음': '',
      '노란하이라이트': '#fff8b2',
      '연두하이라이트': '#e3fdc8',
      '민트하이라이트': '#bdfbfa',
      '하늘하이라이트': '#b0f1ff',
      '분홍하이라이트': '#fdd5f5',
      '회색배경': '#e2e2e2',
      '검정배경': '#000000',
      '흰색배경': '#ffffff'
    };
    
    // 랜덤 선택
    if (color === 'random') {
      const colorKeys = Object.keys(bgColors);
      color = colorKeys[Math.floor(Math.random() * colorKeys.length)];
    }
    
    console.log(`배경색을 '${color}'(으)로 변경합니다...`);
    
    // 배경색 버튼 클릭
    await frame.click('.se-background-color-toolbar-button');
    console.log("배경색 팔레트를 열었습니다.");
    
    // 팔레트가 열릴 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 색상 선택
    const colorValue = bgColors[color];
    let colorSelector;
    
    if (color === '없음' || colorValue === '') {
      colorSelector = '.se-color-palette-no-color';
    } else {
      colorSelector = `.se-color-palette[data-color='${colorValue}']`;
    }
    
    // 색상 찾기
    let colorButton = await frame.$(colorSelector);
    
    // iframe에서 못 찾으면 page에서 찾기
    if (!colorButton) {
      colorButton = await page.$(colorSelector);
      if (colorButton) {
        console.log("페이지 레벨에서 색상을 찾았습니다.");
        await page.click(colorSelector);
      } else {
        console.error("색상을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click(colorSelector);
    }
    
    console.log(`배경색이 '${color}'(으)로 변경되었습니다.`);
    
    // 색상 적용 후 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error("배경색 변경 중 오류 발생:", error.message);
  }
}

module.exports = { changeFontColor, changeBackgroundColor };