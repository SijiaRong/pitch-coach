import { Worker } from 'node:worker_threads';
import { fork } from 'node:child_process';
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
      const entry = new URL(isSource ? './parse-worker.ts' : './parse-worker.js', import.meta.url);
      const execArgv = isSource
        ? ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href]
        : [];
      // Native PDF canvas bindings are not safe to unload from a Windows worker thread.
      // A bounded child process keeps that native lifetime outside the API process.
      const child =
        process.platform === 'win32' && extension === '.pdf'
          ? fork(entry, {
              execArgv: ['--max-old-space-size=256', ...execArgv],
              serialization: 'advanced',
              stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
              windowsHide: true,
            })
          : undefined;
      const worker =
        child ||
        new Worker(entry, {
          workerData: { buffer, extension },
          execArgv,
          resourceLimits: { maxOldGenerationSizeMb: 256 },
        });
      const terminate = () => (child ? child.kill() : (worker as Worker).terminate());
      const timer = setTimeout(() => {
        void terminate();
        reject(new PublicError(422, 'PARSE_TIMEOUT', '文件解析超时，请改用精简版 BP 或粘贴文字'));
      }, 12000);
      let reported = false;
      worker.once('message', (result) => {
        reported = true;
        clearTimeout(timer);
        // The parser closes its IPC port and exits after reporting a result.
        if (result.error) reject(new PublicError(422, 'PARSE_FAILED', result.error));
        else resolve(result);
      });
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new PublicError(422, 'PARSE_FAILED', '无法解析该文件，请另存为 PDF 或粘贴文字'));
      });
      worker.once('exit', () => {
        clearTimeout(timer);
        if (!reported)
          reject(new PublicError(422, 'PARSE_FAILED', '文件解析中断，请改用精简版资料'));
      });
      child?.send({ buffer, extension });
    });
  } finally {
    active--;
  }
}
