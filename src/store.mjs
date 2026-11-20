import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; }
}
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
export function validatePreferences(value, data) {
  if (!value || value.schema !== 3) throw new Error('偏好格式不受支持');
  if (!['soft', 'rainbow', 'neon'].includes(value.mode)) throw new Error('配色模式不受支持');
  if (!/^#[0-9a-f]{6}$/i.test(value.accent)) throw new Error('主色格式错误');
  if (!['system', 'light', 'dark'].includes(value.appearance)) throw new Error('外观格式错误');
  const allowed = new Set(data?.models.map(model => model.id) || []);
  if (!Array.isArray(value.selected) || !value.selected.length || value.selected.length > 100 || value.selected.some(id => !allowed.has(id))) throw new Error('默认模型必须来自当前榜单且至少保留一个');
  if (new Set(value.selected).size !== value.selected.length) throw new Error('默认模型不能重复');
  if (!['score', 'cost', 'time', 'manual'].includes(value.preset)) throw new Error('模型倾向格式错误');
  return { schema: 3, mode: value.mode, accent: value.accent.toLowerCase(), appearance: value.appearance, selected: [...value.selected], preset: value.preset,
    selection: typeof value.selection === 'string' && /^[a-zA-Z0-9._-]{1,100}:[0-5]$/.test(value.selection) ? value.selection : '' };
}
