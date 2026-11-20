import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorker, REFRESH_INTERVAL_MS } from '../src/worker.mjs';
import { parsePublishedHtml } from '../src/data.mjs';
import { callWorker } from '../src/runtime.mjs';
const data = parsePublishedHtml(await fs.readFile(new URL('./fixtures/published.html', import.meta.url), 'utf8'));
const until = async predicate => { for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 20)); } throw Error('condition timed out'); };

test('30 minute production cadence, scheduled fetch, retained cache and preference persistence', async t => {
  assert.equal(REFRESH_INTERVAL_MS, 1_800_000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-test-'));
  let calls = 0, failing = false;
  const worker = await createWorker({ directory, intervalMs: 140,
    fetcher: async () => { calls++; if (failing) throw Error('test offline'); return { data, etag: 'fixture' }; } });
  t.after(async () => { await worker.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const runtime = await worker.listen();
  await until(() => calls >= 2 && !worker.snapshot().status.refreshing);
  assert.equal((await callWorker(runtime, '/snapshot')).data.models.length, 10);
  failing = true;
  const failed = await callWorker(runtime, '/refresh', {});
  assert.equal(failed.data.roundId, data.roundId); assert.equal(failed.status.lastError.message, 'test offline');
  const prefs = { schema: 3, mode: 'rainbow', accent: '#8b52c1', appearance: 'dark', selected: ['demo-09'], preset: 'manual', selection: 'demo-09:1' };
  await callWorker(runtime, '/preferences', prefs);
  assert.deepEqual((await callWorker(runtime, '/snapshot')).preferences, prefs);
  await assert.rejects(() => callWorker(runtime, '/preferences', { ...prefs, selected: [] }), /至少/);
  assert.deepEqual((await callWorker(runtime, '/snapshot')).preferences, prefs);
  const unauth = await fetch(`http://127.0.0.1:${runtime.port}/snapshot`); assert.equal(unauth.status, 401);
  const hostile = await fetch(`http://127.0.0.1:${runtime.port}/snapshot`, { headers: { Origin: 'https://untrusted.example', Authorization: `Bearer ${runtime.token}` } }); assert.equal(hostile.status, 403);
  await worker.close();
  const restored = await createWorker({ directory, fetcher: async () => { throw Error('still offline'); } });
  t.after(() => restored.close());
  assert.equal(restored.snapshot().data.roundId, data.roundId);
  assert.deepEqual(restored.snapshot().preferences, prefs);
});
