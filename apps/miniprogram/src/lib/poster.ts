import { VOTE_LABELS, getIndustry, getRound } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';

export const POSTER_WIDTH = 300;
export const POSTER_HEIGHT = 460;

function wrap(context: UniApp.CanvasContext, value: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = '';
  for (const character of value) {
    if (context.measureText(line + character).width > maxWidth && line) {
      lines.push(line);
      line = character;
    } else line += character;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

export function drawPoster(report: EvaluationReport, anonymous: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = uni.createCanvasContext('share-poster');
    ctx.setFillStyle('#f6f6ec');
    ctx.fillRect(0, 0, 300, 460);
    ctx.setFillStyle('#263d31');
    ctx.fillRect(0, 0, 300, 70);
    ctx.setFontSize(19);
    ctx.setFillStyle('#d9f18a');
    ctx.fillText('PitchCoach', 22, 36);
    ctx.setFontSize(9);
    ctx.setFillStyle('#a7c0a5');
    ctx.fillText('融资教练 · 先被 AI 问倒，再去见投资人', 22, 54);
    ctx.setFontSize(8);
    ctx.setFillStyle('#9aa48a');
    ctx.fillText('MY STARTUP, UNDER REVIEW', 22, 94);
    ctx.setFontSize(16);
    ctx.setFillStyle('#263d31');
    ctx.fillText(anonymous ? '某创业项目的融资体检' : report.projectName, 22, 119);
    ctx.setFontSize(9);
    ctx.setFillStyle('#8b987b');
    ctx.fillText(
      `${getIndustry(report.industry).name} · ${getRound(report.round || 'angel').name} · ${report.mode === 'demo' ? '虚构演示' : 'AI 模拟投委会'}`,
      22,
      138,
    );
    ctx.setFontSize(67);
    ctx.setFillStyle('#2f684e');
    ctx.fillText(report.score === null ? '—' : String(report.score), 19, 213);
    ctx.setFontSize(13);
    ctx.setFillStyle('#929f7d');
    ctx.fillText('/ 100', 109, 211);
    ctx.setFontSize(16);
    ctx.setFillStyle('#4f6346');
    ctx.fillText(VOTE_LABELS[report.verdict], 191, 194);
    ctx.setFontSize(8);
    ctx.setFillStyle('#9aa48b');
    ctx.fillText(`证据覆盖 ${report.coverage}% · 参考分`, 23, 232);
    ctx.setFillStyle('#e2e7d5');
    ctx.fillRect(22, 248, 256, 1);
    ctx.setFontSize(20);
    ctx.setFillStyle('#263d31');
    const lines = wrap(ctx, `“${report.headline}”`, 252, 3);
    lines.forEach((line, index) => ctx.fillText(line, 22, 279 + index * 29));
    const yStart = 301 + Math.max(0, lines.length - 1) * 24;
    report.dimensions.forEach((dimension, index) => {
      const col = index % 2,
        row = Math.floor(index / 2),
        x = 22 + col * 135,
        y = yStart + row * 14;
      ctx.setFontSize(8);
      ctx.setFillStyle('#839274');
      ctx.fillText(dimension.name, x, y);
      ctx.setFillStyle('#e2e8d6');
      ctx.fillRect(x + 42, y - 5, 45, 3);
      if (dimension.score !== null) {
        ctx.setFillStyle('#8ea965');
        ctx.fillRect(x + 42, y - 5, (45 * dimension.score) / 100, 3);
      }
      ctx.setFillStyle('#637a4e');
      ctx.fillText(dimension.score === null ? '待补' : String(dimension.score), x + 93, y);
    });
    ctx.setFillStyle('#e4e8d8');
    ctx.fillRect(22, 421, 256, 1);
    ctx.setFontSize(8);
    ctx.setFillStyle('#8e9a7f');
    ctx.fillText('AI 模拟评估，仅供项目自检 · 非真实投资意向', 22, 440);
    if (report.mode === 'demo') {
      ctx.setFontSize(8);
      ctx.fillText('DEMO', 250, 440);
    }
    ctx.draw(false, () =>
      uni.canvasToTempFilePath({
        canvasId: 'share-poster',
        width: 300,
        height: 460,
        destWidth: 900,
        destHeight: 1380,
        fileType: 'png',
        success: (result) => resolve(result.tempFilePath),
        fail: () => reject(new Error('海报生成失败，请重试')),
      }),
    );
  });
}

export async function savePoster(path: string) {
  // #ifdef H5
  const link = document.createElement('a');
  link.href = path;
  link.download = 'PitchCoach-融资体检.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return;
  // #endif
  // #ifdef MP-WEIXIN
  return new Promise<void>((resolve, reject) =>
    uni.saveImageToPhotosAlbum({
      filePath: path,
      success: () => resolve(),
      fail: () => reject(new Error('保存失败，请在微信设置中允许保存图片；也可以长按预览图保存。')),
    }),
  );
  // #endif
}
