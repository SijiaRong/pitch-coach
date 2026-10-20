import {
  INVESTORS,
  decisionLabel,
  getIndustry,
  getRound,
  publicDiagnosticSummary,
} from '@pitchcoach/shared';
import type { EvaluationReport } from '@pitchcoach/shared';
import { isPrivacyRefusal } from './privacy';

export const POSTER_WIDTH = 300;
export const POSTER_HEIGHT = 760;
export const POSTER_CANVAS_ID = 'risk-poster-v3';
export interface PosterEntry {
  codePath: string;
  label?: string;
}
export const POSTER_ENTRY_HEIGHT = 812;
export const posterHeight = (entry?: PosterEntry) => (entry ? POSTER_ENTRY_HEIGHT : POSTER_HEIGHT);

/**
 * Everything printed on the poster, derived from the report without adjustment.
 * Score, verdict, coverage and every dimension value are copied verbatim; "strongest" and
 * "to strengthen" are simply the highest and lowest scored dimensions. Free text written by
 * the model (headline, evidence, questions) never reaches the poster, only catalog copy.
 */
export function posterModel(report: EvaluationReport, anonymous: boolean) {
  const industry = getIndustry(report.industry);
  const scored = report.dimensions.filter(
    (dimension): dimension is typeof dimension & { score: number } => dimension.score !== null,
  );
  const byScore = [...scored].sort((a, b) => b.score - a.score || b.weight - a.weight);
  // The toughest coach of this review speaks on the poster, using their fixed catalog opening.
  const toughest = [...report.investors]
    .filter((review) => INVESTORS[review.investorId])
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0];
  const coach = toughest ? INVESTORS[toughest.investorId] : undefined;
  return {
    title: anonymous ? `一个${industry.name}项目` : report.projectName,
    meta: [industry.name, getRound(report.round || 'angel').name, report.stage].join(' · '),
    score: report.score,
    verdict: decisionLabel(report),
    blocked: Boolean(report.diagnostics?.redFlags.length),
    coverage: report.coverage,
    reviewers: report.investors.length,
    partial: report.missingInvestors.length > 0,
    counts: publicDiagnosticSummary(report).counts,
    dimensions: report.dimensions.map((dimension) => ({
      name: dimension.name,
      score: dimension.score,
    })),
    strongest: byScore[0] ? { name: byScore[0].name, score: byScore[0].score } : undefined,
    weakest:
      byScore.length > 1
        ? { name: byScore[byScore.length - 1].name, score: byScore[byScore.length - 1].score }
        : undefined,
    coach: coach ? { name: coach.name, title: coach.title, mark: coach.mark, opening: coach.opening } : undefined,
    demo: report.mode === 'demo',
  };
}
export type PosterModel = ReturnType<typeof posterModel>;

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

const C = {
  night: '#1b3026',
  deep: '#24402f',
  lime: '#d9f18a',
  mint: '#a9c29d',
  paper: '#f6f6ec',
  ink: '#1f2b25',
  muted: '#7b8873',
  green: '#2f684e',
  line: '#e2e7d5',
  red: '#f0a48c',
};

