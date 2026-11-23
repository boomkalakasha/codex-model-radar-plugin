import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createWorker } from '../src/worker.mjs';
import { parsePublishedHtml } from '../src/data.mjs';
import { callWorker, createWorkerClient } from '../src/runtime.mjs';
import { writeJson, readJson } from '../src/store.mjs';

const data = parsePublishedHtml(await fs.readFile(new URL('./fixtures/published.html', import.meta.url), 'utf8'));
const prefs = { schema: 3, mode: 'soft', accent: '#000000', appearance: 'system', selected: [data.models[0].id], preset: 'manual', selection: '' };
async function stopDetached(directory) {
  const runtime = await readJson(path.join(directory, 'runtime.json')).catch(() => null);
  if (runtime) await callWorker(runtime, '/shutdown', {}).catch(() => {});
  for (let i = 0; i < 100; i++) {
    if (!await fs.stat(path.join(directory, 'runtime.json')).catch(() => null)) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('test worker did not shut down');
}
async function connect(directory) {
  const client = new Client({ name: 'radar-recovery-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.resolve('plugin/dist/mcp-server.cjs')], env: { ...process.env, CODEX_RADAR_HOME: directory }, stderr: 'pipe' }));
  return client;
}

test('the same MCP connection rediscovers a replacement worker with a new port and token', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-reconnect-'));
  let worker = await createWorker({ directory, fetcher: async () => ({ data }) });
  await worker.listen();
  await worker.refresh();
  const client = new Client({ name: 'radar-reconnect-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.resolve('plugin/dist/mcp-server.cjs')], env: { ...process.env, CODEX_RADAR_HOME: directory }, stderr: 'pipe' });
  t.after(async () => { await client.close(); await worker.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await client.connect(transport);
  const first = await client.callTool({ name: 'open_radar', arguments: {} });
  assert.equal(first.structuredContent?.data?.configurations, 58);
  await worker.close();
  worker = await createWorker({ directory, fetcher: async () => ({ data }) });
  await worker.listen();
  const recovered = await client.callTool({ name: 'read_radar', arguments: {} });
  assert.notEqual(recovered.isError, true);
  assert.equal(recovered.structuredContent?.data?.roundId, data.roundId);
  assert.equal(recovered.structuredContent?.status?.running, true);
});

test('a cold snapshot is available while the initial source fetch is still pending', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-cold-'));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const worker = await createWorker({ directory, fetcher: async () => { await pending; return { data }; } });
  const runtime = await worker.listen();
  t.after(async () => { release(); await worker.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let timeout;
  try {
    const snapshot = await Promise.race([callWorker(runtime, '/snapshot'), new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('initial fetch blocked the panel snapshot')), 1500);
    })]);
    assert.equal(snapshot.data, null);
    assert.equal(snapshot.status.refreshing, true);
  } finally { clearTimeout(timeout); }
});

test('the same MCP connection starts a new worker after its original worker exits', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-restart-'));
  const worker = await createWorker({ directory, fetcher: async () => ({ data }) });
  const original = await worker.listen();
  await worker.refresh();
  const client = await connect(directory);
  t.after(async () => { await client.close(); await worker.close(); await stopDetached(directory); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal((await client.callTool({ name: 'open_radar', arguments: {} })).structuredContent.data.roundId, data.roundId);
  await worker.close();
  const results = await Promise.all(Array.from({ length: 3 }, () => client.callTool({ name: 'read_radar', arguments: {} })));
  for (const result of results) {
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.data.roundId, data.roundId);
    assert.equal(result.structuredContent.status.running, true);
  }
  const replacement = await readJson(path.join(directory, 'runtime.json'));
  assert.notEqual(replacement.token, original.token);
  assert.notEqual(replacement.pid, process.pid);
});

test('UI and cached data remain available when worker startup fails, then recover without reconnecting MCP', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-fallback-'));
  const checkedAt = new Date().toISOString();
  await writeJson(path.join(directory, 'cache.json'), { data, checkedAt, lastSuccessAt: checkedAt });
  await writeJson(path.join(directory, 'preferences.json'), prefs);
  // A directory in place of the runtime file is a deterministic local startup failure.
  await fs.mkdir(path.join(directory, 'runtime.json'));
  const client = await connect(directory);
  t.after(async () => { await client.close(); await stopDetached(directory); await fs.rm(directory, { recursive: true, force: true }); });
  const resource = await client.readResource({ uri: 'ui://codex-model-radar/panel.html' });
  assert.ok(resource.contents[0].text.includes('id="retry"'));
  const fallback = await client.callTool({ name: 'open_radar', arguments: {} });
  assert.notEqual(fallback.isError, true);
  assert.equal(fallback.structuredContent.data.roundId, data.roundId);
  assert.equal(fallback.structuredContent.status.running, false);
  assert.equal(fallback.structuredContent.status.checkedAt, checkedAt);
  assert.ok(fallback.structuredContent.status.serviceError.message.includes('重连'));
  const save = await client.callTool({ name: 'save_preferences', arguments: { preferences: { ...prefs, appearance: 'dark' } } });
  assert.equal(save.isError, true);
  assert.deepEqual(await readJson(path.join(directory, 'preferences.json')), prefs);
  await fs.rmdir(path.join(directory, 'runtime.json'));
  const recovered = await client.callTool({ name: 'read_radar', arguments: {} });
  assert.equal(recovered.structuredContent.status.running, true);
  assert.equal(recovered.structuredContent.status.serviceError, undefined);
  assert.equal(recovered.structuredContent.data.roundId, data.roundId);
});

test('rotated authentication is rediscovered while preference validation errors stay final', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-auth-'));
  const worker = await createWorker({ directory, fetcher: async () => ({ data }) });
  const runtime = await worker.listen();
  await worker.refresh();
  t.after(async () => { await worker.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const request = createWorkerClient({ directory, runtime: { ...runtime, token: '0'.repeat(64) } });
  assert.equal((await request('/snapshot')).data.roundId, data.roundId);
  await assert.rejects(() => request('/preferences', { ...prefs, selected: [] }), /至少/);
  assert.deepEqual(await readJson(path.join(directory, 'runtime.json')), runtime);
});
