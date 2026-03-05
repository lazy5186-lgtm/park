const fs = require('fs');
const path = require('path');

/**
 * 랜덤 블로그 ID 생성 함수
 * @returns {string} 영어단어 + 랜덤숫자 조합
 */
function generateRandomBlogId() {
    try {
        const wordsFilePath = path.join(__dirname, 'blogIdList.txt');
        const wordsContent = fs.readFileSync(wordsFilePath, 'utf-8');
        const words = wordsContent.split('\n').filter(word => word.trim().length > 0);
        const randomWord = words[Math.floor(Math.random() * words.length)].trim();
        const digitCount = Math.random() < 0.5 ? 4 : 5;
        const randomNumber = Math.floor(Math.random() * Math.pow(10, digitCount)).toString().padStart(digitCount, '0');
        return randomWord + randomNumber;
    } catch (error) {
        return 'myblog' + Math.floor(Math.random() * 10000);
    }
}

/**
 * 블로그 생성 모달에서 ID 입력 및 검증
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Promise<boolean>} 성공 여부
 */
async function createBlogWithRandomId(page) {
    try {
        console.log('🔧 블로그 ID 자동 생성 시작...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const maxAttempts = 5;
        let attempt = 0;

        while (attempt < maxAttempts) {
            attempt++;
            const blogId = generateRandomBlogId();
            console.log(`📝 [${attempt}/${maxAttempts}] 블로그 ID 시도: ${blogId}`);

            await page.waitForSelector('#domainInput', { visible: true, timeout: 10000 });
            await page.focus('#domainInput');
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            await new Promise(resolve => setTimeout(resolve, 300));

            for (let i = 0; i < blogId.length; i++) {
                await page.keyboard.type(blogId[i]);
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            const messageResult = await checkBlogIdValidation(page);

            if (messageResult.isValid) {
                console.log(`✅ "${blogId}" 사용 가능`);
                const submitBtn = await page.$('#domainRegisterBtn');
                if (submitBtn) {
                    const isEnabled = await page.$eval('#domainRegisterBtn', btn => !btn.disabled);
                    if (isEnabled) {
                        await submitBtn.click();
                        return await handleFinalConfirmation(page);
                    }
                }
            } else if (messageResult.hasRecommendation) {
                console.log(`💡 추천 ID 사용: ${messageResult.recommendedId}`);
                const recommendClicked = await page.evaluate(() => {
                    const btn = document.querySelector('.recommend_blogid .btn._recommendIdClass');
                    if (btn) { btn.click(); return true; }
                    return false;
                });

                if (recommendClicked) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const submitBtn = await page.$('#domainRegisterBtn');
                    if (submitBtn) {
                        const isEnabled = await page.$eval('#domainRegisterBtn', btn => !btn.disabled);
                        if (isEnabled) {
                            await submitBtn.click();
                            return await handleFinalConfirmation(page);
                        }
                    }
                }
            } else {
                console.log(`❌ "${blogId}" 사용 불가, 재시도...`);
            }
        }

        console.log(`❌ ${maxAttempts}번 시도 실패`);
        return false;
    } catch (error) {
        console.error('블로그 생성 오류:', error.message);
        return false;
    }
}

/**
 * 블로그 ID 검증 결과 확인
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Promise<Object>} 검증 결과
 */
async function checkBlogIdValidation(page) {
    try {
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const messageElement = await page.$('#domainMessage');
                const message = messageElement ? await page.$eval('#domainMessage', el => el.textContent.trim()) : '';
                const messageWrapElement = await page.$('#blogidMessageWrap');

                if (messageWrapElement) {
                    const className = await page.$eval('#blogidMessageWrap', el => el.className);

                    if (className.includes('success')) {
                        return { isValid: true, hasRecommendation: false, recommendedId: '', message };
                    } else if (className.includes('error')) {
                        const recommendElement = await page.$('.recommend_blogid .btn._recommendIdClass');
                        let recommendedId = '';
                        if (recommendElement) {
                            recommendedId = await page.$eval('.recommend_blogid .btn._recommendIdClass', el => el.textContent.trim());
                        }
                        return { isValid: false, hasRecommendation: !!recommendedId, recommendedId, message };
                    }
                }

                if (!message.includes('사용할 수 있어요') && !message.includes('사용할 수 없어요')) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
        }

        return { isValid: false, hasRecommendation: false, recommendedId: '', message: '타임아웃' };
    } catch (error) {
        return { isValid: false, hasRecommendation: false, recommendedId: '', message: '검증 실패' };
    }
}

/**
 * 최종 확인 모달 처리
 * @param {Object} page - Puppeteer 페이지 객체
 * @returns {Promise<boolean>} 성공 여부
 */
async function handleFinalConfirmation(page) {
    try {
        for (let i = 0; i < 20; i++) {
            try {
                const confirmModal = await page.$('.SetBlogIdAlert_content');
                const confirmBlogId = await page.$('#confirmDomainId');
                const confirmSubmitBtn = await page.$('#confirmSubmitBtn');

                if (confirmModal && confirmBlogId && confirmSubmitBtn) {
                    const finalBlogId = await page.$eval('#confirmDomainId', el => el.textContent.trim());
                    console.log(`🎉 블로그 생성 완료: ${finalBlogId}`);
                    await confirmSubmitBtn.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return true;
                }
            } catch (e) {}
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('❌ 최종 확인 모달 없음');
        return false;
    } catch (error) {
        console.error('최종 확인 오류:', error.message);
        return false;
    }
}

module.exports = {
    generateRandomBlogId,
    createBlogWithRandomId,
    checkBlogIdValidation,
    handleFinalConfirmation
};
