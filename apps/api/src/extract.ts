import { Worker } from 'node:worker_threads';
import { extname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PublicError } from './errors';

let active = 0;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function extractDocument(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; truncated: boolean }> {
  const extension = extname(filename).toLowerCase();
  if (!['.pdf', '.pptx', '.docx', '.txt', '.md'].includes(extension))
    throw new PublicError(415, 'UNSUPPORTED_FILE', '支持 PDF、PPTX、DOCX、TXT 和 Markdown 文件');
  if (buffer.length > MAX_FILE_BYTES)
    throw new PublicError(413, 'FILE_TOO_LARGE', '文件不能超过 10 MB');
  if (active >= 2) throw new PublicError(429, 'PARSER_BUSY', '资料解析中，请稍后重试');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const isSource = import.meta.url.endsWith('.ts');
      const worker = new Worker(
        new URL(isSource ? './parse-worker.ts' : './parse-worker.js', import.meta.url),
        {
          workerData: { buffer, extension },
          ...(isSource
            ? {
                execArgv: [
                  '--import',
                  pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href,
                ],
              }
            : {}),
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        },
      );
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new PublicError(422, 'PARSE_TIMEOUT', '文件解析超时，请改用精简版 BP 或粘贴文字'));
      }, 12000);
      worker.once('message', (result) => {
        clearTimeout(timer);
        void worker.terminate();
        if (result.error) reject(new PublicError(422, 'PARSE_FAILED', result.error));
        else resolve(result);
      });
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new PublicError(422, 'PARSE_FAILED', '无法解析该文件，请另存为 PDF 或粘贴文字'));
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0)
          reject(new PublicError(422, 'PARSE_FAILED', '文件解析中断，请改用精简版资料'));
      });
    });
  } finally {
    active--;
  }
}
