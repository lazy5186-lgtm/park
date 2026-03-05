// 텍스트 스타일 변경 모듈 (굵게, 기울임, 밑줄, 취소선)

// 굵게 토글
async function toggleBold(page, frame) {
  try {
    console.log("굵게 스타일을 적용합니다...");
    
    // 굵게 버튼 클릭
    const boldButton = await frame.$('.se-bold-toolbar-button');
    if (!boldButton) {
      // page에서 찾기
      const pageBoldButton = await page.$('.se-bold-toolbar-button');
      if (pageBoldButton) {
        await page.click('.se-bold-toolbar-button');
      } else {
        console.error("굵게 버튼을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click('.se-bold-toolbar-button');
    }
    
    console.log("굵게 스타일이 적용되었습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error("굵게 스타일 적용 중 오류 발생:", error.message);
  }
}

// 기울임 토글
async function toggleItalic(page, frame) {
  try {
    console.log("기울임 스타일을 적용합니다...");
    
    // 기울임 버튼 클릭
    const italicButton = await frame.$('.se-italic-toolbar-button');
    if (!italicButton) {
      // page에서 찾기
      const pageItalicButton = await page.$('.se-italic-toolbar-button');
      if (pageItalicButton) {
        await page.click('.se-italic-toolbar-button');
      } else {
        console.error("기울임 버튼을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click('.se-italic-toolbar-button');
    }
    
    console.log("기울임 스타일이 적용되었습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error("기울임 스타일 적용 중 오류 발생:", error.message);
  }
}

// 밑줄 토글
async function toggleUnderline(page, frame) {
  try {
    console.log("밑줄 스타일을 적용합니다...");
    
    // 밑줄 버튼 클릭
    const underlineButton = await frame.$('.se-underline-toolbar-button');
    if (!underlineButton) {
      // page에서 찾기
      const pageUnderlineButton = await page.$('.se-underline-toolbar-button');
      if (pageUnderlineButton) {
        await page.click('.se-underline-toolbar-button');
      } else {
        console.error("밑줄 버튼을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click('.se-underline-toolbar-button');
    }
    
    console.log("밑줄 스타일이 적용되었습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error("밑줄 스타일 적용 중 오류 발생:", error.message);
  }
}

// 취소선 토글
async function toggleStrikethrough(page, frame) {
  try {
    console.log("취소선 스타일을 적용합니다...");
    
    // 취소선 버튼 클릭
    const strikethroughButton = await frame.$('.se-strikethrough-toolbar-button');
    if (!strikethroughButton) {
      // page에서 찾기
      const pageStrikethroughButton = await page.$('.se-strikethrough-toolbar-button');
      if (pageStrikethroughButton) {
        await page.click('.se-strikethrough-toolbar-button');
      } else {
        console.error("취소선 버튼을 찾을 수 없습니다.");
        return;
      }
    } else {
      await frame.click('.se-strikethrough-toolbar-button');
    }
    
    console.log("취소선 스타일이 적용되었습니다.");
    await new Promise((resolve) => setTimeout(resolve, 300));
    
  } catch (error) {
    console.error("취소선 스타일 적용 중 오류 발생:", error.message);
  }
}

module.exports = { toggleBold, toggleItalic, toggleUnderline, toggleStrikethrough };