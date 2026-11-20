import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
if (!process.argv.includes('--release')) throw new Error('Use --release from a reviewed clean commit');
if (git('rev-parse', '--show-toplevel').toString().trim().replaceAll('\\', '/').toLowerCase() !== root.replaceAll('\\', '/').toLowerCase()) throw new Error('Run in the actual repository root');
if (git('status', '--porcelain').toString().trim()) throw new Error('Release packaging requires a clean tracked source tree');
const commit = git('rev-parse', 'HEAD').toString().trim();
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const destination = path.join(root, 'dist');
const stage = await fs.mkdtemp(path.join(root, '.release-'));
const exportRoot = path.join(stage, 'codex-model-radar-plugin');
const members = [];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function add(name, bytes, source) {
  if (name.split(/[\\/]/).includes('..') || path.isAbsolute(name)) throw new Error('Unsafe member path');
  const file = path.join(exportRoot, name); await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes); members.push({ path: name, bytes: bytes.length, sha256: digest(bytes), source });
}
for (const name of git('ls-files', '-z').toString().split('\0').filter(Boolean)) {
  if (name.startsWith('internal/') || name.startsWith('node_modules/') || name.startsWith('dist/')) throw new Error('Private/generated path tracked');
  const committed = git('show', `HEAD:${name}`);
  if (!(await fs.readFile(path.join(root, name))).equals(committed)) throw new Error(`Working copy differs from commit: ${name}`);
  await add(name, committed, 'git-blob');
}
for (const name of ['app.html', 'worker.cjs', 'mcp-server.cjs', 'THIRD-PARTY-NOTICES.txt']) {
  await add(`plugin/dist/${name}`, await fs.readFile(path.join(root, 'plugin/dist', name)), 'build');
}
await add('manifest.json', Buffer.from(JSON.stringify({ version, sourceCommit: commit, files: members.slice(), excludesSelf: true }, null, 2) + '\n'), 'manifest');
await fs.mkdir(destination, { recursive: true });
const zip = path.join(destination, `codex-model-radar-plugin-${version}.zip`);
// Python's ZIP32 writer keeps all archive members explicit; Python is a maintainer prerequisite only.
execFileSync(process.env.PYTHON || 'python', ['-c', `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9,allowZip64=False) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   info=zipfile.ZipInfo(p.relative_to(root).as_posix(),date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
   z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
`, stage, zip], { cwd: root, windowsHide: true });
const sha256 = digest(await fs.readFile(zip));
await fs.writeFile(path.join(destination, 'SHA256SUMS.txt'), `${sha256}  ${path.basename(zip)}\n`);
console.log(JSON.stringify({ version, sourceCommit: commit, zip, sha256, members: members.length, stage }));
