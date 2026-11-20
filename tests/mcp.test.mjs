import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createWorker } from '../src/worker.mjs';
import { parsePublishedHtml } from '../src/data.mjs';

test('installed entrypoint contract and UI resource work over a real MCP stdio connection', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'model-radar-mcp-'));
  const data = parsePublishedHtml(await fs.readFile(new URL('./fixtures/published.html', import.meta.url), 'utf8'));
  const worker = await createWorker({ directory, fetcher: async () => ({ data }) }); await worker.listen();
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('plugin/dist/mcp-server.cjs')], env: { ...process.env, CODEX_RADAR_HOME: directory }, stderr: 'pipe' });
  const client = new Client({ name: 'radar-test', version: '1.0.0' });
  t.after(async () => { await client.close(); await worker.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await client.connect(transport);
  const list = await client.listTools();
  const open = list.tools.find(tool => tool.name === 'open_radar');
  assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  const result = await client.callTool({ name: 'open_radar', arguments: {} });
  assert.equal(result.structuredContent.data.configurations, 58);
  const resource = await client.readResource({ uri: 'ui://codex-model-radar/panel.html' });
  assert.ok(resource.contents[0].text.includes('id="radar-float-v2"'));
  assert.ok(resource.contents[0].text.length < 1_000_000);
  assert.ok(!resource.contents[0]._meta['openai/ui'].availableDisplayModes.includes('pip'));
});
