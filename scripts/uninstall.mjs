import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJson } from '../src/store.mjs';
import { callWorker } from '../src/runtime.mjs';
const root = path.resolve(import.meta.dirname, '..');
const installed = await readJson(path.join(root, 'internal/install-result.json'));
if (!installed) throw new Error('未找到本项目的安装记录；请在 Codex 的插件管理中卸载模型雷达');
const runtime = await readJson(path.join(installed.dataDirectory, 'runtime.json'));
if (runtime?.token) await callWorker(runtime, '/shutdown', {}).catch(() => {});
const result = spawnSync(installed.codex, ['plugin', 'remove', 'codex-model-radar@personal-radar-tools', '--json'], {
  env: { ...process.env, CODEX_HOME: installed.home }, encoding: 'utf8', windowsHide: true, timeout: 60_000,
});
if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
await fs.writeFile(path.join(root, 'internal/uninstall-result.json'), JSON.stringify({ at: new Date().toISOString(), result: JSON.parse(result.stdout) }, null, 2));
console.log('模型雷达已卸载，数据与偏好保留在：' + installed.dataDirectory);
