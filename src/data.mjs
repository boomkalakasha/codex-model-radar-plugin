import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export const SOURCE_URL = 'https://codexradar.com/';
export const EFFORTS = ['ultra', 'max', 'xhigh', 'high', 'medium', 'low'];
const number = (text, label, max = Infinity) => {
  const match = String(text).match(/\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : NaN;
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`站点${label}格式发生变化`);
  return value;
};

export function parsePublishedHtml(html) {
  const $ = load(html);
  let overview;
  try { overview = JSON.parse($('#home-overview-data').text()).scores; }
  catch { throw new Error('站点来源元数据缺失，保留上次数据'); }
  if (!Array.isArray(overview?.rows) || !overview.round_id || !overview.source_sha256) {
    throw new Error('站点来源契约发生变化');
  }
  const table = $('#cir-panel-total table.cir-table').first();
  if (!table.length) throw new Error('未找到已发布的总分矩阵');
  const columns = table.find('thead th').toArray().slice(1).map(e => $(e).text().trim().toLowerCase());
  if (columns.join(',') !== EFFORTS.join(',')) throw new Error('站点档位列发生变化');
  const known = new Map(overview.rows.map(row => [`${row.model}:${row.effort}`, row]));
  const seen = new Set();
  const models = [];
  table.find('tbody tr').each((_, tr) => {
    const row = $(tr);
    const name = row.find('.cir-model-heading > span').first().text().trim();
    const mean = number(row.find('.cir-model-mean strong').text(), '均分', 150);
    const values = EFFORTS.map(() => null);
    let id;
    row.find('button[data-cir-setting]').each((_, button) => {
      const cell = $(button), key = cell.attr('data-cir-setting');
      const split = key.lastIndexOf(':');
      const cellModel = key.slice(0, split), effort = key.slice(split + 1);
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(cellModel) || !EFFORTS.includes(effort)) throw new Error('站点模型标识不受支持');
      if (id && id !== cellModel) throw new Error('站点模型行归属不一致');
      id = cellModel;
      const meta = known.get(key);
      if (!meta || seen.has(key)) throw new Error('矩阵与发布元数据不一致');
      const score = number(cell.find('.cir-cell > strong').first().text(), '得分', 150);
      const cost = number(cell.find('[data-cir-cost]').text(), '费用');
      const minutes = number(cell.find('[data-cir-duration]').text(), '耗时');
      if (!Number.isFinite(Number(meta.score_display)) || Math.abs(Number(meta.score_display) - score) > .0001) throw new Error('得分与发布元数据不一致');
      if (!Number.isFinite(Number(meta.cost_usd)) || !Number.isFinite(Number(meta.model_elapsed_seconds)) || Math.abs(Number(meta.cost_usd) - cost) > .011 || Math.abs(Number(meta.model_elapsed_seconds) / 60 - minutes) > .011) {
        throw new Error('费用或耗时与发布元数据不一致');
      }
      values[EFFORTS.indexOf(effort)] = [score, cost, minutes];
      seen.add(key);
    });
    if (!id || !name || name.length > 100) throw new Error('模型行资料缺失');
    if (models.some(model => model.id === id)) throw new Error('模型行重复');
    models.push({ id, name, mean, values });
  });
  if (!models.length || models.length > 100 || seen.size !== known.size) throw new Error('发布矩阵不完整');
  const sourceTime = overview.cost_calculated_at_utc || null;
  if (sourceTime && !Number.isFinite(Date.parse(sourceTime))) throw new Error('站点数据日期格式异常');
  return {
    schema: 1, sourceUrl: 'https://codexradar.com/#iq', sourceDataUrl: 'https://codexradar.com/data/codex-four-task-results.json',
    roundId: overview.round_id, sourceHash: overview.source_sha256,
    htmlHash: createHash('sha256').update(html).digest('hex'),
    sourceSnapshotAt: sourceTime,
    configurations: seen.size, models,
  };
}

export async function fetchPublished({ etag, lastModified, signal, url = SOURCE_URL } = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 CodexModelRadar/1.0 (personal read-only widget)', Accept: 'text/html' };
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;
  const response = await fetch(url, { headers, signal, redirect: 'error' });
  if (response.status === 304) return { unchanged: true };
  if (!response.ok) throw new Error(`数据源 HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('数据源未返回 HTML');
  const parts = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('数据源响应超过安全大小');
    parts.push(chunk);
  }
  const data = parsePublishedHtml(Buffer.concat(parts).toString('utf8'));
  return { data, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
}
