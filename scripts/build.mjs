import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'plugin', 'dist');
await fs.mkdir(out, { recursive: true });
const servers = await Promise.all([
  build({ entryPoints: [path.join(root, 'src/worker-main.mjs')], outfile: path.join(out, 'worker.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: false, metafile: true }),
  build({ entryPoints: [path.join(root, 'src/mcp-main.mjs')], outfile: path.join(out, 'mcp-server.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: false, metafile: true }),
]);
const result = await build({ entryPoints: [path.join(root, 'src/app.mjs')], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', write: false, minify: true, metafile: true });
const css = await fs.readFile(path.join(root, 'src/panel.css'), 'utf8');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型雷达</title><style>${css}#loading{padding:20px;font:14px system-ui;color:light-dark(#333,#ddd)}#retry{margin:0 20px 20px;padding:8px 16px;cursor:pointer}</style></head><body><div id="loading" role="status">正在连接模型雷达…</div><button id="retry" type="button" hidden>重新获取榜单</button><div id="radar-float-v2"><div class="rf-app" aria-label="模型雷达"></div></div><script>${script}</script></body></html>`;
await fs.writeFile(path.join(out, 'app.html'), html);
const packages = new Set([...servers, result].flatMap(build => Object.keys(build.metafile.inputs))
  .map(input => input.replaceAll('\\', '/').match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const notices = ['Third-party licenses for packages included in the generated bundles.\n'];
for (const name of [...packages].sort()) {
  const directory = path.join(root, 'node_modules', name);
  const metadata = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  const files = (await fs.readdir(directory)).filter(file => /^(license|licence|copying)([.-].*)?$/i.test(file)).sort();
  notices.push(`\n${'='.repeat(72)}\n${name}@${metadata.version} (${metadata.license || 'see text'})\n`);
  if (!files.length) {
    if (name !== 'boolbase' || metadata.version !== '1.0.0') throw new Error(`Missing bundled dependency license text: ${name}`);
    // Its npm tarball omits LICENSE; keep the upstream ISC text under LICENSES.
    notices.push(await fs.readFile(path.join(root, 'third-party/boolbase-LICENSE.txt'), 'utf8'));
  }
  for (const file of files) notices.push(await fs.readFile(path.join(directory, file), 'utf8'));
}
await fs.writeFile(path.join(out, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));
console.log(`Built plugin, app resource ${Buffer.byteLength(html)} bytes`);
