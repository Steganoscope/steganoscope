import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stats } from '../src/lib/stats.ts';

test('counts codes, duplicates and rate for one stream', () => {
  const s = new Stats();
  s.scan(0, null); // some other QR code
  for (let i = 0; i < 10; i++) s.scan(1000 + i * 100, { id: 'a', n: 8, len: 5600, rank: Math.min(i + 1, 8) });
  assert.match(s.live(1900)!, /rank 8\/8/);
  s.finish('a');
  const d = s.done!;
  assert.equal(d.fed, 10); assert.equal(d.duplicates, 2); assert.equal(d.scanned, 11);
  assert.equal(Math.round(d.secs * 10), 9); assert.equal(Math.round(d.perSec), 11);
  assert.match(s.report()!, /10 codes for n=8 \(1\.25x\)/);
  assert.equal(s.live(2000), null);
});

test('live goes quiet after 30 seconds without codes', () => {
  const s = new Stats();
  s.scan(0, { id: 'a', n: 4, len: 100, rank: 1 });
  assert.ok(s.live(1000));
  assert.equal(s.live(31_000), null);
});
