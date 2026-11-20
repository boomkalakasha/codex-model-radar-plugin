import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parsePublishedHtml } from '../src/data.mjs';
const html = await fs.readFile(new URL('./fixtures/published.html', import.meta.url), 'utf8');

test('published matrix uses exact source display values and excludes missing settings', () => {
  const data = parsePublishedHtml(html);
  assert.equal(data.models.length, 10); assert.equal(data.configurations, 58);
  assert.deepEqual(data.models.find(m => m.id === 'demo-03').values[2], [93.5, 0.22, 18]);
  assert.equal(data.models[0].mean, 86.25);
  assert.equal(data.models.find(m => m.id === 'demo-09').values[0], null);
});
test('a changed/mixed publication cannot replace the cache', () => {
  assert.throws(() => parsePublishedHtml(html.replace('data-cir-setting="demo-01:ultra"', 'data-cir-setting="unknown:ultra"')), /不一致/);
  assert.throws(() => parsePublishedHtml(html.replace('<strong>92.50</strong>', '<strong>999</strong>')), /格式/);
  assert.throws(() => parsePublishedHtml('<html><script>throw Error()</script></html>'), /元数据/);
});
