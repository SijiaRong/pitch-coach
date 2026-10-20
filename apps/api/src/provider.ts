import { reviewContentSchema } from '@pitchcoach/shared';
import type { Investor, ReviewContent, Submission } from '@pitchcoach/shared';
import type { Config } from './config';
import { buildMessages } from './prompts';
import { PublicError } from './errors';

export type Reviewer = (
  submission: Submission,
  investor: Investor,
  signal: AbortSignal,
) => Promise<{ content: ReviewContent; model: string }>;

export function createReviewer(config: Config, fetcher: typeof fetch = fetch): Reviewer {
  return async (submission, investor, signal) => {
    const model = config.modelFor(investor.id);
    if (!model.apiKey)
      throw new PublicError(503, 'AI_NOT_CONFIGURED', 'AI 服务尚未配置，可以先体验示例报告');
    const url = `${model.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(config.AI_TIMEOUT_MS)]),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
        body: JSON.stringify({
          model: model.model,
          messages: buildMessages(submission, investor),
          temperature: 0.55,
          // Thinking models share this budget between reasoning and the final report.
          max_tokens: config.AI_MAX_OUTPUT_TOKENS,
          ...(model.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch {
      if (signal.aborted) throw new PublicError(499, 'CANCELED', '评估已取消');
      throw new PublicError(504, 'AI_TIMEOUT', 'AI 投资人暂未完成审阅，请稍后重试');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new PublicError(
        502,
        'AI_UNAVAILABLE',
        response.status === 429
          ? 'AI 服务繁忙或额度不足，请稍后重试'
          : 'AI 服务暂不可用，请检查后台模型配置',
      );
    }
    // Bound the response before JSON decoding; never log model responses or BP content.
    const reader = response.body?.getReader();
    if (!reader) throw new PublicError(502, 'AI_INVALID_RESPONSE', 'AI 返回了空结果，请重试');
    let body = '',
      bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 256000) {
          await reader.cancel();
          throw new Error();
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      const envelope = JSON.parse(body);
      const choice = envelope.choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
        throw new Error();
      const raw = choice.message.content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '');
      const content = reviewContentSchema.parse(JSON.parse(raw));
      return { content, model: model.model };
    } catch {
      throw new PublicError(502, 'AI_INVALID_RESPONSE', 'AI 结果未通过格式与证据校验，请重试');
    }
  };
}
