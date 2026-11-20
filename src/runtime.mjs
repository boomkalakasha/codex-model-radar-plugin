import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readJson } from './store.mjs';

export function dataDirectory() {
  return path.resolve(process.env.CODEX_RADAR_HOME || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'model-radar'));
}
export async function callWorker(runtime, route, body) {
  const response = await fetch(`http://127.0.0.1:${runtime.port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `本地数据服务 HTTP ${response.status}`);
  return result;
}
export async function ensureWorker(directory = dataDirectory(), workerFile = path.join(path.dirname(path.resolve(process.argv[1])), 'worker.cjs')) {
  const runtimeFile = path.join(directory, 'runtime.json');
  const current = await readJson(runtimeFile);
  if (current?.token && current.port) {
    try { await callWorker(current, '/status'); return current; } catch {}
  }
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, 'start.lock');
  let lock;
  try { lock = await fs.open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = await fs.stat(lockPath).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > 30_000) { await fs.unlink(lockPath).catch(() => {}); return ensureWorker(directory, workerFile); }
  }
  if (lock) {
    try {
      const child = spawn(process.execPath, [workerFile, '--data-dir', directory], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CODEX_RADAR_HOME: directory } });
      child.unref();
      await lock.writeFile(String(child.pid));
      for (let i = 0; i < 100; i++) {
        const next = await readJson(runtimeFile);
        if (next?.token) { try { await callWorker(next, '/status'); return next; } catch {} }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('模型雷达数据进程启动超时');
    } finally { await lock.close(); await fs.unlink(lockPath).catch(() => {}); }
  }
  for (let i = 0; i < 100; i++) {
    const next = await readJson(runtimeFile);
    if (next?.token) { try { await callWorker(next, '/status'); return next; } catch {} }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('等待模型雷达数据进程超时');
}
