import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createWorker } from '../src/worker.mjs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fetchPublished } from '../src/data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const offlineFirst = process.argv.includes('--cold-start-offline');
const directory = path.join(root, offlineFirst ? 'internal/qa-cold-runtime' : 'internal/qa-runtime');
let attempts = 0;
const worker = await createWorker({ directory, fetcher: async options => {
  if (offlineFirst && ++attempts === 1) throw new Error('模拟首次断网，用于验证重试入口');
  return fetchPublished(options);
} }); await worker.listen();
const client = new Client({ name: 'radar-ui-test-host', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'plugin/dist/mcp-server.cjs')], env: { ...process.env, CODEX_RADAR_HOME: directory }, stderr: 'pipe' }));
const resource = await client.readResource({ uri: 'ui://codex-model-radar/panel.html' });
const host = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>模型雷达 · MCP 验证</title><style>body{margin:0;background:#f5f6f5;font:14px system-ui}main{max-width:820px;margin:12px auto}iframe{border:0;width:100%;height:900px}</style></head><body><main><iframe id="app" src="/frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" aria-label="模型雷达 MCP 应用"></iframe></main><script>
const frame=document.getElementById('app');
window.addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow)return;const msg=event.data;
 if(!msg||msg.jsonrpc!=='2.0')return;
 const reply=result=>frame.contentWindow.postMessage({jsonrpc:'2.0',id:msg.id,result},'*');
 try{
  if(msg.method==='ui/initialize')reply({protocolVersion:msg.params.protocolVersion,hostInfo:{name:'radar-ui-test-host',version:'1.0.0'},hostCapabilities:{serverTools:{},openLinks:{}},hostContext:{theme:'light',displayMode:'inline'}});
  else if(msg.method==='ui/notifications/initialized'){
    const result=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'open_radar',arguments:{}})}).then(r=>r.json());
    frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
  }else if(msg.method==='tools/call')reply(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(msg.params)}).then(r=>r.json()));
  else if(msg.method==='ui/notifications/size-changed'&&Number.isFinite(msg.params?.height))frame.style.height=Math.max(100,Math.min(12000,msg.params.height+20))+'px';
  else if(msg.method==='ui/open-link'){window.open(msg.params.url,'_blank','noopener');reply({});}
  else if(msg.id!==undefined)reply({});
 }catch(error){if(msg.id!==undefined)frame.contentWindow.postMessage({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:error.message}},'*');}
});</script></body></html>`;
const server = http.createServer(async (req, res) => {
  const ownHost = `127.0.0.1:${server.address().port}`;
  if (req.headers.host !== ownHost || (req.headers.origin && req.headers.origin !== `http://${ownHost}` && req.headers.origin !== 'null')) { res.writeHead(403); res.end(); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/frame') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(resource.contents[0].text); }
  else if (req.url === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(host); }
  else if (req.url === '/rpc' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 32768) throw Error('request too large'); }
      const params = JSON.parse(body);
      if (!['open_radar', 'read_radar', 'refresh_radar', 'save_preferences'].includes(params.name)) throw Error('unknown tool');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await client.callTool(params)));
    } catch (error) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ isError: true, content: [{ type: 'text', text: error.message }] })); }
  } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
await fs.mkdir(path.join(root, 'internal'), { recursive: true });
await fs.writeFile(path.join(root, offlineFirst ? 'internal/preview-cold.json' : 'internal/preview.json'), JSON.stringify({ url, pid: process.pid }));
console.log(url);
async function stop() { server.close(); await client.close(); await worker.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
