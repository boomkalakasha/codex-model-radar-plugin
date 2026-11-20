import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ensureWorker, callWorker } from '../src/runtime.mjs';
import { writeJson } from '../src/store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const codex = option('--codex-bin') || process.env.CODEX_NATIVE_BIN;
if (!codex || !path.isAbsolute(codex)) throw new Error('请通过 Install.ps1 安装，或用 --codex-bin 指定 Codex 原生 CLI 的绝对路径');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更新版本');
const home = path.resolve(option('--codex-home') || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const directory = path.join(home, 'model-radar');
const env = { ...process.env, CODEX_HOME: home };
function cli(...command) {
  const run = spawnSync(codex, [...command, '--json'], { env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (run.error || run.status !== 0) throw new Error(`Codex ${command.slice(0, 2).join(' ')} 失败：${run.error?.message || run.stderr?.trim().slice(0, 500)}`);
  try { return JSON.parse(run.stdout); } catch { throw new Error('Codex 未返回可识别的安装结果'); }
}
for (const name of ['app.html', 'mcp-server.cjs', 'worker.cjs']) await fs.access(path.join(root, 'plugin/dist', name));
await fs.mkdir(home, { recursive: true });
await fs.mkdir(path.join(root, 'internal'), { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, 'internal', `config-before-install-${timestamp}.toml`);
let configBackup = null;
try { await fs.copyFile(path.join(home, 'config.toml'), backup); configBackup = backup; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const marketplace = cli('plugin', 'marketplace', 'add', root);
if (marketplace.marketplaceName !== 'personal-radar-tools') throw new Error('插件源名称不一致，停止安装');
const installed = cli('plugin', 'add', 'codex-model-radar@personal-radar-tools');
if (!installed.installedPath) throw new Error('Codex 未返回插件安装目录');
const installedPath = path.resolve(installed.installedPath);
const cacheRoot = path.join(home, 'plugins', 'cache') + path.sep;
if (!installedPath.toLowerCase().startsWith(cacheRoot.toLowerCase())) throw new Error('安装结果不在目标实例的插件缓存目录内');
await writeJson(path.join(installedPath, '.mcp.json'), { mcpServers: { radar: {
  command: process.execPath, args: [path.join(installedPath, 'dist/mcp-server.cjs')],
  env: { CODEX_RADAR_HOME: directory }, startup_timeout_sec: 45, tool_timeout_sec: 60,
} } });
const runtime = await ensureWorker(directory, path.join(installedPath, 'dist/worker.cjs'));
const snapshot = await callWorker(runtime, '/snapshot');
const listing = cli('plugin', 'list', '--marketplace', 'personal-radar-tools');
const record = {
  installedAt: new Date().toISOString(), home, codex, node: process.execPath,
  installedPath, dataDirectory: directory, configBackup,
  deepLink: 'codex://plugins/codex-model-radar@personal-radar-tools/app/open_radar',
  models: snapshot.data?.models.length || 0, configurations: snapshot.data?.configurations || 0,
  intervalMs: snapshot.status.intervalMs, checkedAt: snapshot.status.checkedAt,
  nextRefreshAt: snapshot.status.nextRefreshAt, lastError: snapshot.status.lastError,
};
await writeJson(path.join(root, 'internal/install-result.json'), record);
await writeJson(path.join(root, 'internal/plugin-list.json'), listing);
await fs.writeFile(path.join(root, '打开模型雷达.url'), `[InternetShortcut]\r\nURL=${record.deepLink}\r\n`);
console.log(JSON.stringify(record, null, 2));
