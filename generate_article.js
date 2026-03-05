const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 톡상담 아이콘 경로
const ICON_TALK_PATH = path.join(__dirname, 'icon_talk.png');

// 하단 오버레이 생성 함수 (톡상담 아이콘 + loandr_ + 문의번호, 1줄 레이아웃)
async function createBottomOverlay(width) {
    const barHeight = 70;

    // 아이콘 리사이즈
    const iconResized = await sharp(ICON_TALK_PATH).resize({ height: 36 }).toBuffer();
    const iconMeta = await sharp(iconResized).metadata();
    const iconW = iconMeta.width;

    // 한 줄 레이아웃: [아이콘] loandr_  |  문의 010-8442-4224
    const totalWidth = iconW + 10 + 160 + 30 + 320; // 아이콘 + 간격 + loandr_ + 구분 + 전화번호
    const startX = Math.floor((width - totalWidth) / 2);
    const textY = 45;

    // SVG: 반투명 배경 + 텍스트 1줄
    const overlaySvg = Buffer.from(`
    <svg width="${width}" height="${barHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${barHeight}" fill="rgba(0,0,0,0.65)" rx="0"/>
        <text x="${startX + iconW + 10}" y="${textY}" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#FFFFFF">${process.env.OVERLAY_KAKAO_ID || 'loandr_'}</text>
        <text x="${startX + iconW + 10 + 175}" y="${textY}" font-family="Arial, sans-serif" font-size="28" fill="#999999">|</text>
        <text x="${startX + iconW + 10 + 210}" y="${textY}" font-family="Arial, sans-serif" font-size="28" fill="#CCCCCC">문의  ${process.env.OVERLAY_PHONE || '010-8442-4224'}</text>
    </svg>`);

    // SVG를 이미지로 변환 후 아이콘 합성
    const overlayBuffer = await sharp(overlaySvg).png().toBuffer();
    const overlayWithIcon = await sharp(overlayBuffer)
        .composite([{
            input: iconResized,
            left: startX,
            top: Math.floor((barHeight - iconMeta.height) / 2)
        }])
        .png()
        .toBuffer();

    return overlayWithIcon;
}

// Gemini API Key
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAPHUs5zDSIjkEKOEjCaBqVf1gnlnB9TB0';
// Prompt file path
const PROMPT_FILE_PATH = path.join(__dirname, 'prompt', 'prompt', 'info_Prompt.md');

