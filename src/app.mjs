import { App } from '@modelcontextprotocol/ext-apps';
import { createIcons, SquareTerminal, SquarePen, Folder, Blocks, Radar, RefreshCw, Sun, Moon,
  SlidersHorizontal, Maximize2, Minimize2, X, Palette, Rainbow, Zap, Clock3, ExternalLink,
  ChevronUp, ChevronDown, Crosshair, MousePointer2 } from 'lucide';
import { mountRadar } from './view.mjs';

window.lucide = { createIcons: options => createIcons({ ...options, icons: { SquareTerminal, SquarePen, Folder, Blocks, Radar,
  RefreshCw, Sun, Moon, SlidersHorizontal, Maximize2, Minimize2, X, Palette, Rainbow, Zap,
  Clock3, ExternalLink, ChevronUp, ChevronDown, Crosshair, MousePointer2 } }) };
const client = new App({ name: 'Model Radar', version: '1.0.2' }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: true });
let view, hostTheme, saveTimer, savePending = [], connected = false, reading = false, pollTimer, pollDelay = 2_000;
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
  pollDelay = !payload?.data || payload.status?.serviceError || payload.status?.refreshing ? 2_000 : 30_000;
  if (!payload?.data) {
    const message = payload?.status?.serviceError?.message || payload?.status?.lastError?.message;
    if (view) view.setConnectionError(message || '正在重新连接模型雷达数据服务…');
    else {
      errorNode.hidden = false;
      errorNode.textContent = message ? '榜单暂不可用：' + message : '正在获取榜单…';
      retryNode.hidden = !message;
    }
    return;
  }
  errorNode.hidden = true;
  retryNode.hidden = true;
  if (!view) view = mountRadar(normalize(payload.data), payload.preferences, api);
  view.update(payload);
}
function connectionError() {
  pollDelay = 3_000;
  const message = '连接暂时中断，正在自动重连；可点击刷新重试。';
  if (view) view.setConnectionError(message);
  else {
    errorNode.hidden = false;
    errorNode.textContent = connected ? message : '无法连接 Codex 插件服务，请重试。';
    retryNode.hidden = false;
  }
}
client.ontoolresult = result => accept(result.structuredContent);
client.onhostcontextchanged = context => {
  if (context.theme) { hostTheme = context.theme; view?.setHostTheme(hostTheme); }
};
retryNode.addEventListener('click', async () => {
  if (!connected) { window.location.reload(); return; }
  retryNode.disabled = true; errorNode.textContent = '正在重新获取榜单…';
  try { accept(await tool('refresh_radar')); }
  catch (error) { connectionError(error); }
  finally { retryNode.disabled = false; }
});
async function poll() {
  if (reading) return;
  clearTimeout(pollTimer);
  reading = true;
  try { accept(await tool('read_radar')); }
  catch (error) { connectionError(error); }
  finally { reading = false; pollTimer = setTimeout(poll, pollDelay); }
}
async function start() {
  await client.connect();
  connected = true;
  hostTheme = client.getHostContext()?.theme;
  view?.setHostTheme(hostTheme);
  pollTimer = setTimeout(poll, 500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}
start().catch(connectionError);
