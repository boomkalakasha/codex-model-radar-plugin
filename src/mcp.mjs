import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { createWorkerClient, dataDirectory } from './runtime.mjs';
import { readJson } from './store.mjs';
import { REFRESH_INTERVAL_MS } from './worker.mjs';

const UI_URI = 'ui://codex-model-radar/panel.html';
const title = '模型雷达';
export async function createMcpServer({ runtime, directory = dataDirectory(), workerFile, htmlFile }) {
  const server = new McpServer({ name: 'codex-model-radar', version: '1.0.2' });
  const request = createWorkerClient({ runtime, directory, workerFile });
  const result = payload => ({ content: [{ type: 'text', text: payload.data ? `${payload.data.models.length} 个模型，${payload.data.configurations} 档；来源 ${payload.data.sourceUrl}` : '数据暂不可用，界面提供状态与重试。' }], structuredContent: payload });
  async function snapshot(route = '/snapshot', body) {
    try { return result(await request(route, body)); }
    catch {
      // Keep the UI loadable even if the worker cannot start. Never report a failed preference write as saved.
      const stored = await readJson(path.join(directory, 'cache.json'), {}).catch(() => null);
      const cache = stored && typeof stored === 'object' ? stored : {};
      const preferences = await readJson(path.join(directory, 'preferences.json')).catch(() => null);
      return result({ data: cache?.data?.schema === 1 && Array.isArray(cache.data.models) ? cache.data : null, preferences,
        status: { running: false, refreshing: false, stale: true, intervalMs: REFRESH_INTERVAL_MS, nextRefreshAt: null,
          checkedAt: cache.checkedAt || null, lastSuccessAt: cache.lastSuccessAt || null, lastError: cache.lastError || null,
          serviceError: { at: new Date().toISOString(), message: '本地数据服务暂不可用，将自动重连；也可点击刷新重试。' },
        } });
    }
  }
  const read = () => snapshot();
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
  }, () => snapshot('/refresh', {}));
  registerAppTool(server, 'save_preferences', {
    title: '保存模型雷达偏好', description: '仅保存本插件的配色和默认模型偏好。', inputSchema: z.object({ preferences: z.record(z.string(), z.unknown()) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { visibility: ['app'] } },
  }, async ({ preferences }) => {
    const saved = await request('/preferences', preferences);
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
  const server = await createMcpServer({ htmlFile: path.join(path.dirname(path.resolve(process.argv[1])), 'app.html') });
  await server.connect(new StdioServerTransport());
}
