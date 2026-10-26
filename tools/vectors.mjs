#!/usr/bin/env node
// Writes the test vectors other implementations check themselves against, deterministically, so
// test/native.test.mjs can check the files are current:
//   app/src/lib/vectors.json  the vectors of spec/steganoscope.yaml, for the app's self-test on devices
//   test/vectors/streams.txt  streams from the reference implementation, for native/core, one record per line:
//   case <name> <block>        a new stream
//   container <hex>            its container
//   frame <seed> <text>        a frame the encoder must produce exactly
//   feed <text>                a frame for the decoder, in order (with losses and repeats)
//   mask <seed> <n> <bits>     a mask
//   sha256 <hex in> <hex out>  a digest
//   reject <text>              a frame that must be rejected
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { PROTOCOL, encoder, hex, mask, mulberry32 } from '../protocol/fountain.js';
import { issueCert, issueCrl, keyFromPassphrase, keyId, loadKey, openContainer, packFile, seal, signCode, toB64url } from '../protocol/containers.js';

export function vectors() {
  const out = [], rng = mulberry32(2024);
  const bytes = n => Uint8Array.from({ length: n }, () => rng() & 255);
  const text = n => new TextEncoder().encode('Steganoscope carries files across the gap. '.repeat(Math.ceil(n / 36)).slice(0, n));

  for (const [seed, n] of [[12345, 64], [1, 1], [7, 33], [4294967295, 100]]) out.push(`mask ${seed} ${n} ${mask(seed, n).join('')}`);
  for (const n of [0, 3, 55, 64, 1000]) { const b = bytes(n); out.push(`sha256 ${hex(b) || '-'} ${hex(sha256(b))}`); }

  const cases = [['tiny', bytes(2), 1], ['odd', bytes(1001), 100], ['text', text(5000), 700], ['wide', bytes(20000), 2900], ['many', bytes(24000), 300]];
  for (const [name, container, block] of cases) {
    const e = encoder(container, block);
    out.push(`case ${name} ${block}`, `container ${hex(container)}`);
    for (const s of [0, 1, 2, 3, 4294967295]) out.push(`frame ${s} ${e.frame(s)}`);
    // A reception: a random start, a third lost, some repeats, until well past n.
    let s = rng();
    for (let i = 0; i < e.n * 2 + 10; i++, s = (s + 1) >>> 0) {
      if (rng() % 3 === 0) continue;
      out.push(`feed ${e.frame(s)}`);
      if (rng() % 10 === 0) out.push(`feed ${e.frame(s)}`);
    }
  }

  const ok = `${PROTOCOL}/0123456789ABCDEF`;
  for (const r of [`${ok}/0/100/1/AA`, `${ok}/4097/100000/1/AA`, `${ok}/4/100/1/AA`, `${ok}/4/99999999/1/AA`, `${ok}/4/100/4294967296/AA`,
    `${ok}/10/9/1/AA`, `${ok}/1/100000/1/AA`, `${PROTOCOL}/short/4/100/1/AA`, 'garbage', 'HTTPS://STEGANOSCOPE.APP/SCAN', `STG000000/0123456789ABCDEF/1/4/1/000000`,
    `${ok}/1/2/1/:::`, `${ok}/1/2/1/GGW`]) out.push(`reject ${r}`);
  return out.join('\n') + '\n';
}

