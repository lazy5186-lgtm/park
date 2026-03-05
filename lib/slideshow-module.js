const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

async function createSlideshow(title) {
  try {
    // imgs 폴더 경로 (상위 디렉토리에 있음)
    const imgsDir = path.join(__dirname, '..', 'imgs');
    
    // imgs 폴더의 모든 이미지 파일 가져오기
    const files = fs.readdirSync(imgsDir)
      .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
      .map(file => path.join(imgsDir, file))
      .sort(); // 파일명 순서대로 정렬
    
    if (files.length === 0) {
      throw new Error('imgs 폴더에 이미지가 없습니다.');
    }
    
    console.log(`총 ${files.length}개의 이미지를 발견했습니다.`);
    
    // 출력 비디오 경로 (상위 디렉토리에 저장)
    const outputPath = path.join(__dirname, '..', `${title}_slideshow.mp4`);
    
    // 기존 파일이 있으면 삭제
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    // concat 파일 생성 (ffmpeg의 concat demuxer 사용) - 상위 디렉토리에 저장
    const concatFilePath = path.join(__dirname, '..', 'concat.txt');
    const concatContent = files.map(file => `file '${file.replace(/\\/g, '/')}'
duration 2`).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);
    
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264',      // H.264 코덱 사용
          '-pix_fmt yuv420p',  // 호환성을 위한 픽셀 포맷
          '-r 30',             // 프레임레이트 30fps
          '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2', // 1920x1080으로 스케일링
          '-preset fast',      // 인코딩 속도
          '-crf 23'           // 품질 설정 (낮을수록 높은 품질)
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg 명령 실행:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`처리 중: ${Math.round(progress.percent)}%`);
          }
        })
        .on('error', (err) => {
          // concat 파일 삭제
          if (fs.existsSync(concatFilePath)) {
            fs.unlinkSync(concatFilePath);
          }
          reject(err);
        })
        .on('end', () => {
          console.log('동영상 생성 완료!');
          // concat 파일 삭제
          if (fs.existsSync(concatFilePath)) {
            fs.unlinkSync(concatFilePath);
          }
          resolve(outputPath);
        })
        .run();
    });
    
  } catch (error) {
    console.error('슬라이드쇼 생성 중 오류:', error);
    throw error;
  }
}

module.exports = { createSlideshow };