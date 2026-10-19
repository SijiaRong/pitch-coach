import { getIndustry, getRound, publicDiagnosticSummary } from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import { isPrivacyRefusal } from './privacy';

export const POSTER_WIDTH = 300;
export const POSTER_HEIGHT = 680;
export const POSTER_CANVAS_ID = 'risk-poster-v2';

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
    const ctx = uni.createCanvasContext(POSTER_CANVAS_ID);
    const diagnostic = publicDiagnosticSummary(report);
    ctx.setFillStyle('#f6f6ec');
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
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
    ctx.fillText(
      wrap(ctx, anonymous ? '某创业项目的融资体检' : report.projectName, 256, 1)[0],
      22,
      119,
    );
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
    ctx.setFillStyle(report.diagnostics?.redFlags.length ? '#aa4c3e' : '#4f6346');
    ctx.fillText(diagnostic.label, 192, 194);
    ctx.setFontSize(8);
    ctx.setFillStyle('#9aa48b');
    ctx.fillText(
      `证据覆盖 ${report.coverage}% · ${report.investors.length}/3 位完成评审${report.missingInvestors.length ? ' · 部分结果' : ''}`,
      23,
      232,
    );
    ctx.setFillStyle('#e2e7d5');
    ctx.fillRect(22, 248, 256, 1);
    ctx.setFontSize(18);
    ctx.setFillStyle('#263d31');
    const lines = wrap(ctx, `“${diagnostic.headline}”`, 252, 2);
    lines.forEach((line, index) => ctx.fillText(line, 22, 278 + index * 25));
    ctx.setFontSize(10);
    ctx.setFillStyle('#5a6f4c');
    ctx.fillText(diagnostic.counts, 22, 331);
    const riskRow = (label: string, value: string, y: number, color: string) => {
      ctx.setFillStyle(color);
      ctx.fillRect(22, y - 10, 3, 12);
      ctx.setFontSize(10);
      ctx.fillText(label, 32, y);
      ctx.setFillStyle('#536a4c');
      ctx.setFontSize(11);
      wrap(ctx, value, 244, 2).forEach((line, index) =>
        ctx.fillText(line, 32, y + 18 + index * 15),
      );
    };
    riskRow('阻断性红旗', diagnostic.red, 360, '#ae5547');
    riskRow('投资人会追问的橙旗', diagnostic.orange || '专项检查未完成', 412, '#b68c3c');
    riskRow('未经验证的关键假设', diagnostic.assumptions || '专项检查未完成', 464, '#778660');
    riskRow('死亡预言 · 条件性失败情景', diagnostic.death, 516, '#364e41');
    const yStart = 582;
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
    ctx.fillRect(22, 641, 256, 1);
    ctx.setFontSize(8);
    ctx.setFillStyle('#8e9a7f');
    ctx.fillText('资料陈述未经独立尽调 · 风险可能被遗漏', 22, 657);
    ctx.fillText(
      report.mode === 'demo'
        ? '虚构演示 · 仅供自检 · 非真实投资意向'
        : 'AI 生成 · 仅供自检 · 非投资建议或承诺',
      22,
      671,
    );
    if (report.mode === 'demo') {
      ctx.setFontSize(8);
      ctx.fillText('DEMO', 250, 671);
    }
    ctx.draw(false, () =>
      uni.canvasToTempFilePath({
        canvasId: POSTER_CANVAS_ID,
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
        destWidth: POSTER_WIDTH * 3,
        destHeight: POSTER_HEIGHT * 3,
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
      fail: (error) => reject(new Error(
        isPrivacyRefusal(error)
          ? '未同意微信隐私指引，图片未保存。你仍可预览或分享海报。'
          : '保存失败，请在微信设置中允许保存图片；也可以长按预览图保存。',
      )),
    }),
  );
  // #endif
}
