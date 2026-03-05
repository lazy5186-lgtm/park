// 스티커 모듈
async function addSticker(page, frame) {
  try {
    console.log("스티커를 추가합니다...");
    
    // 스티커 버튼 클릭
    await frame.click('.se-sticker-toolbar-button');
    await new Promise((resolve) => setTimeout(resolve, 3000)); // 패널이 완전히 로드될 때까지 대기
    
    console.log("스티커 패널이 열렸습니다.");
    
    // 스티커 사이드바가 제대로 열렸는지 확인
    const sidebar = await page.$('.se-sidebar-container-sticker');
    if (sidebar) {
      console.log("스티커 사이드바를 찾았습니다.");
    }
    
    // 스티커 탭 목록 가져오기 - 더 단순한 선택자부터 시작
    let tabButtons = await page.$$('.se-tab-item button.se-tab-button');
    console.log(`기본 선택자로 찾은 탭 버튼: ${tabButtons.length}개`);
    
    if (tabButtons.length === 0) {
      // .se-tab-item 하위의 모든 버튼
      tabButtons = await page.$$('.se-tab-item button');
      console.log(`se-tab-item 하위 버튼: ${tabButtons.length}개`);
    }
    
    if (tabButtons.length === 0) {
      // 더 넓은 범위로 검색
      tabButtons = await page.$$('button.se-tab-button');
      console.log(`전체 페이지에서 se-tab-button: ${tabButtons.length}개`);
    }
    
    // page에서 못 찾으면 iframe에서 찾기
    if (tabButtons.length === 0) {
      console.log("page에서 탭을 못 찾아서 iframe에서 찾습니다...");
      tabButtons = await frame.$$('.se-tab-item button.se-tab-button');
      console.log(`iframe에서 찾은 탭 버튼: ${tabButtons.length}개`);
      
      if (tabButtons.length === 0) {
        tabButtons = await frame.$$('.se-tab-item button');
        console.log(`iframe se-tab-item 하위 버튼: ${tabButtons.length}개`);
      }
    }
    
    // 디버깅: 현재 페이지의 스티커 관련 요소들 확인
    if (tabButtons.length === 0) {
      console.log("디버깅: 스티커 관련 요소들을 찾습니다...");
      
      // 스티커 패널 관련 요소 존재 여부 확인
      const panelTab = await page.$('.se-panel-tab');
      const panelTabList = await page.$('.se-panel-tab-list');
      const tabItems = await page.$$('.se-tab-item');
      
      console.log(`패널 탭 존재: ${panelTab ? '예' : '아니오'}`);
      console.log(`패널 탭 리스트 존재: ${panelTabList ? '예' : '아니오'}`);
      console.log(`탭 아이템 개수: ${tabItems.length}`);
      
      // 현재 보이는 모든 버튼의 클래스 확인
      const allButtons = await page.$$('button');
      let stickerButtons = 0;
      for (const btn of allButtons) {
        const className = await page.evaluate(el => el.className, btn);
        if (className && className.includes('tab')) {
          stickerButtons++;
        }
      }
      console.log(`'tab'을 포함한 버튼 개수: ${stickerButtons}`);
    }
    
    console.log(`찾은 탭 버튼 개수: ${tabButtons.length}`);
    
    if (tabButtons.length > 2) {
      // 마지막 2개 (설정, 마켓) 제외하고 랜덤 선택
      const validTabCount = tabButtons.length - 2;
      const randomTabIndex = Math.floor(Math.random() * validTabCount);
      
      console.log(`총 ${validTabCount}개의 탭 중 ${randomTabIndex + 1}번째 탭을 선택합니다.`);
      
      // 선택한 탭 클릭
      await tabButtons[randomTabIndex].click();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // 탭 정보 출력
      let tabName = '';
      try {
        tabName = await tabButtons[randomTabIndex].$eval('.se-blind', el => el.textContent.trim());
      } catch (e) {
        // 히스토리 탭이나 특수 탭의 경우 이름이 없을 수 있음
        if (randomTabIndex === 0) {
          tabName = '히스토리';
        } else {
          tabName = `탭 ${randomTabIndex + 1}`;
        }
      }
      console.log(`선택된 탭: ${tabName}`);
      
      // 스티커 목록이 로드될 때까지 대기 (se-is-on 클래스가 추가될 때까지)
      console.log("스티커 목록이 로드되기를 기다립니다...");
      try {
        // 활성화된 스티커 목록 대기
        await frame.waitForSelector('.se-sidebar-list.se-is-on', { timeout: 5000 });
        console.log("활성화된 스티커 목록을 발견했습니다.");
      } catch (waitError) {
        console.log("활성화된 목록을 기다리는 중 타임아웃. 계속 진행합니다.");
      }
      
      // 추가 대기 시간
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // 선택된 탭의 스티커들 찾기
      let stickerItems = [];
      
      // iframe에서 스티커 찾기 - 활성화된 목록에서 직접 찾기
      console.log("iframe에서 활성화된 목록의 스티커를 찾습니다...");
      
      // 먼저 활성화된 목록(se-is-on)에서 스티커 찾기
      const activeList = await frame.$('.se-sidebar-list.se-is-on');
      if (activeList) {
        console.log("활성화된 목록을 찾았습니다. 그 안의 스티커를 찾습니다...");
        
        // 활성화된 목록 내부의 스티커들 찾기
        stickerItems = await activeList.$$('.se-sidebar-element-sticker-gif');
        console.log(`활성화된 목록에서 GIF 스티커 ${stickerItems.length}개 찾음`);
        
        if (stickerItems.length === 0) {
          stickerItems = await activeList.$$('.se-sidebar-element-sticker');
          console.log(`활성화된 목록에서 일반 스티커 ${stickerItems.length}개 찾음`);
        }
        
        if (stickerItems.length === 0) {
          stickerItems = await activeList.$$('button');
          console.log(`활성화된 목록에서 버튼 ${stickerItems.length}개 찾음`);
        }
      }
      
      // 활성화된 목록에서 못 찾으면 전체 iframe에서 찾기
      if (stickerItems.length === 0) {
        console.log("활성화된 목록에서 못 찾아서 전체 iframe에서 찾습니다...");
        stickerItems = await frame.$$('.se-sidebar-element-sticker-gif');
        console.log(`iframe에서 GIF 스티커 ${stickerItems.length}개 찾음`);
        
        if (stickerItems.length === 0) {
          stickerItems = await frame.$$('.se-sidebar-element-sticker');
          console.log(`iframe에서 일반 스티커 ${stickerItems.length}개 찾음`);
        }
      }
      
      // iframe에서 못 찾으면 page에서 찾기
      if (stickerItems.length === 0) {
        console.log("iframe에서 못 찾아서 page에서 찾습니다...");
        
        // 현재 활성화된 스티커 목록 찾기
        const activeLists = await page.$$('.se-sidebar-list.se-is-on');
        console.log(`활성화된 목록 ${activeLists.length}개 찾음`);
        
        if (activeLists.length > 0) {
          // 활성화된 목록에서 스티커 찾기
          for (const list of activeLists) {
            const stickers = await list.$$('.se-sidebar-element');
            if (stickers.length > 0) {
              stickerItems = stickers;
              console.log(`활성화된 목록에서 ${stickers.length}개의 스티커를 찾았습니다.`);
              break;
            }
          }
        }
        
        // 못 찾으면 다양한 선택자로 시도
        if (stickerItems.length === 0) {
          console.log("활성화된 목록에서 못 찾아서 다른 선택자로 시도합니다...");
          
          // GIF 스티커 찾기
          stickerItems = await page.$$('.se-sidebar-element-sticker-gif');
          console.log(`page에서 GIF 스티커 ${stickerItems.length}개 찾음`);
          
          // 일반 스티커 찾기
          if (stickerItems.length === 0) {
            stickerItems = await page.$$('.se-sidebar-element-sticker');
            console.log(`page에서 일반 스티커 ${stickerItems.length}개 찾음`);
          }
          
          // 모든 스티커 버튼 찾기
          if (stickerItems.length === 0) {
            stickerItems = await page.$$('.se-sidebar-element');
            console.log(`page에서 sidebar 요소 ${stickerItems.length}개 찾음`);
          }
        }
      }
    
      if (stickerItems.length > 0) {
        // 랜덤으로 스티커 선택 (0부터 스티커 개수-1 사이의 랜덤 인덱스)
        const randomIndex = Math.floor(Math.random() * stickerItems.length);
        console.log(`총 ${stickerItems.length}개의 스티커 중 ${randomIndex + 1}번째 스티커를 선택합니다.`);
        
        // 선택한 스티커 클릭
        await stickerItems[randomIndex].click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        console.log("스티커 추가 완료");
      } else {
        console.error("스티커를 찾을 수 없습니다.");
      }
      
    } else {
      console.error("스티커 탭을 찾을 수 없습니다.");
    }
    
  } catch (error) {
    console.error("스티커 추가 중 오류:", error.message);
  }
}

module.exports = { addSticker };