const fs = require('fs');
const path = require('path');
const { createBlogWithRandomId } = require('./blog-creation-module');
const { extractBlogId: extractBlogIdFromLogin } = require('./login-module');

// 블로그 상태 확인 및 처리 함수 (API 방식)
async function checkAndHandleBlogStatus(page) {
    try {
        const cookies = await page.cookies();
        const blogId = await extractBlogIdFromLogin(cookies);

        if (blogId) {
            return { success: true, blogId: blogId };
        }

        // 블로그 미개설 → 생성 시작
        console.log('🔧 블로그 미개설, 생성 시작...');
        await page.goto('https://section.blog.naver.com/BlogHome.naver', { waitUntil: 'networkidle0', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 블로그 아이디 만들기 버튼 클릭
        let createClicked = false;
        for (const selector of ['a[bg-nclick="bsu.profile"]', '.btn_area a.btn', '#domainRegisterBtn']) {
            try {
                const btn = await page.$(selector);
                if (btn) {
                    const text = await page.evaluate(el => el.textContent, btn);
                    if (text && text.includes('블로그 아이디 만들기')) {
                        await btn.click();
                        createClicked = true;
                        break;
                    }
                }
            } catch (e) {}
        }

        if (!createClicked) {
            createClicked = await page.evaluate(() => {
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    if (link.textContent.includes('블로그 아이디 만들기')) {
                        link.click();
                        return true;
                    }
                }
                return false;
            });
        }

        if (createClicked) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const creationSuccess = await createBlogWithRandomId(page);

            if (creationSuccess) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                const newCookies = await page.cookies();
                const newBlogId = await extractBlogIdFromLogin(newCookies);
                if (newBlogId) {
                    console.log(`✅ 새 블로그 ID: ${newBlogId}`);
                    return { success: true, blogId: newBlogId };
                }
                return 'creation_completed_need_manual_check';
            }
            return 'manual_creation_needed';
        }
        return false;
    } catch (error) {
        console.error('블로그 상태 확인 오류:', error.message);
        return { success: true, blogId: null };
    }
}

// 블로그 ID 추출 함수 (API 방식)
async function extractBlogId(page) {
    try {
        const cookies = await page.cookies();
        return await extractBlogIdFromLogin(cookies);
    } catch (error) {
        return null;
    }
}

// cookies JSON 파일에서 블로그 ID 업데이트
function updateBlogIdInCookies(userId, newBlogId, getCookieFilePathFunc) {
    try {
        const cookieFilePath = getCookieFilePathFunc(userId);
        if (fs.existsSync(cookieFilePath)) {
            const loginData = JSON.parse(fs.readFileSync(cookieFilePath, 'utf8'));
            if (loginData.blogId !== newBlogId) {
                loginData.blogId = newBlogId;
                fs.writeFileSync(cookieFilePath, JSON.stringify(loginData, null, 2));
                console.log(`✅ 블로그 ID 저장: ${newBlogId}`);
                return true;
            }
        }
        return false;
    } catch (error) {
        return false;
    }
}

module.exports = {
    checkAndHandleBlogStatus,
    extractBlogId,
    updateBlogIdInCookies
};