export function drawPoster(
  report: EvaluationReport,
  anonymous: boolean,
  entry?: PosterEntry,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = uni.createCanvasContext(POSTER_CANVAS_ID);
    const model = posterModel(report, anonymous);
    const W = POSTER_WIDTH,
      height = posterHeight(entry);
    const font = (size: number, bold = false) => {
      ctx.setFontSize(size);
      // Weight is supported by the WeChat canvas font shorthand; size is kept in sync above.
      (ctx as unknown as { font?: string }).font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
    };
    const text = (value: string, x: number, y: number, size: number, color: string, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
      font(size, bold);
      ctx.setFillStyle(color);
      ctx.setTextAlign(align);
      ctx.fillText(value, x, y);
      ctx.setTextAlign('left');
    };
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
      ctx.lineTo(x + w, y + h - r);
      ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
      ctx.lineTo(x + r, y + h);
      ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
      ctx.lineTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
      ctx.closePath();
    };

    // ---- dark hero ----
    const hero = 300;
    const gradient = ctx.createLinearGradient(0, 0, 0, hero);
    gradient.addColorStop(0, C.night);
    gradient.addColorStop(1, C.deep);
    ctx.setFillStyle(gradient as unknown as string);
    ctx.fillRect(0, 0, W, height);
    // soft glow behind the score
    ctx.setGlobalAlpha(0.08);
    ctx.setFillStyle(C.lime);
    ctx.beginPath();
    ctx.arc(86, 196, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.setGlobalAlpha(1);

    ctx.drawImage('/static/brand/ai-toulema.png', 22, 18, 30, 30);
    text('AI投了么', 60, 33, 14, C.lime, true);
    text('AI 投委会 · 八维评审', 60, 46, 8.5, C.mint);
    roundRect(228, 24, 50, 18, 9);
    ctx.setStrokeStyle('rgba(169, 194, 157, 0.55)');
    ctx.setLineWidth(1);
    ctx.stroke();
    text(model.demo ? '虚构演示' : 'AI 生成', 253, 36.5, 8, C.mint, false, 'center');

    text(`已接受 ${model.reviewers} 位 AI 投委逐项追问`, 22, 84, 9, C.mint);
    ctx.setFillStyle('#ffffff');
    wrap(ctx, model.title, 256, 1).forEach((line) => text(line, 22, 110, 21, '#ffffff', true));
    text(model.meta, 22, 130, 9.5, C.mint);

    // score ring: sweep is exactly score / 100
    const cx = 86,
      cy = 208,
      r = 56;
    ctx.setLineCap('round');
    ctx.setLineWidth(9);
    ctx.setStrokeStyle('rgba(255, 255, 255, 0.12)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (model.score !== null) {
      ctx.setStrokeStyle(C.lime);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * model.score) / 100);
      ctx.stroke();
    }
    text(model.score === null ? '—' : String(model.score), cx, cy + 12, 38, C.lime, true, 'center');
    text('/ 100 参考分', cx, cy + 30, 8, C.mint, false, 'center');

    // verdict + facts
    const vx = 168;
    roundRect(vx, 158, 110, 34, 9);
    ctx.setStrokeStyle(model.blocked ? C.red : C.lime);
    ctx.setLineWidth(1.4);
    ctx.stroke();
    text(model.verdict, vx + 55, 180, 15, model.blocked ? C.red : C.lime, true, 'center');
    text(`证据覆盖  ${model.coverage}%`, vx, 214, 9.5, '#e7efdc');
    text(`完成评审  ${model.reviewers} / 3 位${model.partial ? '（部分）' : ''}`, vx, 231, 9.5, '#e7efdc');
    text(model.counts, vx, 248, 8, C.mint);

    // ---- light sheet ----
    ctx.setFillStyle(C.paper);
    roundRect(0, hero - 18, W, height - hero + 18, 18);
    ctx.fill();

    // radar of the eight real dimension scores
    text('八维评分', 22, hero + 14, 12, C.ink, true);
    text('“待补”= 资料不足，不计零分', 278, hero + 14, 8, C.muted, false, 'right');
    const rx = 150,
      ry = hero + 122,
      rr = 68,
      n = model.dimensions.length;
    const point = (index: number, ratio: number) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / n;
      return [rx + Math.cos(angle) * rr * ratio, ry + Math.sin(angle) * rr * ratio] as const;
    };
    ctx.setLineWidth(0.8);
    ctx.setStrokeStyle(C.line);
    for (const ring of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const [x, y] = point(i % n, ring);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = point(i, 1);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.beginPath();
    model.dimensions.forEach((dimension, i) => {
      const [x, y] = point(i, (dimension.score ?? 0) / 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.setGlobalAlpha(0.22);
    ctx.setFillStyle(C.green);
    ctx.fill();
    ctx.setGlobalAlpha(1);
    ctx.setLineWidth(1.6);
    ctx.setStrokeStyle(C.green);
    ctx.stroke();
    model.dimensions.forEach((dimension, i) => {
      const [x, y] = point(i, 1.32);
      const [px, py] = point(i, (dimension.score ?? 0) / 100);
      if (dimension.score !== null) {
        ctx.setFillStyle(C.green);
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      text(dimension.name, x, y - 1, 8.5, dimension.score === null ? '#a5ad9c' : '#4b5c45', false, 'center');
      text(dimension.score === null ? '待补' : String(dimension.score), x, y + 10, 8.5, dimension.score === null ? '#a5ad9c' : C.green, true, 'center');
    });

    // strongest / to strengthen
    const cardY = hero + 230;
    const fact = (x: number, label: string, item: { name: string; score: number } | undefined, accent: string) => {
      ctx.setFillStyle('#ffffff');
      roundRect(x, cardY, 124, 54, 12);
      ctx.fill();
      text(label, x + 12, cardY + 18, 8.5, C.muted);
      text(item ? item.name : '资料不足', x + 12, cardY + 39, 14, C.ink, true);
      if (item) text(String(item.score), x + 112, cardY + 39, 14, accent, true, 'right');
    };
    fact(22, '最强项', model.strongest, C.green);
    fact(154, '下一步补强', model.weakest, '#b0723d');

    // the toughest coach's fixed opening line
    let y = cardY + 82;
    if (model.coach) {
      ctx.setFillStyle(C.green);
      ctx.fillRect(22, y - 12, 3, 40);
      font(12.5, true);
      const lines = wrap(ctx, `“${model.coach.opening}”`, 244, 2);
      lines.forEach((line, index) => text(line, 32, y + index * 18, 12.5, C.ink, true));
      text(`—— ${model.coach.name} · ${model.coach.title}（AI 教练）`, 32, y + lines.length * 18 + 4, 8, C.muted);
      y += lines.length * 18 + 26;
    }

    // ---- call to action ----
    const footer = height - 30;
    const ctaY = Math.max(y + 6, footer - 116);
    ctx.setFillStyle(C.line);
    ctx.fillRect(22, ctaY, 256, 1);
    if (entry) {
      ctx.setFillStyle('#ffffff');
      roundRect(22, ctaY + 12, 92, 92, 12);
      ctx.fill();
      ctx.drawImage(entry.codePath, 28, ctaY + 18, 80, 80);
      text('你的项目，敢接受追问吗？', 126, ctaY + 38, 12.5, C.ink, true);
      font(9);
      wrap(ctx, entry.label || '扫码查看完整评估', 150, 2).forEach((line, index) =>
        text(line, 126, ctaY + 58 + index * 14, 9, C.green),
      );
      text('长按识别小程序码', 126, ctaY + 96, 8, C.muted);
    } else {
      text('你的项目，敢接受追问吗？', 22, ctaY + 32, 14, C.ink, true);
      text('微信搜索「AI投了么」，3 分钟拿到八维评审', 22, ctaY + 52, 9.5, C.green);
    }
    text(
      model.demo ? '虚构演示数据 · 非真实项目' : 'AI 生成 · 资料未经独立尽调 · 不构成投资建议',
      W / 2,
      footer + 14,
      7.5,
      '#9aa48b',
      false,
      'center',
    );

    ctx.draw(false, () =>
      uni.canvasToTempFilePath({
        canvasId: POSTER_CANVAS_ID,
        width: POSTER_WIDTH,
        height,
        destWidth: POSTER_WIDTH * 3,
        destHeight: height * 3,
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
  link.download = 'AI投了么-项目评估.png';
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
      fail: (error) =>
        reject(
          new Error(
            isPrivacyRefusal(error)
              ? '未同意微信隐私指引，图片未保存。你仍可预览或分享海报。'
              : '保存失败，请在微信设置中允许保存图片；也可以长按预览图保存。',
          ),
        ),
    }),
  );
  // #endif
}