async function generateArticle() {
    try {
        // @google/genai SDK 동적 로드 (ESM 패키지)
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        console.log('프롬프트 파일을 읽는 중...');
        // 1. 프롬프트 파일 읽기
        const promptContent = fs.readFileSync(PROMPT_FILE_PATH, 'utf-8');

        // 2. 키워드 풀 추출 (정규식 사용)
        const keywordMatch = promptContent.match(/당신의 전문 분야 키워드:\s*(.+)/);
        if (!keywordMatch || !keywordMatch[1]) {
            throw new Error('프롬프트에서 키워드 풀을 찾을 수 없습니다.');
        }

        // 쉼표(,)를 기준으로 키워드 배열 생성
        const keywordPool = keywordMatch[1].split(',').map(k => k.trim()).filter(k => k.length > 0);

        // 3. 랜덤 키워드 선택 (사이클 관리)
        const usedKeywordsPath = path.join(__dirname, 'used_keywords.json');
        let usedKeywords = [];
        if (fs.existsSync(usedKeywordsPath)) {
            try {
                usedKeywords = JSON.parse(fs.readFileSync(usedKeywordsPath, 'utf-8'));
            } catch (e) {
                usedKeywords = [];
            }
        }

        // 아직 사용하지 않은 키워드 필터링
        let unusedKeywords = keywordPool.filter(k => !usedKeywords.includes(k));

        // 모든 키워드를 다 사용했다면 (1사이클 완료) 배열 비우기
        if (unusedKeywords.length === 0) {
            console.log('--- 1사이클(모든 키워드)을 모두 사용했습니다. 사이클을 초기화합니다. ---');
            usedKeywords = [];
            unusedKeywords = [...keywordPool];
        }

        // 사용 안 한 키워드 중 하나 선택
        const randomKeyword = unusedKeywords[Math.floor(Math.random() * unusedKeywords.length)];
        console.log(`선택된 랜덤 키워드: [${randomKeyword}] (남은 키워드 개수: ${unusedKeywords.length - 1})`);

        // 선택한 키워드를 사용 기록에 추가 후 저장
        usedKeywords.push(randomKeyword);
        fs.writeFileSync(usedKeywordsPath, JSON.stringify(usedKeywords, null, 2), 'utf-8');

        // 4. 텍스트 생성 (gemini-2.5-pro)
        const userPrompt = `
${promptContent}

=================================
요청 사항:
위 가이드라인에 맞춰서 오늘 작성할 핵심 키워드를 '${randomKeyword}'로 설정하여 정보글을 하나 작성해주세요.
주의사항 1: "알겠습니다", "승낙합니다", "承知いたしました" 등과 같은 어떠한 인사말이나 응답성 서론도 절대 넣지 마십시오. 오직 본문(제목부터 시작하는 마크다운 원문)만 정확히 출력하십시오.
주의사항 2: 본문 작성 시 <b>나 <strong> 같은 HTML 태그는 절대로 사용하지 마십시오. 글씨를 굵게 강조해야 할 때는 반드시 마크다운 기호(**텍스트**)만을 사용하십시오.
`;

        console.log('AI에게 글 작성을 요청하는 중입니다. (잠시만 기다려주세요)...\n');

        // 5. API 호출 (새 SDK 방식)
        const result = await ai.models.generateContent({
            model: process.env.TEXT_MODEL || "gemini-2.5-pro",
            contents: userPrompt
        });
        const responseText = result.text;

        // 재시도 포함 단일 이미지 생성 함수 (새 SDK 방식)
        async function generateSingleImage(ai, prompt, maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const imageResult = await ai.models.generateContent({
                        model: process.env.IMAGE_MODEL || "gemini-3.1-flash-image-preview",
                        contents: prompt,
                        config: {
                            imageConfig: {
                                aspectRatio: "16:9"
                            }
                        }
                    });
                    const parts = imageResult.candidates[0].content.parts;
                    const imagePart = parts.find(p => p.inlineData);
                    if (imagePart) return imagePart;
                    console.log(`  [시도 ${attempt}/${maxRetries}] 이미지를 반환하지 않았습니다.`);
                } catch (err) {
                    console.log(`  [시도 ${attempt}/${maxRetries}] 오류: ${err.message}`);
                    if (attempt < maxRetries) {
                        const waitSec = attempt * 5;
                        console.log(`  -> ${waitSec}초 후 재시도합니다...`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                    }
                }
            }
            return null;
        }

        // 6. 이미지 프롬프트 생성
        console.log('이미지 생성을 위한 전용 프롬프트를 분석 중입니다...');
        const IMG_PROMPT_FILE_PATH = path.join(__dirname, 'prompt', 'prompt', 'img_Prompt.md');
        let generatedImgPrompts = [];
        try {
            const imgPromptContent = fs.readFileSync(IMG_PROMPT_FILE_PATH, 'utf-8');
            const imgUserPrompt = `
${imgPromptContent}
- 블로그 주제: ${randomKeyword}

출력 규칙: 반드시 10개의 영문 프롬프트를 포함하는 순수한 JSON 배열 형식(["prompt1", "prompt2", ..., "prompt10"])으로만 출력하십시오. 다른 어떠한 텍스트, 설명, 마크다운 코드블록(\`\`\`)도 절대 포함하지 마십시오.
`;
            const imgReqResult = await ai.models.generateContent({
                model: process.env.TEXT_MODEL || "gemini-2.5-pro",
                contents: imgUserPrompt
            });
            let rawText = imgReqResult.text.trim();
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            generatedImgPrompts = JSON.parse(rawText);
        } catch (e) {
            console.error("이미지 프롬프트 JSON 분석 실패, 기본값 사용", e.message);
            generatedImgPrompts = [
                `Trustworthy and hopeful professional photography about ${randomKeyword}, blue and gold tone, realistic`,
                `Professional infographic style element representing ${randomKeyword}, clean and modern layout`,
                `Hopeful business conversation about ${randomKeyword}, smiling professionals, natural lighting`,
                `Close-up of financial documents and calculator related to ${randomKeyword}, warm office setting`,
                `Professional consultant explaining ${randomKeyword} concept, confident and approachable`,
                `Modern cityscape with apartment buildings representing ${randomKeyword}, golden hour lighting`,
                `Hands signing important financial contract for ${randomKeyword}, detailed close-up`,
                `Happy family in front of their home celebrating ${randomKeyword} success, warm atmosphere`,
                `Digital financial dashboard showing ${randomKeyword} data, clean UI design`,
                `Professional handshake sealing ${randomKeyword} deal, trust and partnership concept`
            ];
        }

        console.log('문맥에 맞는 이미지를 순차적으로 생성합니다 (gemini-3.1-flash-image-preview)...\n');

        // 파일 포맷팅: 랜덤 키워드 + 타임스탬프로 파일명 생성
        const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);

        // 정규식으로 '[📸 이곳에 ... 이미지 ... 삽입]' 매칭
        const placeholderRegex = /\[📸.*?이미지.*?\]/g;
        const matches = responseText.match(placeholderRegex) || [];
        console.log(`총 ${matches.length}개의 이미지 자리를 감지했습니다.\n`);

        // 순차적으로 이미지 생성 (한 장씩, 재시도 포함)
        const replacements = [];
        for (let i = 0; i < matches.length; i++) {
            const myIndex = i + 1;
            console.log(`[진행] ${myIndex}/${matches.length}번째 이미지 생성 중... (${matches[i]})`);
            let replacementStr = `[이미지 생성 실패]`;

            const promptIndex = Math.min(i, Math.max(0, generatedImgPrompts.length - 1));
            const imagePrompt = generatedImgPrompts[promptIndex];
            const finalImagePrompt = imagePrompt + `, The image MUST prominently feature the exact Korean text "${randomKeyword}" in beautiful, bold typography. DO NOT write any English. ONLY write the Korean text "${randomKeyword}".`;

            console.log(`  -> 프롬프트 적용 완료`);

            const imagePart = await generateSingleImage(ai, finalImagePrompt, 3);

            if (imagePart) {
                const imgFilename = `img_${randomKeyword}_${timestamp}_${myIndex}.png`;
                const imgPath = path.join(__dirname, imgFilename);
                const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

                // 생성된 이미지에 하단 오버레이(톡상담 아이콘 + loandr_ + 문의번호) 합성
                try {
                    const baseMeta = await sharp(rawBuffer).metadata();
                    const overlayWithIcon = await createBottomOverlay(baseMeta.width);

                    await sharp(rawBuffer)
                        .composite([{ input: overlayWithIcon, gravity: 'south' }])
                        .png()
                        .toFile(imgPath);
                    console.log(`[완료] ${myIndex}번째 이미지 저장 + 오버레이 합성 성공: ${imgFilename}`);
                } catch (overlayErr) {
                    fs.writeFileSync(imgPath, rawBuffer);
                    console.log(`[완료] ${myIndex}번째 이미지 저장 성공 (오버레이 실패): ${imgFilename}`);
                }
                replacementStr = `\n\n![${randomKeyword} 관련 이미지](./${imgFilename})\n\n`;
            } else {
                console.log(`[실패] ${myIndex}번째 이미지 - 최대 재시도 후에도 생성 실패`);
            }

            replacements.push(replacementStr);

            // 다음 이미지 생성 전 2초 대기 (API 부하 방지)
            if (i < matches.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // 플레이스홀더를 생성된 이미지로 순서대로 치환
        let finalOutputText = responseText;
        let repIdx = 0;
        finalOutputText = finalOutputText.replace(placeholderRegex, () => replacements[repIdx++]);

        console.log('\n============= [최종 완성 텍스트] =============\n');
        console.log(finalOutputText);
        console.log('\n==========================================\n');

        const outputFileName = `result_${randomKeyword}_${timestamp}.txt`;
        const outputPath = path.join(__dirname, outputFileName);

        // 파일에 저장
        fs.writeFileSync(outputPath, finalOutputText, 'utf-8');
        console.log(`작성된 글과 이미지가 '${outputFileName}' 파일로 함께 저장되었습니다.`);

        // ========================================
        // 3.post.js 연동: result.json + imgs/ 생성
        // ========================================
        console.log('\n📦 3.post.js 연동용 result.json 및 imgs/ 생성 중...');

        // 마크다운 텍스트를 섹션별로 파싱
        const lines = finalOutputText.split('\n').filter(l => l.trim() !== '');
        let h1 = '';
        let h3 = '';
        const sections = [];
        let currentSection = null;

        for (const line of lines) {
            const trimmed = line.trim();
            // 제목 (# )
            if (trimmed.startsWith('# ') && !h1) {
                h1 = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
                continue;
            }
            // 소제목 (### 또는 ##)
            if (trimmed.match(/^#{2,3}\s+/)) {
                if (currentSection) sections.push(currentSection);
                currentSection = {
                    h2: trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, ''),
                    p: ''
                };
                continue;
            }
            // 이미지 라인, 해시태그 라인 스킵
            if (trimmed.startsWith('![') || trimmed.startsWith('#') && !trimmed.startsWith('##')) {
                if (trimmed.startsWith('#') && !trimmed.startsWith('##')) continue;
                continue;
            }
            // 구분선 스킵
            if (trimmed === '---' || trimmed === '***') continue;
            // 본문 텍스트
            if (currentSection) {
                const cleanText = trimmed.replace(/\*\*/g, '');
                if (cleanText) {
                    currentSection.p += (currentSection.p ? '\n' : '') + cleanText;
                }
            } else if (!h3 && trimmed && !trimmed.startsWith('[')) {
                h3 = trimmed.replace(/\*\*/g, '');
            }
        }
        if (currentSection) sections.push(currentSection);

        // imgs 폴더 생성 및 이미지 복사
        const imgsDir = path.join(__dirname, 'imgs');
        if (!fs.existsSync(imgsDir)) fs.mkdirSync(imgsDir);
        // 기존 imgs 폴더 비우기
        fs.readdirSync(imgsDir).forEach(f => fs.unlinkSync(path.join(imgsDir, f)));

        // 생성된 이미지 파일들을 imgs/product_N.png로 복사
        const generatedImages = fs.readdirSync(__dirname)
            .filter(f => f.startsWith(`img_${randomKeyword}_${timestamp}_`) && f.endsWith('.png'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || 0);
                const numB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || 0);
                return numA - numB;
            });

        generatedImages.forEach((imgFile, idx) => {
            const src = path.join(__dirname, imgFile);
            const dest = path.join(imgsDir, `product_${idx + 1}.png`);
            fs.copyFileSync(src, dest);
            console.log(`  이미지 복사: ${imgFile} → imgs/product_${idx + 1}.png`);
        });

        // result.json 생성
        const resultJson = {
            gemini: {
                h1: h1,
                h3: h3,
                sections: sections
            },
            상품목록: [],
            선택된상품ID: null,
            선택된상품명: randomKeyword,
            키워드: randomKeyword
        };

        const resultJsonPath = path.join(__dirname, 'result.json');
        fs.writeFileSync(resultJsonPath, JSON.stringify(resultJson, null, 2), 'utf-8');
        console.log(`\n✅ result.json 생성 완료 (제목: ${h1}, 섹션 ${sections.length}개)`);
        console.log(`✅ imgs/ 폴더에 이미지 ${generatedImages.length}장 복사 완료`);
        console.log('✅ 이제 node 3.post.js 를 실행하면 네이버 블로그에 자동 포스팅됩니다.\n');

    } catch (error) {
        console.error('오류 발생:', error);
    }
}

generateArticle();
