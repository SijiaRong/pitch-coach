import { backup, DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  appendFile,
  chmod,
  link,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import { paymentKey } from './payment-codec';

const MAGIC = Buffer.from('PCB2');
const BACKUP_NAME = /^ledger-[0-9TZ]+-[a-f0-9]{8}\.sqlite\.gz\.enc$/;
function checkSnapshot(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    const result = db.prepare('PRAGMA quick_check').all();
    if (
      version !== 2 ||
      result.length !== 1 ||
      Object.values(result[0])[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Payment backup integrity check failed');
  } finally {
    db.close();
  }
}
async function syncFile(path: string) {
  const file = await open(path, 'r+');
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Uses SQLite online backup, not a live-file copy that could omit WAL transactions. */
export async function backupPayments(path: string, secret: string, directory: string, keep = 3) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 30) throw new Error('Invalid backup retention');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  // Only remove our own abandoned working files older than one day.
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (
      !/^\.snapshot-[A-Za-z0-9]{6}$/.test(item.name) &&
      !/^\.ledger-[0-9TZ]+-[a-f0-9]{8}\.partial$/.test(item.name)
    )
      continue;
    const candidate = join(directory, item.name);
    if ((await stat(candidate)).mtimeMs < Date.now() - 86400000)
      await rm(candidate, { recursive: true, force: true });
  }
  const working = await mkdtemp(join(directory, '.snapshot-'));
  await chmod(working, 0o700);
  const name = `ledger-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`;
  const partial = join(directory, `.${name}.partial`);
  const final = join(directory, `${name}.sqlite.gz.enc`);
  try {
    const snapshot = join(working, 'ledger.sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      await backup(db, snapshot, { rate: 64 });
    } finally {
      db.close();
    }
    await chmod(snapshot, 0o600);
    checkSnapshot(snapshot);
    const nonce = randomBytes(12);
    const header = Buffer.concat([MAGIC, nonce]);
    const cipher = createCipheriv('aes-256-gcm', paymentKey(secret, 'backup'), nonce);
    cipher.setAAD(header);
    await writeFile(partial, header, { flag: 'wx', mode: 0o600 });
    await pipeline(
      createReadStream(snapshot),
      createGzip({ level: 6 }),
      cipher,
      createWriteStream(partial, { flags: 'a' }),
    );
    await appendFile(partial, cipher.getAuthTag());
    await syncFile(partial);
    await rename(partial, final);
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && BACKUP_NAME.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const file of files.slice(keep)) await rm(join(directory, file));
    return final;
  } finally {
    await rm(partial, { force: true });
    await rm(working, { recursive: true, force: true });
  }
}

/** Always restores to a new file; failed authentication leaves no usable output. */
export async function restorePayments(source: string, secret: string, target: string) {
  const size = (await stat(source)).size;
  if (size < 33) throw new Error('Invalid payment backup');
  const input = await open(source, 'r');
  const header = Buffer.alloc(16),
    tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, 16, 0);
    await input.read(tag, 0, 16, size - 16);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, 4).equals(MAGIC)) throw new Error('Unknown payment backup format');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const working = await mkdtemp(join(dirname(target), '.restore-'));
  await chmod(working, 0o700);
  try {
    const output = join(working, 'ledger.sqlite');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      paymentKey(secret, 'backup'),
      header.subarray(4),
    );
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        done(
          bytes > 1024 * 1024 * 1024
            ? new Error('Payment restore exceeds 1 GiB safety limit')
            : null,
          chunk,
        );
      },
    });
    await pipeline(
      createReadStream(source, { start: 16, end: size - 17 }),
      decipher,
      createGunzip(),
      limit,
      createWriteStream(output, { flags: 'wx', mode: 0o600 }),
    );
    await syncFile(output);
    checkSnapshot(output);
    await link(output, target); // Atomic EEXIST instead of overwriting any existing database.
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}
