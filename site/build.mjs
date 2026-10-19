#!/usr/bin/env node
// Assembles the two sites:
//   <website>  steganoscope.org: the project's page and privacy policy.
//   <links>    steganoscope.app: only the countdown link. /SCAN is the page a phone without Steganoscope
//              opens; the association files let the same link open the installed app on iOS and
//              Android. Everything else redirects to steganoscope.org.
// The association files need:
//   APPLE_TEAM_ID        the Apple developer team id (10 characters)
//   ANDROID_CERT_SHA256  SHA-256 fingerprints of the app signing certificates, comma-separated
// Without them they are left out, and the link always opens the download page.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [website, links] = process.argv.slice(2);
if (!website || !links) throw new Error('usage: build.mjs <website directory> <links directory>');
const here = new URL('.', import.meta.url).pathname, assets = ['icon.png', 'mark.svg', 'mark-dark.svg', 'favicon.svg'];

mkdirSync(website, { recursive: true });
for (const f of ['index.html', 'privacy.html', ...assets]) copyFileSync(join(here, f), join(website, f));
writeFileSync(join(website, 'CNAME'), 'steganoscope.org\n');

const wk = join(links, '.well-known');
mkdirSync(wk, { recursive: true });
for (const f of assets) copyFileSync(join(here, f), join(links, f));
const scan = readFileSync(join(here, 'scan.html'));
for (const d of ['SCAN', 'scan']) { mkdirSync(join(links, d), { recursive: true }); writeFileSync(join(links, d, 'index.html'), scan); }
const away = '<!doctype html><meta charset="utf-8"><title>Steganoscope</title>'
  + '<meta http-equiv="refresh" content="0; url=https://steganoscope.org/"><a href="https://steganoscope.org/">steganoscope.org</a>\n';
for (const f of ['index.html', '404.html']) writeFileSync(join(links, f), away);
writeFileSync(join(links, '.nojekyll'), ''); // GitHub Pages would otherwise skip .well-known
writeFileSync(join(links, 'CNAME'), 'steganoscope.app\n');

const team = process.env.APPLE_TEAM_ID, certs = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').filter(Boolean);
if (team) {
  if (!/^[A-Z0-9]{10}$/.test(team)) throw new Error('APPLE_TEAM_ID must be 10 characters');
  const aasa = { applinks: { details: [{ appIDs: [`${team}.app.steganoscope`], components: [{ '/': '/SCAN' }, { '/': '/scan' }] }] } };
  writeFileSync(join(wk, 'apple-app-site-association'), JSON.stringify(aasa));
}
if (certs.length) {
  for (const c of certs) if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(c)) throw new Error(`not a SHA-256 fingerprint: ${c}`);
  const assoc = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'app.steganoscope', sha256_cert_fingerprints: certs } }];
  writeFileSync(join(wk, 'assetlinks.json'), JSON.stringify(assoc));
}
console.error(`website in ${website}; links in ${links}: ${team ? 'iOS' : 'no iOS'} and ${certs.length ? 'Android' : 'no Android'} association`);
