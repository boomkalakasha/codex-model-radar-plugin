import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readJson } from './store.mjs';

export function dataDirectory() {
  return path.resolve(process.env.CODEX_RADAR_HOME || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'model-radar'));
}
export async function callWorker(runtime, route, body, { timeoutMs = 45_000 } = {}) {
  if (!Number.isInteger(runtime?.port) || runtime.port < 1 || runtime.port > 65535 || !/^[a-f0-9]{64}$/.test(runtime.token || '')) {
    throw new Error('本地数据服务连接信息无效');
  }
  const response = await fetch(`http://127.0.0.1:${runtime.port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `本地数据服务 HTTP ${response.status}`), { status: response.status });
  return result;
}
export function createWorkerClient({ directory = dataDirectory(), workerFile, runtime } = {}) {
  let current = runtime, connecting;
  const connect = () => {
    if (!connecting) {
      connecting = ensureWorker(directory, workerFile).then(next => { current = next; return next; })
        .finally(() => { connecting = null; });
    }
    return connecting;
  };
  return async (route, body) => {
    const target = current || await connect();
    const options = { timeoutMs: route === '/snapshot' ? 5_000 : 45_000 };
    try { return await callWorker(target, route, body, options); }
    catch (error) {
      // Validation errors are final. A vanished worker or rotated token can be rediscovered.
      if (error.status && error.status !== 401) throw error;
      if (current === target) current = null;
      const next = current || await connect();
      return callWorker(next, route, body, options);
    }
  };
}
async function healthy(runtime) {
  if (!runtime) return false;
  try { return (await callWorker(runtime, '/status', undefined, { timeoutMs: 1_000 })).name === 'codex-model-radar'; }
  catch { return false; }
}
export async function ensureWorker(directory = dataDirectory(), workerFile = path.join(path.dirname(path.resolve(process.argv[1])), 'worker.cjs')) {
  const runtimeFile = path.join(directory, 'runtime.json');
  const current = await readJson(runtimeFile);
  if (await healthy(current)) return current;
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
      const existing = await readJson(runtimeFile);
      if (await healthy(existing)) return existing;
      await fs.access(workerFile);
      const child = spawn(process.execPath, [workerFile, '--data-dir', directory], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CODEX_RADAR_HOME: directory } });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      await lock.writeFile(String(child.pid));
      for (let i = 0; i < 100; i++) {
        const next = await readJson(runtimeFile);
        if (await healthy(next)) return next;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('模型雷达数据进程启动超时');
    } finally { await lock.close(); await fs.unlink(lockPath).catch(() => {}); }
  }
  for (let i = 0; i < 100; i++) {
    const next = await readJson(runtimeFile);
    if (await healthy(next)) return next;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('等待模型雷达数据进程超时');
}