// Container vectors for spec/steganoscope.yaml (`vectors.containers`), made with fixed keys and data.
// `exact: true` means an implementation must produce these bytes; `exact: false` (anything deflated, whose
// bytes depend on the compressor) means it must open them, and what it makes must open here.
// Print them with `node tools/vectors.mjs containers`; test/containers-vectors.test.mjs checks them.
export function containerVectors() {
  const rng = mulberry32(99), fill = n => Uint8Array.from({ length: n }, () => rng() & 255);
  const enc = s => new TextEncoder().encode(s);
  const rootSecret = new Uint8Array(32).fill(0x11), pubSecret = new Uint8Array(32).fill(0x22), otherSecret = new Uint8Array(32).fill(0x33);
  const pub = ed25519.getPublicKey(pubSecret), root = loadKey(toB64url(ed25519.getPublicKey(rootSecret))), other = loadKey(toB64url(ed25519.getPublicKey(otherSecret)));
  const key1 = new Uint8Array(32).fill(0x42), key2 = new Uint8Array(32).fill(0x43);
  const notBefore = 1700000000, notAfter = 1800000000, now = 1750000000;
  const keys = { root: hex(rootSecret), 'root-public': toB64url(root.key), publisher: hex(pubSecret), 'publisher-public': toB64url(pub), other: toB64url(other.key), 'group-1': hex(key1), 'group-2': hex(key2) };

  const stored = packFile('noise.bin', 'application/octet-stream', fill(300));
  const compressed = packFile('hello.txt', 'text/plain', enc('Steganoscope carries files across the gap. '.repeat(20)));
  const cert = issueCert(rootSecret, { publicKey: pub, name: 'Example Labs', namespace: 'ex', notBefore, notAfter, serial: 7 });
  const crl = issueCrl(rootSecret, { number: 3, serials: [7, 9] });
  const byRoot = signCode(rootSecret, { type: 'html', id: 'demo', payload: enc('<p>hello</p>'.repeat(10)), version: 1700000100 });
  const byPublisher = signCode(pubSecret, { type: 'json', id: 'ex.report', payload: enc('{"ok":true}'), version: 1700000200, cert });
  const wrongNamespace = signCode(pubSecret, { type: 'json', id: 'other.report', payload: enc('{}'), version: 1700000200, cert });
  const sealed1 = seal(key1, stored), sealed2 = seal(key2, sealed1);

  const trust = { roots: [toB64url(root.key)], now };
  const out = (container, exact, opened, extra = {}) => ({ container: hex(container), exact, ...extra, opened });
  const code = c => { const o = openContainer(c, { roots: [root], now }).code; return { type: o.type, id: o.id, version: o.version, payload: hex(o.payload), signer: o.signer, ...(o.publisher && { publisher: o.publisher.name, serial: o.publisher.serial }) }; };
  const file = c => { const f = openContainer(c).file; return { name: f.name, mime: f.mime, bytes: hex(f.bytes) }; };
  const reject = (name, container, options, error) => ({ name, container: hex(container), ...options, error });

  return {
    keys,
    trust,
    'file-stored': out(stored, true, file(stored)),
    'file-compressed': out(compressed, false, file(compressed)),
    certificate: out(cert, true, (({ serial, notBefore, notAfter, namespace, name, fp, root: r }) => ({ serial, 'not-before': notBefore, 'not-after': notAfter, namespace, name, fingerprint: fp, root: r }))(openContainer(cert, { roots: [root] }).cert)),
    'revocation-list': out(crl, true, openContainer(crl, { roots: [root] }).crl),
    'code-by-root': out(byRoot, false, code(byRoot)),
    'code-by-publisher': out(byPublisher, false, code(byPublisher)),
    'sealed-one-layer': out(sealed1, true, { key: 'group-1', 'key-id': keyId(key1), inner: hex(stored) }),
    'sealed-two-layers': out(sealed2, true, { keys: ['group-2', 'group-1'], 'key-ids': [keyId(key2), keyId(key1)], inner: hex(stored) }),
    // The same passphrase composed (U+00E4) and decomposed (a, U+0308): both must give the same key.
    'passphrase-key': { passphrase: 'p\u00e4ssphrase \u2713', 'passphrase-decomposed': 'pa\u0308ssphrase \u2713', key: hex(keyFromPassphrase('p\u00e4ssphrase \u2713')) },
    reject: [
      reject('code signed by a key that is not trusted', byRoot, { trust: 'other' }, 'bad signature'),
      reject('code with no trusted keys at all', byRoot, { trust: 'none' }, 'no trusted key'),
      reject('publisher code before the certificate starts', byPublisher, { now: notBefore - 1 }, 'certificate not valid at this time'),
      reject('publisher code after the certificate ends', byPublisher, { now: notAfter + 1 }, 'certificate not valid at this time'),
      reject('publisher code with a revoked certificate', byPublisher, { revoked: [7] }, 'certificate revoked'),
      reject('publisher code outside its namespace', wrongNamespace, {}, 'may not publish other.report'),
      reject('a sealed container whose bytes were changed', Uint8Array.from(sealed1, (b, i) => (i === sealed1.length - 1 ? b ^ 1 : b)), { keys: ['group-1'] }, 'sealed container does not authenticate'),
      reject('an unknown container type', Uint8Array.of(99, 1, 2, 3), {}, 'unknown container type'),
    ],
  };
}

export const appVectors = () =>
  JSON.stringify({ protocol: PROTOCOL, ...parse(readFileSync(new URL('../spec/steganoscope.yaml', import.meta.url), 'utf8')).vectors }, null, 2) + '\n';

if (process.argv[2] === 'containers') {
  process.stdout.write(stringify({ containers: containerVectors() }, { lineWidth: 0 }));
} else if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  writeFileSync(new URL('../test/vectors/streams.txt', import.meta.url), vectors());
  writeFileSync(new URL('../app/src/lib/vectors.json', import.meta.url), appVectors());
  console.error('wrote test/vectors/streams.txt and app/src/lib/vectors.json');
}
