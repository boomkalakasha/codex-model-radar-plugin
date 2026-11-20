import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { callWorker, ensureWorker } from './runtime.mjs';

const UI_URI = 'ui://codex-model-radar/panel.html';
const title = '模型雷达';
export async function createMcpServer({ runtime, htmlFile }) {
  const server = new McpServer({ name: 'codex-model-radar', version: '1.0.1' });
  const result = payload => ({ content: [{ type: 'text', text: payload.data ? `${payload.data.models.length} 个模型，${payload.data.configurations} 档；来源 ${payload.data.sourceUrl}` : '数据暂不可用，界面提供状态与重试。' }], structuredContent: payload });
  const read = async () => result(await callWorker(runtime, '/snapshot'));
  registerAppTool(server, 'open_radar', {
    title, description: '打开模型雷达侧面板，显示已发布的模型智商、费用和耗时矩阵。', inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['app', 'model'] }, 'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } },
  }, read);
  registerAppTool(server, 'read_radar', {
    title: '读取雷达缓存', description: '读取本机缓存与刷新状态，不调用模型。', inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, read);
  registerAppTool(server, 'refresh_radar', {
    title: '刷新雷达数据', description: '从公开来源重新拉取，失败时保留上次数据。', inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    _meta: { ui: { visibility: ['app'] } },
  }, async () => result(await callWorker(runtime, '/refresh', {})));
  registerAppTool(server, 'save_preferences', {
    title: '保存模型雷达偏好', description: '仅保存本插件的配色和默认模型偏好。', inputSchema: z.object({ preferences: z.record(z.string(), z.unknown()) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, async ({ preferences }) => {
    const saved = await callWorker(runtime, '/preferences', preferences);
    return { content: [{ type: 'text', text: '模型雷达偏好已保存。' }], structuredContent: saved };
  });
  registerAppResource(server, 'radar-panel', UI_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(htmlFile, 'utf8'),
      _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
        'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'inline' } } }],
  }));
  return server;
}
export async function serve() {
  const runtime = await ensureWorker();
  const server = await createMcpServer({ runtime, htmlFile: path.join(path.dirname(path.resolve(process.argv[1])), 'app.html') });
  await server.connect(new StdioServerTransport());
}
