import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readShared } from '../src/lib/shared.ts';

const bytes = (n: number) => new Uint8Array(n).fill(7);

test('uses the first reader that returns the whole file', async () => {
  assert.equal((await readShared('file:///a', 5, [async () => bytes(5), async () => bytes(9)])).length, 5);
});

test('falls back when the first reader returns nothing, or throws', async () => {
  assert.equal((await readShared('x', 5, [async () => bytes(0), async () => bytes(5)])).length, 5);
  assert.equal((await readShared('x', null, [async () => { throw new Error('denied'); }, async () => bytes(3)])).length, 3);
});

test('a short read is not accepted when the size is known', async () => {
  await assert.rejects(readShared('x', 10, [async () => bytes(4)]), /4 bytes came through of 10/);
});

test('an empty file is an error, not an empty item', async () => {
  await assert.rejects(readShared('x', 5, [async () => bytes(0)]), /came through empty/);
  await assert.rejects(readShared('x', 5, [async () => { throw new Error('denied'); }]), /denied/);
});
