import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchPublished } from './data.mjs';
import { readJson, writeJson, validatePreferences } from './store.mjs';

export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export async function createWorker({ directory, fetcher = fetchPublished, intervalMs = REFRESH_INTERVAL_MS, now = Date.now } = {}) {
  await fs.mkdir(directory, { recursive: true });
  const cacheFile = path.join(directory, 'cache.json');
  let cache = await readJson(cacheFile, {});
  if (cache?.data?.schema !== 1 || !Array.isArray(cache?.data?.models)) cache = {};
  let preferences = await readJson(path.join(directory, 'preferences.json'));
  const token = crypto.randomBytes(32).toString('hex');
  let busy = null, timer = null, stopped = false, runtime, writeQueue = Promise.resolve();
  let nextRefreshAt = cache.checkedAt ? Date.parse(cache.checkedAt) + intervalMs : now();
  if (!Number.isFinite(nextRefreshAt)) nextRefreshAt = now();
  const iso = () => new Date(now()).toISOString();
  const snapshot = () => ({
    data: cache.data || null, preferences,
    status: { running: true, refreshing: !!busy, intervalMs, nextRefreshAt: new Date(nextRefreshAt).toISOString(),
      checkedAt: cache.checkedAt || null, lastSuccessAt: cache.lastSuccessAt || null,
      lastError: cache.lastError || null, stale: !!cache.lastError || !cache.lastSuccessAt || now() - Date.parse(cache.lastSuccessAt) > intervalMs * 2 },
  });
  async function log(event) {
    const logFile = path.join(directory, 'events.json');
    const history = await readJson(logFile, []);
    await writeJson(logFile, [...history.slice(-199), { at: iso(), ...event }]);
  }
  async function refresh(reason = 'manual') {
    if (busy) return busy;
    busy = (async () => {
      try {
        const fetched = await fetcher({ etag: cache.etag, lastModified: cache.lastModified, signal: AbortSignal.timeout(30_000) });
        if (fetched.unchanged && !cache.data) throw new Error('数据源返回未变化，但本地无可用缓存');
        cache = { ...cache, data: fetched.data || cache.data, etag: fetched.etag ?? cache.etag,
          lastModified: fetched.lastModified ?? cache.lastModified, checkedAt: iso(), lastSuccessAt: iso(), lastError: null };
        await writeJson(cacheFile, cache);
        await log({ type: 'refresh_success', reason, unchanged: !!fetched.unchanged,
          roundId: cache.data.roundId, configurations: cache.data.configurations });
      } catch (error) {
        cache = { ...cache, checkedAt: iso(), lastError: { at: iso(), message: String(error.message).slice(0, 300) } };
        await writeJson(cacheFile, cache);
        await log({ type: 'refresh_error', reason, message: cache.lastError.message, retainedData: !!cache.data });
      } finally { nextRefreshAt = now() + intervalMs; busy = null; }
      return snapshot();
    })();
    return busy;
  }
  function schedule() {
    if (stopped) return;
    timer = setTimeout(async () => {
      if (now() >= nextRefreshAt) await refresh('scheduled');
      schedule();
    }, Math.max(50, Math.min(60_000, nextRefreshAt - now())));
  }
  async function body(req) {
    let text = '';
    for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 32_768) throw new Error('请求过大'); }
    return text ? JSON.parse(text) : {};
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const expectedHost = `127.0.0.1:${server.address()?.port}`;
    if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)) {
      res.writeHead(403); res.end(JSON.stringify({ error: '仅限本机模型雷达客户端' })); return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401); res.end(JSON.stringify({ error: '需要本机服务授权' })); return;
    }
    try {
      const route = req.url.split('?')[0];
      if (req.method === 'GET' && route === '/status') res.end(JSON.stringify({ name: 'codex-model-radar', version: '1.0.1', ...snapshot().status }));
      else if (req.method === 'GET' && route === '/snapshot') {
        if (!cache.data && busy) await busy;
        res.end(JSON.stringify(snapshot()));
      } else if (req.method === 'POST' && route === '/refresh') res.end(JSON.stringify(await refresh('manual')));
      else if (req.method === 'POST' && route === '/preferences') {
        const next = validatePreferences(await body(req), cache.data);
        writeQueue = writeQueue.catch(() => {}).then(async () => {
          await writeJson(path.join(directory, 'preferences.json'), next); preferences = next;
        });
        await writeQueue;
        res.end(JSON.stringify({ preferences }));
      } else if (req.method === 'POST' && route === '/shutdown') {
        res.end(JSON.stringify({ stopped: true })); setTimeout(() => close(), 30);
      } else { res.writeHead(404); res.end(JSON.stringify({ error: '未找到入口' })); }
    } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: String(error.message).slice(0, 300) })); }
  });
  async function listen() {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    runtime = { pid: process.pid, port: server.address().port, token, startedAt: iso(), version: '1.0.1', intervalMs };
    await writeJson(path.join(directory, 'runtime.json'), runtime);
    if (nextRefreshAt <= now()) refresh('startup');
    schedule();
    return runtime;
  }
  async function close() {
    stopped = true; clearTimeout(timer);
    await busy?.catch(() => {});
    if (server.listening) await new Promise(resolve => server.close(resolve));
    const saved = await readJson(path.join(directory, 'runtime.json'));
    if (saved?.token === token) await fs.unlink(path.join(directory, 'runtime.json')).catch(() => {});
  }
  return { listen, close, refresh, snapshot };
}
