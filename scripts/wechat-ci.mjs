import { readFile, access, mkdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift();
const options = {};
const allowed = new Set(['version', 'desc', 'robot', 'output']);
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--') || !allowed.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error(`Invalid option: ${args[i]}`);
  }
  options[name] = args[i + 1];
}
if (!['check', 'preview', 'upload'].includes(command)) {
  throw new Error('Usage: node scripts/wechat-ci.mjs check|preview|upload [--version 0.1.0] [--desc description] [--robot 1] [--output path]');
}

try {
  const manifest = JSON.parse(await readFile(join(root, 'apps/miniprogram/src/manifest.json'), 'utf8'));
  const appid = manifest['mp-weixin']?.appid;
  if (!/^wx[0-9a-f]{16}$/.test(appid || '')) throw new Error('Configure mp-weixin.appid in manifest.json first.');
  const privateKeyPath = process.env.WECHAT_CI_PRIVATE_KEY_PATH || join(homedir(), '.config/pitch-coach/wechat', `private.${appid}.key`);
  await access(privateKeyPath, constants.R_OK).catch(() => {
    throw new Error(`No readable upload key for ${appid}. Expected ${privateKeyPath}. Check the AppID, or set WECHAT_CI_PRIVATE_KEY_PATH.`);
  });
  const keyStat = await stat(privateKeyPath);
  if (process.platform !== 'win32' && (keyStat.mode & 0o077)) {
    throw new Error('Upload key must be private. Run chmod 600 on the key file.');
  }
  const keyMatch = /private\.(wx[0-9a-f]{16})\.key$/.exec(privateKeyPath);
  if (keyMatch && keyMatch[1] !== appid) throw new Error('Upload key filename and manifest AppID do not match.');
  const robot = Number(options.robot || process.env.WECHAT_CI_ROBOT || 1);
  if (!Number.isInteger(robot) || robot < 1 || robot > 30) throw new Error('Robot must be an integer from 1 to 30.');
  console.log(`AppID: ${appid}\nPrivate key: ${privateKeyPath}\nRobot: ${robot}`);
  if (command === 'check') {
    console.log('Local configuration checked. No request sent to WeChat.');
    process.exit(0);
  }
  // Always build fresh output to avoid uploading a previous AppID or environment.
  const build = spawnSync('pnpm', ['build:weixin'], { cwd: root, stdio: 'inherit', env: process.env });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error('WeChat build failed. Nothing uploaded.');
  const projectPath = join(root, 'apps/miniprogram/dist/build/mp-weixin');
  const projectConfig = JSON.parse(await readFile(join(projectPath, 'project.config.json'), 'utf8'));
  if (projectConfig.appid !== appid) throw new Error('Built AppID does not match manifest. Nothing uploaded.');
  const { default: ci } = await import('miniprogram-ci');
  const project = new ci.Project({ appid, type: 'miniProgram', projectPath, privateKeyPath, ignores: ['node_modules/**/*'] });
  const common = {
    project, robot, threads: 2,
    desc: options.desc || 'AI投了么 CI',
    setting: { useProjectConfig: true },
  };
  if (command === 'preview') {
    const qrcodeOutputDest = resolve(root, options.output || '.artifacts/wechat/preview.jpg');
    await mkdir(dirname(qrcodeOutputDest), { recursive: true });
    const result = await ci.preview({ ...common, qrcodeFormat: 'image', qrcodeOutputDest });
    console.log(`Preview succeeded: ${qrcodeOutputDest}`);
    console.log(JSON.stringify({ subPackageInfo: result?.subPackageInfo }));
  } else {
    const version = options.version || manifest.versionName;
    if (!version) throw new Error('Upload requires --version or manifest.versionName.');
    const result = await ci.upload({ ...common, version });
    console.log(`Upload succeeded: ${version}. Review and release are separate steps.`);
    console.log(JSON.stringify({ subPackageInfo: result?.subPackageInfo }));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'WeChat CI failed.';
  console.error(message);
  if (message.includes('invalid ip')) {
    console.error('Add the IP reported above to WeChat > Development settings > Code upload > IP whitelist, then retry.');
  }
  process.exitCode = 1;
}
// The official SDK keeps compiler workers alive after completing a request.
process.exit(process.exitCode || 0);
