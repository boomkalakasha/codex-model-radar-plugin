import { App } from '@modelcontextprotocol/ext-apps';
import { createIcons, SquareTerminal, SquarePen, Folder, Blocks, Radar, RefreshCw, Sun, Moon,
  SlidersHorizontal, Maximize2, Minimize2, X, Palette, Rainbow, Zap, Clock3, ExternalLink,
  ChevronUp, ChevronDown, Crosshair, MousePointer2 } from 'lucide';
import { mountRadar } from './view.mjs';

window.lucide = { createIcons: options => createIcons({ ...options, icons: { SquareTerminal, SquarePen, Folder, Blocks, Radar,
  RefreshCw, Sun, Moon, SlidersHorizontal, Maximize2, Minimize2, X, Palette, Rainbow, Zap,
  Clock3, ExternalLink, ChevronUp, ChevronDown, Crosshair, MousePointer2 } }) };
const client = new App({ name: 'Model Radar', version: '1.0.1' }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: true });
let view, hostTheme, saveTimer, savePending = [], initial = false;
const errorNode = document.getElementById('loading');
const retryNode = document.getElementById('retry');
const normalize = data => ({ ...data, time: data.sourceSnapshotAt ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(data.sourceSnapshotAt)) : '来源未标注' });
async function tool(name, args = {}) {
  const result = await client.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text || '本地服务未返回数据');
  if (!result.structuredContent) throw new Error('本地服务响应格式异常');
  return result.structuredContent;
}
const api = {
  normalize, hostTheme: () => hostTheme,
  refresh: () => tool('refresh_radar'),
  openLink: url => client.openLink({ url }),
  savePreferences(preferences) {
    clearTimeout(saveTimer);
    return new Promise((resolve, reject) => {
      savePending.push({ resolve, reject });
      saveTimer = setTimeout(async () => {
        const pending = savePending; savePending = [];
        try { const result = await tool('save_preferences', { preferences }); pending.forEach(item => item.resolve(result)); }
        catch (error) { pending.forEach(item => item.reject(error)); }
      }, 250);
    });
  },
};
function accept(payload) {
  if (!payload?.data) {
    if (!view) {
      errorNode.hidden = false;
      errorNode.textContent = payload?.status?.lastError?.message ? '首次获取失败：' + payload.status.lastError.message : '正在获取榜单…';
      retryNode.hidden = !payload?.status?.lastError;
    }
    return;
  }
  errorNode.hidden = true;
  retryNode.hidden = true;
  if (!view) { view = mountRadar(normalize(payload.data), payload.preferences, api); initial = true; }
  view.update(payload);
}
client.ontoolresult = result => accept(result.structuredContent);
client.onhostcontextchanged = context => {
  if (context.theme) { hostTheme = context.theme; view?.setHostTheme(hostTheme); }
};
retryNode.addEventListener('click', async () => {
  retryNode.disabled = true; errorNode.textContent = '正在重新获取榜单…';
  try { accept(await tool('refresh_radar')); }
  catch (error) { errorNode.textContent = '获取失败：' + error.message; }
  finally { retryNode.disabled = false; }
});
async function start() {
  await client.connect();
  hostTheme = client.getHostContext()?.theme;
  view?.setHostTheme(hostTheme);
  setTimeout(async () => { if (!initial) { try { accept(await tool('read_radar')); } catch (error) { errorNode.textContent = error.message; } } }, 500);
  setInterval(async () => { try { accept(await tool('read_radar')); } catch (error) { if (!view) errorNode.textContent = error.message; } }, 30_000);
  document.addEventListener('visibilitychange', async () => { if (!document.hidden) { try { accept(await tool('read_radar')); } catch {} } });
}
start().catch(error => { errorNode.textContent = '无法连接 Codex 插件服务：' + error.message; });
