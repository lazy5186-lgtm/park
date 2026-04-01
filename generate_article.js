const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 톡상담 아이콘 경로
const ICON_TALK_PATH = path.join(__dirname, 'icon_talk.png');

// ========================================
// AI 이미지 탐지 우회 처리 (Anti-Detection)
// ========================================
async function antiDetectProcess(inputBuffer) {
    const meta = await sharp(inputBuffer).metadata();
    const { width, height, channels } = meta;
    const ch = channels || 3;

    // --- 1단계: 가우시안 노이즈 주입 ---
    // 랜덤 노이즈 raw 버퍼 생성 (각 픽셀에 -8~+8 범위의 미세 노이즈)
    const pixelCount = width * height * ch;
    const noiseRaw = Buffer.alloc(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        // Box-Muller 변환으로 가우시안 분포 근사
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random();
        const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        // 표준편차 3, 평균 128로 오버레이용 노이즈 (128 = 중립)
        noiseRaw[i] = Math.max(0, Math.min(255, Math.round(128 + gaussian * 3)));
    }
    const noisePng = await sharp(noiseRaw, { raw: { width, height, channels: ch } })
        .png()
        .toBuffer();

    // soft-light 블렌딩 효과를 위해 낮은 opacity로 합성
    let processed = await sharp(inputBuffer)
        .composite([{ input: noisePng, blend: 'soft-light' }])
        .toBuffer();

    // --- 2단계: 미세 색상/밝기 변조 ---
    // 랜덤 미세 조정 (사람 눈에 감지 안됨)
    const brightnessShift = 0.97 + Math.random() * 0.06;  // 0.97~1.03
    const saturationShift = 0.96 + Math.random() * 0.08;  // 0.96~1.04
    const hueShift = Math.floor(Math.random() * 7) - 3;   // -3~+3도
    processed = await sharp(processed)
        .modulate({
            brightness: brightnessShift,
            saturation: saturationShift,
            hue: hueShift
        })
        .toBuffer();

    // --- 3단계: 미세 회전 + 크롭 (카메라 수평 오차 시뮬레이션) ---
    const rotateAngle = (Math.random() * 0.6) - 0.3; // -0.3~+0.3도
    processed = await sharp(processed)
        .rotate(rotateAngle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize(width, height, { fit: 'cover' }) // 원본 크기로 크롭
        .toBuffer();

    // --- 4단계: JPEG 재압축 사이클 (AI 패턴 파괴) ---
    // 1차: 품질 85로 JPEG 압축 → 디코딩
    processed = await sharp(processed)
        .jpeg({ quality: 85, chromaSubsampling: '4:2:0' })
        .toBuffer();
    // 2차: 품질 92로 재압축 → 디코딩
    processed = await sharp(processed)
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toBuffer();

    // --- 5단계: 미세 샤프닝 (JPEG 압축 후 자연스러운 선명도 복원) ---
    processed = await sharp(processed)
        .sharpen({ sigma: 0.5, m1: 0.5, m2: 0.3 })
        .toBuffer();

    // --- 6단계: 비네팅 효과 (카메라 렌즈 시뮬레이션) ---
    // 가장자리를 미세하게 어둡게
    const vignetteSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="v" cx="50%" cy="50%" r="70%">
                <stop offset="60%" stop-color="rgba(0,0,0,0)" />
                <stop offset="100%" stop-color="rgba(0,0,0,0.12)" />
            </radialGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#v)" />
    </svg>`);
    const vignetteBuffer = await sharp(vignetteSvg).png().toBuffer();
    processed = await sharp(processed)
        .composite([{ input: vignetteBuffer, blend: 'multiply' }])
        .toBuffer();

    // --- 7단계: PNG 변환 + EXIF 메타데이터 삽입 ---
    // 실제 카메라 EXIF 정보 시뮬레이션
    const cameras = [
        { make: 'Samsung', model: 'SM-S926N' },
        { make: 'Apple', model: 'iPhone 15 Pro' },
        { make: 'Samsung', model: 'SM-S928N' },
        { make: 'Apple', model: 'iPhone 16 Pro Max' },
        { make: 'Samsung', model: 'SM-G998N' },
    ];
    const cam = cameras[Math.floor(Math.random() * cameras.length)];

    // IFD0 EXIF 정보를 sharp withMetadata로 삽입
    const isoValues = [100, 200, 400, 640, 800];
    const focalLengths = [24, 26, 28, 35, 50];

    // withMetadata는 제한적이므로 가능한 필드만 삽입
    processed = await sharp(processed)
        .png({ compressionLevel: 6 })
        .withMetadata({
            exif: {
                IFD0: {
                    Make: cam.make,
                    Model: cam.model,
                    Software: 'Adobe Photoshop Lightroom 7.5',
                    DateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
                },
                IFD2: {
                    ExposureTime: '1/' + (Math.floor(Math.random() * 200) + 60),
                    FNumber: String((Math.random() * 6 + 1.8).toFixed(1)),
                    ISOSpeedRatings: String(isoValues[Math.floor(Math.random() * isoValues.length)]),
                    FocalLength: String(focalLengths[Math.floor(Math.random() * focalLengths.length)]),
                }
            }
        })
        .toBuffer();

    return processed;
}

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
const API_KEY = process.env.GEMINI_API_KEY || '';
// 유저 데이터 경로 (업데이트해도 유지)
const USER_DATA_DIR = process.env.USER_DATA_DIR || __dirname;
// Prompt file path (앱 리소스 - 읽기 전용)
const PROMPT_FILE_PATH = path.join(__dirname, 'prompt', 'prompt', 'info_Prompt.md');
// 키워드별 이전 글 기록 경로 (유저 데이터)
const KEYWORD_HISTORY_PATH = path.join(USER_DATA_DIR, 'keyword_history.json');
// 이미지 프롬프트 히스토리 경로 (유저 데이터)
const IMAGE_HISTORY_PATH = path.join(USER_DATA_DIR, 'image_prompt_history.json');

function loadImageHistory() {
    try {
        if (fs.existsSync(IMAGE_HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(IMAGE_HISTORY_PATH, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    return [];
}

function saveImageHistory(prompts) {
    // 최근 100개만 유지
    const history = loadImageHistory();
    const updated = [...history, ...prompts].slice(-100);
    fs.writeFileSync(IMAGE_HISTORY_PATH, JSON.stringify(updated, null, 2), 'utf-8');
}

function loadKeywordHistory() {
    try {
        if (fs.existsSync(KEYWORD_HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(KEYWORD_HISTORY_PATH, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    return {};
}

function saveKeywordHistory(history) {
    fs.writeFileSync(KEYWORD_HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

async function generateArticle() {
    try {
        // @google/genai SDK 동적 로드 (ESM 패키지)
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        console.log('프롬프트 파일을 읽는 중...');
        // 1. 프롬프트 파일 읽기
        const promptContent = fs.readFileSync(PROMPT_FILE_PATH, 'utf-8');

        // 2. 키워드 결정: 단독 키워드가 있으면 그것만 사용
        let randomKeyword;
        const overrideKeyword = (process.env.OVERRIDE_KEYWORD || '').trim();
        const usedKeywordsPath = path.join(USER_DATA_DIR, 'used_keywords.json');
        let usedKeywords = [];

        if (overrideKeyword) {
            randomKeyword = overrideKeyword;
            console.log(`단독 키워드 사용: [${randomKeyword}]`);
        } else {
            // 키워드 풀 추출
            let keywordPool = [];

            // 프롬프트에서 기본 키워드 로드 (있으면)
            const keywordMatch = promptContent.match(/당신의 전문 분야 키워드:\s*(.+)/);
            if (keywordMatch && keywordMatch[1]) {
                keywordPool = keywordMatch[1].split(',').map(k => k.trim()).filter(k => k.length > 0);
            }

            // 삭제된 키워드 필터링
            try {
                const removedPath = path.join(USER_DATA_DIR, 'removed_keywords.json');
                if (fs.existsSync(removedPath)) {
                    const removed = JSON.parse(fs.readFileSync(removedPath, 'utf-8'));
                    keywordPool = keywordPool.filter(k => !removed.includes(k));
                }
            } catch (e) { /* ignore */ }

            // 커스텀 키워드 추가
            try {
                const customPath = path.join(USER_DATA_DIR, 'custom_keywords.json');
                if (fs.existsSync(customPath)) {
                    const custom = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
                    if (Array.isArray(custom)) {
                        keywordPool = [...keywordPool, ...custom.filter(k => k && !keywordPool.includes(k))];
                    }
                }
            } catch (e) { /* ignore */ }

            if (keywordPool.length === 0) {
                throw new Error('사용 가능한 키워드가 없습니다. 대시보드에서 키워드를 추가해주세요.');
            }

            // 3. 랜덤 키워드 선택 (사이클 관리)
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
            randomKeyword = unusedKeywords[Math.floor(Math.random() * unusedKeywords.length)];
            console.log(`선택된 랜덤 키워드: [${randomKeyword}] (남은 키워드 개수: ${unusedKeywords.length - 1})`);
        }

        // 키워드 사용 기록은 글 생성 성공 후에만 저장 (아래 result.json 생성 후)

        // 4. 키워드별 이전 글 기록 로드 (중복 방지)
        const keywordHistory = loadKeywordHistory();
        const prevArticles = keywordHistory[randomKeyword] || [];

        let deduplicationPrompt = '';
        if (prevArticles.length > 0) {
            const prevList = prevArticles.map((a, i) => `  ${i + 1}. 제목: "${a.h1}"${a.h3 ? ` / 부제: "${a.h3}"` : ''}`).join('\n');
            deduplicationPrompt = `
=================================
[중복 방지 - 필수 준수]
아래는 동일 키워드 '${randomKeyword}'로 이미 작성된 글 목록입니다.
${prevList}

위 글들과 완전히 다른 새로운 관점, 새로운 제목, 새로운 구성으로 작성하십시오.
- 제목이 유사하거나 동일해서는 안 됩니다.
- 글의 전개 방식과 소제목도 기존 글과 차별화하십시오.
- 같은 키워드라도 다른 타겟 독자, 다른 상황, 다른 해결책을 제시하십시오.
`;
            console.log(`📋 이전에 '${randomKeyword}' 키워드로 ${prevArticles.length}편의 글이 작성되었습니다. 중복 방지 적용.`);
        }

        // 텍스트 생성 (gemini-3-flash-preview)
        const userPrompt = `
${promptContent}

=================================
요청 사항:
위 가이드라인에 맞춰서 오늘 작성할 핵심 키워드를 '${randomKeyword}'로 설정하여 정보글을 하나 작성해주세요.
주의사항 1: "알겠습니다", "승낙합니다", "承知いたしました" 등과 같은 어떠한 인사말이나 응답성 서론도 절대 넣지 마십시오. 오직 본문(제목부터 시작하는 마크다운 원문)만 정확히 출력하십시오.
주의사항 2: 본문 작성 시 <b>나 <strong> 같은 HTML 태그는 절대로 사용하지 마십시오. 글씨를 굵게 강조해야 할 때는 반드시 마크다운 기호(**텍스트**)만을 사용하십시오.
${deduplicationPrompt}`;

        console.log('AI에게 글 작성을 요청하는 중입니다. (잠시만 기다려주세요)...\n');

        // 5. API 호출 (재시도 포함)
        let result;
        const maxTextRetries = 3;
        for (let attempt = 1; attempt <= maxTextRetries; attempt++) {
            try {
                result = await ai.models.generateContent({
                    model: process.env.TEXT_MODEL || "gemini-3-flash-preview",
                    contents: userPrompt
                });
                break;
            } catch (e) {
                const status = e.status || e.httpCode || 0;
                if ((status === 429 || status >= 500) && attempt < maxTextRetries) {
                    const waitSec = attempt * 15;
                    console.log(`⚠ API 오류 (${status}). ${waitSec}초 후 재시도... (${attempt}/${maxTextRetries})`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                } else {
                    throw e;
                }
            }
        }
        const responseText = result.text;

        // 재시도 포함 단일 이미지 생성 함수 (새 SDK 방식)
        // 모든 이미지 프롬프트에 강제 적용되는 no-text 접미사
        const NO_TEXT_SUFFIX = '. Purely visual, photographic only. Absolutely NO text, NO letters, NO numbers, NO words, NO typography, NO watermarks, NO captions, NO labels, NO signs, NO writing of any kind anywhere in the image.';

        async function generateSingleImage(ai, prompt, maxRetries = 5) {
            // 이미지 모델에 전달되기 전 모든 프롬프트에 no-text 지시를 강제 추가
            const safePrompt = prompt.replace(/NO text[^.]*/gi, '').trimEnd().replace(/,\s*$/, '') + NO_TEXT_SUFFIX;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const imageResult = await ai.models.generateContent({
                        model: process.env.IMAGE_MODEL || "gemini-2.5-flash-image",
                        contents: safePrompt,
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
                    const status = err.status || err.httpCode || 0;
                    console.log(`  [시도 ${attempt}/${maxRetries}] 오류 (${status}): ${err.message}`);
                    if (attempt < maxRetries) {
                        // 500/503/429 에러는 더 오래 대기
                        const waitSec = (status === 429 || status >= 500) ? attempt * 15 : attempt * 5;
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

        // 이전 이미지 프롬프트 히스토리 로드 (중복 방지)
        const prevImagePrompts = loadImageHistory();
        let imageDeduplicationNote = '';
        if (prevImagePrompts.length > 0) {
            const recentPrompts = prevImagePrompts.slice(-30);
            imageDeduplicationNote = `\n\n[중복 방지] 아래는 이전에 사용된 이미지 프롬프트입니다. 이들과 완전히 다른 새로운 구도, 색감, 장면을 사용하세요:\n${recentPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
        }

        try {
            const imgPromptContent = fs.readFileSync(IMG_PROMPT_FILE_PATH, 'utf-8');
            const imgUserPrompt = `
${imgPromptContent}
- 블로그 주제: ${randomKeyword}
- 블로그 글 내용:\n${responseText.substring(0, 1500)}
${imageDeduplicationNote}

출력 규칙: 반드시 10개의 영문 프롬프트를 포함하는 순수한 JSON 배열 형식(["prompt1", "prompt2", ..., "prompt10"])으로만 출력하십시오. 다른 어떠한 텍스트, 설명, 마크다운 코드블록(\`\`\`)도 절대 포함하지 마십시오.
`;
            const imgReqResult = await ai.models.generateContent({
                model: process.env.TEXT_MODEL || "gemini-3-flash-preview",
                contents: imgUserPrompt
            });
            let rawText = imgReqResult.text.trim();
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            generatedImgPrompts = JSON.parse(rawText);
        } catch (e) {
            console.error("이미지 프롬프트 JSON 분석 실패, 기본값 사용", e.message);
            generatedImgPrompts = [
                `Trustworthy and hopeful professional photography about ${randomKeyword}, blue and gold tone, purely visual, photographic only`,
                `Professional infographic style visual element representing ${randomKeyword}, clean and modern layout, purely visual`,
                `Hopeful business conversation scene about ${randomKeyword}, smiling Korean professionals, natural lighting, purely visual`,
                `Close-up of financial documents and calculator related to ${randomKeyword}, warm office setting, purely visual`,
                `Korean professional consultant in meeting about ${randomKeyword}, confident and approachable, purely visual`,
                `Modern cityscape with apartment buildings representing ${randomKeyword}, golden hour lighting, purely visual`,
                `Hands signing important financial contract for ${randomKeyword}, detailed close-up, purely visual`,
                `Happy Korean family in front of their home celebrating ${randomKeyword} success, warm atmosphere, purely visual`,
                `Clean modern office desk with financial planning tools related to ${randomKeyword}, minimalist style, purely visual`,
                `Professional handshake sealing ${randomKeyword} agreement, trust and partnership concept, purely visual`
            ];
        }

        console.log(`문맥에 맞는 이미지를 순차적으로 생성합니다 (${process.env.IMAGE_MODEL || 'gemini-2.5-flash-image'})...\n`);

        // 파일 포맷팅: 랜덤 키워드 + 타임스탬프로 파일명 생성
        const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);

        // 정규식으로 '[📸 이곳에 ... 이미지 ... 삽입]' 매칭
        const placeholderRegex = /\[📸.*?이미지.*?\]/g;
        let matches = responseText.match(placeholderRegex) || [];
        console.log(`총 ${matches.length}개의 이미지 자리를 감지했습니다.`);

        // IMAGE_COUNT 환경변수로 이미지 개수 결정
        // 0 = 자동 (AI가 결정한 자리표시자 수만큼), 1~10 = 정확히 해당 숫자만 생성
        const imageCount = parseInt(process.env.IMAGE_COUNT) || 0;
        if (imageCount > 0) {
            // 사용자가 숫자를 지정한 경우: 자리표시자 수와 무관하게 정확히 그 수만 생성
            if (matches.length > imageCount) {
                matches = matches.slice(0, imageCount);
            } else if (matches.length < imageCount) {
                // 자리표시자가 부족하면 더미 추가
                while (matches.length < imageCount) {
                    matches.push(`[📸 추가 이미지 ${matches.length + 1}장 삽입]`);
                }
            }
            console.log(`이미지 개수 설정: ${imageCount}장`);
        }
        console.log(`생성할 이미지: ${matches.length}장\n`);

        // 순차적으로 이미지 생성 (한 장씩, 재시도 포함)
        const replacements = [];
        for (let i = 0; i < matches.length; i++) {
            const myIndex = i + 1;
            console.log(`[진행] ${myIndex}/${matches.length}번째 이미지 생성 중... (${matches[i]})`);
            let replacementStr = `[이미지 생성 실패]`;

            const promptIndex = Math.min(i, Math.max(0, generatedImgPrompts.length - 1));
            const imagePrompt = generatedImgPrompts[promptIndex];

            const imagePart = await generateSingleImage(ai, imagePrompt, 3);

            if (imagePart) {
                const imgFilename = `img_${randomKeyword}_${timestamp}_${myIndex}.png`;
                const imgPath = path.join(__dirname, imgFilename);
                const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

                try {
                    // Anti-Detection 처리 (노이즈, 색조정, 회전, JPEG사이클, 비네팅, EXIF)
                    console.log(`  -> Anti-Detection 처리 중...`);
                    let processedBuffer = await antiDetectProcess(rawBuffer);

                    // 하단 오버레이 합성
                    const baseMeta = await sharp(processedBuffer).metadata();
                    const overlayWithIcon = await createBottomOverlay(baseMeta.width);

                    await sharp(processedBuffer)
                        .composite([{ input: overlayWithIcon, gravity: 'south' }])
                        .png()
                        .toFile(imgPath);
                    console.log(`[완료] ${myIndex}번째 이미지 저장 (Anti-Detection + 오버레이): ${imgFilename}`);
                } catch (processErr) {
                    console.log(`  ⚠️ Anti-Detection/오버레이 오류: ${processErr.message}`);
                    // Anti-Detection 실패 시 원본으로 폴백
                    try {
                        const baseMeta = await sharp(rawBuffer).metadata();
                        const overlayWithIcon = await createBottomOverlay(baseMeta.width);
                        await sharp(rawBuffer)
                            .composite([{ input: overlayWithIcon, gravity: 'south' }])
                            .png()
                            .toFile(imgPath);
                        console.log(`[완료] ${myIndex}번째 이미지 저장 (오버레이만): ${imgFilename}`);
                    } catch (overlayErr) {
                        console.log(`  ⚠️ 오버레이 폴백도 실패: ${overlayErr.message}`);
                        fs.writeFileSync(imgPath, rawBuffer);
                        console.log(`[완료] ${myIndex}번째 이미지 저장 (원본): ${imgFilename}`);
                    }
                }
                replacementStr = `\n\n![${randomKeyword} 관련 이미지](./${imgFilename})\n\n`;
            } else {
                console.log(`[실패] ${myIndex}번째 이미지 - 최대 재시도 후에도 생성 실패`);
            }

            replacements.push(replacementStr);

            // 다음 이미지 생성 전 5초 대기 (API rate limit 방지)
            if (i < matches.length - 1) {
                await new Promise(r => setTimeout(r, 5000));
            }
        }

        // 이번에 사용한 이미지 프롬프트를 히스토리에 저장 (중복 방지)
        saveImageHistory(generatedImgPrompts);

        // 플레이스홀더를 생성된 이미지로 순서대로 치환
        let finalOutputText = responseText;
        let repIdx = 0;
        finalOutputText = finalOutputText.replace(placeholderRegex, () => replacements[repIdx++]);
        // AI가 출력한 undefined 텍스트 제거
        finalOutputText = finalOutputText.replace(/^\s*undefined\s*$/gm, '');

        console.log('\n📦 result.json 및 imgs/ 생성 중...');

        // 마크다운 텍스트를 섹션별로 파싱
        const lines = finalOutputText.split('\n').filter(l => l.trim() !== '');
        let h1 = '';
        let h3 = '';
        const sections = [];
        let currentSection = null;

        for (const line of lines) {
            const trimmed = line.trim();
            // 제목: 첫 번째 heading을 h1으로 사용 (#, ##, ###, #### 모두 허용)
            if (trimmed.match(/^#{1,6}\s+/) && !h1) {
                h1 = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^제목[:\s：]*/, '');
                continue;
            }
            // 소제목 (#, ##, ###, #### 모두 허용 - h1 이후의 모든 heading)
            if (trimmed.match(/^#{1,6}\s+/)) {
                if (currentSection) sections.push(currentSection);
                currentSection = {
                    h2: trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, ''),
                    p: ''
                };
                continue;
            }
            // 이미지 라인 스킵
            if (trimmed.startsWith('![')) continue;
            // 해시태그 라인 스킵 (# 으로 시작하지만 heading이 아닌 경우)
            if (trimmed.startsWith('#') && !trimmed.match(/^#{1,6}\s+/)) continue;
            // 구분선 스킵
            if (trimmed === '---' || trimmed === '***') continue;
            // undefined 스킵
            if (trimmed === 'undefined') continue;
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

        // 섹션이 하나도 없는 경우: 본문 전체를 하나의 섹션으로 만듦
        if (sections.length === 0) {
            console.log('⚠️ 마크다운에서 소제목을 감지하지 못했습니다. 본문 전체를 하나의 섹션으로 구성합니다.');
            const bodyText = lines
                .map(l => l.trim())
                .filter(l => !l.match(/^#{1,6}\s+/) && !l.startsWith('![') && !l.startsWith('#') && l !== '---' && l !== '***' && l !== 'undefined')
                .map(l => l.replace(/\*\*/g, ''))
                .filter(l => l.length > 0)
                .join('\n');
            sections.push({
                h2: h1 || randomKeyword,
                p: bodyText || h3 || randomKeyword
            });
        }

        // Gemini에게 블로그 제목 별도 생성 요청
        console.log('블로그 제목을 생성하는 중...');
        try {
            const sectionSummary = sections.slice(0, 3).map(s => s.h2).join(', ');
            const titlePrompt = `다음 블로그 글의 제목을 1개만 만들어주세요.
키워드: ${randomKeyword}
글 내용 요약: ${sectionSummary}

조건:
- 반드시 "${randomKeyword}"로 시작하는 제목을 만드세요 (예: "${randomKeyword} 조건과 신청방법 총정리")
- 네이버 블로그 제목에 적합한 자연스러운 한국어
- 20~40자 내외
- 콜론(:) 기호 사용 금지
- 제목만 출력하고 다른 설명은 절대 하지 마세요`;

            const titleResult = await ai.models.generateContent({
                model: process.env.TEXT_MODEL || "gemini-3-flash-preview",
                contents: titlePrompt
            });
            const generatedTitle = titleResult.text.trim().replace(/^["'#\s]+|["'\s]+$/g, '');
            if (generatedTitle && generatedTitle.length > 3) {
                h1 = generatedTitle;
                console.log(`생성된 제목: ${h1}`);
            }
        } catch (e) {
            console.log('제목 생성 실패, 본문 제목을 사용합니다.');
            if (!h1 && sections.length > 0) h1 = sections[0].h2;
        }

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
            키워드: randomKeyword
        };

        const resultJsonPath = path.join(__dirname, 'result.json');
        fs.writeFileSync(resultJsonPath, JSON.stringify(resultJson, null, 2), 'utf-8');

        // 글 생성 성공 → 키워드를 사용 기록에 추가 (단독 키워드는 사이클 기록 제외)
        if (!overrideKeyword) {
            usedKeywords.push(randomKeyword);
            fs.writeFileSync(usedKeywordsPath, JSON.stringify(usedKeywords, null, 2), 'utf-8');
            console.log(`키워드 [${randomKeyword}] 사용 완료 기록됨`);
        } else {
            console.log(`단독 키워드 [${randomKeyword}] — 사이클 기록에 추가하지 않음`);
        }

        // 키워드 히스토리에 새 글 기록 (중복 방지용)
        const updatedHistory = loadKeywordHistory();
        if (!updatedHistory[randomKeyword]) updatedHistory[randomKeyword] = [];
        updatedHistory[randomKeyword].push({
            h1: h1,
            h3: h3,
            date: new Date().toISOString().slice(0, 10),
            sections: sections.map(s => s.h2)
        });
        saveKeywordHistory(updatedHistory);

        console.log(`\n✅ result.json 생성 완료 (제목: ${h1}, 섹션 ${sections.length}개)`);
        console.log(`✅ imgs/ 폴더에 이미지 ${generatedImages.length}장 복사 완료`);
        console.log('✅ 이제 node 3.post.js 를 실행하면 네이버 블로그에 자동 포스팅됩니다.\n');

    } catch (error) {
        const msg = error.status ? `API 오류 (${error.status}): ${error.message?.split('\n')[0] || error.message}` : error.message;
        console.error(`❌ 오류 발생: ${msg}`);
    }
}

generateArticle();
