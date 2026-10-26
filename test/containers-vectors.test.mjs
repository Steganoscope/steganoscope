// Checks the JavaScript containers against the vectors of spec/steganoscope.yaml (`vectors.containers`), which
// every other implementation is held to as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { containerVectors } from '../tools/vectors.mjs';
import { issueCert, issueCrl, keyFromPassphrase, keyId, loadKey, openContainer, packFile, seal, signCode } from '../protocol/containers.js';

const v = parse(readFileSync(new URL('../spec/steganoscope.yaml', import.meta.url), 'utf8')).vectors.containers;
const bytes = h => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16));
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const secret = name => bytes(v.keys[name]);
const roots = (names = [v.keys['root-public']]) => names.map(loadKey);

test('every vector opens to what the spec says', () => {
  const o = c => openContainer(bytes(v[c].container), { roots: roots(), now: v.trust.now, keys: [secret('group-1'), secret('group-2')] });
  for (const c of ['file-stored', 'file-compressed']) {
    const { name, mime, bytes: b } = o(c).file;
    assert.deepEqual({ name, mime, bytes: hex(b) }, v[c].opened, c);
  }
  const cert = o('certificate').cert;
  assert.deepEqual({ serial: cert.serial, 'not-before': cert.notBefore, 'not-after': cert.notAfter, namespace: cert.namespace, name: cert.name, fingerprint: cert.fp, root: cert.root }, v.certificate.opened);
  assert.deepEqual(o('revocation-list').crl, v['revocation-list'].opened);
  for (const c of ['code-by-root', 'code-by-publisher']) {
    const k = o(c).code, want = v[c].opened;
    assert.deepEqual({ type: k.type, id: k.id, version: k.version, payload: hex(k.payload), signer: k.signer, ...(k.publisher && { publisher: k.publisher.name, serial: k.publisher.serial }) }, want, c);
  }
  const one = o('sealed-one-layer'), two = o('sealed-two-layers');
  assert.deepEqual(one.sealed, [v['sealed-one-layer'].opened['key-id']]);
  assert.deepEqual(two.sealed, v['sealed-two-layers'].opened['key-ids']);
  assert.equal(hex(openContainer(bytes(v['sealed-one-layer'].opened.inner)).file.bytes), v['file-stored'].opened.bytes);
  assert.equal(hex(two.file.bytes), v['file-stored'].opened.bytes);
});

test('what an implementation must produce exactly, the JavaScript does', () => {
  const stored = bytes(v['file-stored'].container);
  assert.equal(hex(seal(secret('group-1'), stored)), v['sealed-one-layer'].container);
  assert.equal(hex(seal(secret('group-2'), seal(secret('group-1'), stored))), v['sealed-two-layers'].container);
  assert.equal(keyId(secret('group-1')), v['sealed-one-layer'].opened['key-id']);
  const pub = loadKey(v.keys['publisher-public']).key;
  assert.equal(hex(issueCert(secret('root'), { publicKey: pub, name: 'Example Labs', namespace: 'ex', notBefore: 1700000000, notAfter: 1800000000, serial: 7 })), v.certificate.container);
  assert.equal(hex(issueCrl(secret('root'), { number: 3, serials: [7, 9] })), v['revocation-list'].container);
  const p = v['passphrase-key'];
  assert.equal(hex(keyFromPassphrase(p.passphrase)), p.key);
  assert.equal(hex(keyFromPassphrase(p['passphrase-decomposed'])), p.key, 'NFC: composed and decomposed give one key');
  assert.notEqual(p.passphrase, p['passphrase-decomposed']);
  // Signatures and deflate: what is made here must open here, whatever the compressor's exact bytes.
  const made = signCode(secret('root'), { type: 'html', id: 'demo', payload: new TextEncoder().encode('x'), version: 5 });
  assert.equal(openContainer(made, { roots: roots() }).code.id, 'demo');
  assert.equal(openContainer(packFile('a.txt', 'text/plain', new TextEncoder().encode('a'.repeat(500)))).file.name, 'a.txt');
});

test('every reject vector is refused, with the reason the spec gives', () => {
  for (const r of v.reject) {
    const trust = r.trust === 'other' ? roots([v.keys.other]) : r.trust === 'none' ? [] : roots();
    const options = { roots: trust, now: r.now ?? v.trust.now, revoked: r.revoked ?? [], keys: (r.keys ?? []).map(secret) };
    assert.throws(() => openContainer(bytes(r.container), options), e => e.message.includes(r.error), r.name);
  }
});

test('the vectors in the spec are the ones the generator makes, apart from deflated bytes', () => {
  const now = containerVectors();
  assert.deepEqual(now.keys, v.keys);
  for (const [name, vec] of Object.entries(v)) {
    if (vec?.exact === true) assert.equal(now[name].container, vec.container, name);
  }
  assert.deepEqual(now['passphrase-key'], v['passphrase-key']);
});
