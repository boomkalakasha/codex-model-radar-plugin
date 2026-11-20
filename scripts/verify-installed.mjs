import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readJson, writeJson } from '../src/store.mjs';
import { callWorker } from '../src/runtime.mjs';
const root = path.resolve(import.meta.dirname, '..');
const installed = await readJson(path.join(root, 'internal/install-result.json'));
assert.ok(installed?.installedPath, 'need an install record');
const artifacts = {};
for (const name of ['app.html', 'mcp-server.cjs', 'worker.cjs']) {
  const source = await fs.readFile(path.join(root, 'plugin/dist', name));
  const cached = await fs.readFile(path.join(installed.installedPath, 'dist', name));
  assert.ok(source.equals(cached), `${name} installed artifact differs from tested build`);
  artifacts[name] = crypto.createHash('sha256').update(cached).digest('hex');
}
const client = new Client({ name: 'installed-radar-check', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: installed.node, args: [path.join(installed.installedPath, 'dist/mcp-server.cjs')],
  env: { ...process.env, CODEX_RADAR_HOME: installed.dataDirectory }, stderr: 'pipe' }));
let record;
try {
  const tools = (await client.listTools()).tools;
  const open = tools.find(t => t.name === 'open_radar');
  assert.ok(open._meta['openai/ui'].entrypoints.some(e => e.type === 'thread'));
  const result = await client.callTool({ name: 'open_radar', arguments: {} });
  assert.equal(result.isError, undefined);
  const { data, status } = result.structuredContent;
  assert.ok(data.models.length > 0 && data.configurations > 0);
  assert.equal(status.intervalMs, 1_800_000);
  assert.equal(status.lastError, null);
  const ui = await client.readResource({ uri: open._meta.ui.resourceUri });
  assert.ok(ui.contents[0].text.includes('id="retry"'));
  record = { verifiedAt: new Date().toISOString(), installedPath: installed.installedPath,
    artifacts, toolNames: tools.map(t => t.name), models: data.models.length, configurations: data.configurations,
    sourceSnapshotAt: data.sourceSnapshotAt, checkedAt: status.checkedAt, intervalMs: status.intervalMs,
    entrypoints: open._meta['openai/ui'].entrypoints, uiBytes: Buffer.byteLength(ui.contents[0].text),
    nativeUiObserved: false };
} finally { await client.close(); }
const runtime = await readJson(path.join(installed.dataDirectory, 'runtime.json'));
await callWorker(runtime, '/status');
record.backgroundAliveAfterMcpClosed = true;
await writeJson(path.join(root, 'internal/installed-verification.json'), record);
console.log(JSON.stringify(record, null, 2));
