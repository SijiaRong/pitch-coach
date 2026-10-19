import { parentPort, workerData } from 'node:worker_threads';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const LIMIT = 32 * 1024 * 1024;
const MAX_TEXT = 50000;

async function readBounded(entry: JSZip.JSZipObject, remaining: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > remaining) {
        stream.pause();
        reject(new Error('文件解压后过大，请使用精简版资料'));
      } else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.resume();
  });
}

function collectText(value: unknown, output: string[], depth = 0) {
  if (depth > 100) throw new Error('文件结构过于复杂，请另存为 PDF');
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'a:t' || key === 'w:t') && Array.isArray(item)) {
      output.push(
        item.map((node: Record<string, unknown>) => String(node['#text'] ?? '')).join(''),
      );
    } else collectText(item, output, depth + 1);
  }
}

async function parse(data: { buffer: Uint8Array; extension: string }) {
  const buffer = Buffer.from(data.buffer);
  const extension = data.extension;
  let text = '';
  if (extension === '.txt' || extension === '.md')
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  else if (extension === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('文件内容不是有效 PDF');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      verbosity: 0,
    });
    try {
      const info = await parser.getInfo();
      if (info.total > 80) throw new Error('PDF 最多支持 80 页，请使用精简版 BP');
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files);
    if (entries.length > 1500) throw new Error('文件内容过多，请使用精简版 BP');
    const isPptx = extension === '.pptx';
    const targets = isPptx
      ? entries
          .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
          .sort(
            (a, b) =>
              Number(a.name.match(/slide(\d+)/)?.[1]) - Number(b.name.match(/slide(\d+)/)?.[1]),
          )
      : [zip.file('word/document.xml')].filter((entry): entry is JSZip.JSZipObject =>
          Boolean(entry),
        );
    if (!targets.length || targets.length > 80)
      throw new Error('文件不是有效的 Office 文档，或超过 80 页幻灯片');
    const xml = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: true,
      processEntities: true,
      htmlEntities: false,
      parseTagValue: false,
      trimValues: false,
    });
    let remaining = LIMIT;
    const parts: string[] = [];
    for (const target of targets) {
      const content = await readBounded(target, remaining);
      remaining -= Buffer.byteLength(content);
      // Reject custom entities and DTDs before parsing; external resources are never fetched.
      if (/<!DOCTYPE|<!ENTITY/i.test(content))
        throw new Error('文件包含不支持的 XML 声明，请另存为 PDF');
      const lines: string[] = [];
      collectText(xml.parse(content), lines);
      parts.push(lines.join('\n'));
    }
    text = parts.join('\n\n');
  }
  text = text.replace(/\0/g, '').trim();
  if (text.length < 20) throw new Error('没有提取到足够文字。扫描件或图片型 BP 请先转文字后粘贴');
  return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
}

async function run(data: { buffer: Uint8Array; extension: string }) {
  let result: { text: string; truncated: boolean } | { error: string };
  try {
    result = await parse(data);
  } catch (error) {
    const allowed =
      error instanceof Error && /文件|PDF|XML|文字|扫描|Office|UTF-8/.test(error.message);
    result = {
      error: allowed
        ? String(error.message).slice(0, 160)
        : '文件无法解析，请另存为 PDF 或直接粘贴文字',
    };
  }
  if (parentPort) {
    parentPort.postMessage(result);
    parentPort.close();
  } else process.send?.(result, () => process.disconnect());
}

if (parentPort) void run(workerData);
else process.once('message', (data: { buffer: Uint8Array; extension: string }) => void run(data));
