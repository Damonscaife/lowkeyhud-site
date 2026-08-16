#!/usr/bin/env node
// scripts/test-license.mjs — proves the Pro unlock flow without a deployed Worker.
//
// Unit tests load the real license-worker.js, mock the upstream Lemon Squeezy
// call, and assert every response path. An optional --live flag additionally
// hits the real Lemon Squeezy API with a fake key to confirm the endpoint
// contract (expect: HTTP 404, {"valid":false,"error":"license_key not found."}).
//
// Usage:
//   node scripts/test-license.mjs          # unit tests only (offline)
//   node scripts/test-license.mjs --live   # + live contract check

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { createHmac } from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');

// Load the real worker source as an ES module via a temp .mjs copy.
const src = readFileSync(path.join(ROOT, 'license-worker.js'), 'utf8');
const tmp = path.join(os.tmpdir(), 'lowkeyhud-license-worker-' + process.pid + '.mjs');
writeFileSync(tmp, src);
const { default: worker } = await import(pathToFileURL(tmp).href);
unlinkSync(tmp);

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; failures.push(name); console.log('  \u2717 ' + name); }
}

const realFetch = globalThis.fetch;
let lastUpstream = null;
function mockLemon(status, body) {
  globalThis.fetch = async (url, init) => {
    lastUpstream = { url: String(url), init };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

// In-memory KV + secret, standing in for the Cloudflare bindings.
function mockEnv(secret = 'test-secret') {
  const store = new Map();
  return {
    WEBHOOK_SECRET: secret,
    LICENSES: {
      async get(k) { return store.has(k) ? store.get(k) : null; },
      async put(k, v) { store.set(k, v); }
    }
  };
}

// Lemon Squeezy signs the raw body with HMAC-SHA256 hex, same as our Worker checks.
function sign(body, secret) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function callWorker({ path = '/validate', method = 'POST', body, ip = 'unit-test-ip', origin = 'https://lowkeyhud.com', env = mockEnv(), headers: extra = {} } = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra);
  if (origin) headers['Origin'] = origin;
  if (ip) headers['cf-connecting-ip'] = ip;
  const request = new Request('https://worker.example' + path, {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  return worker.fetch(request, env);
}

console.log('license-worker unit tests\n');

// 1. valid key
mockLemon(200, { valid: true, error: null });
let r = await callWorker({ body: { license_key: 'GOOD-KEY' } });
let j = await r.json();
ok('valid key -> 200 {ok:true}', r.status === 200 && j.ok === true);

// 2. invalid key (Lemon returns 404 for unknown keys)
mockLemon(404, { valid: false, error: 'license_key not found.' });
r = await callWorker({ body: { license_key: 'BAD-KEY' } });
j = await r.json();
ok('invalid key -> 200 {ok:false, message}', r.status === 200 && j.ok === false && j.message === "that code isn't it. no cap.");

// 3. upstream request shape
ok('proxies to Lemon validate endpoint', lastUpstream.url === 'https://api.lemonsqueezy.com/v1/licenses/validate');
ok('sends form-encoded license_key', lastUpstream.init.body === 'license_key=BAD-KEY');
ok('sends Accept + form Content-Type', lastUpstream.init.headers['Accept'] === 'application/json' && lastUpstream.init.headers['Content-Type'] === 'application/x-www-form-urlencoded');

// 4. empty key
r = await callWorker({ body: { license_key: '   ' } });
j = await r.json();
ok('empty key -> 400 "paste a code first."', r.status === 400 && j.message === 'paste a code first.');

// 5. malformed JSON body
r = await callWorker({ body: 'not-json' });
j = await r.json();
ok('malformed body -> 400 "bad request"', r.status === 400 && j.message === 'bad request');

// 6. wrong path
r = await callWorker({ path: '/nope', body: { license_key: 'X' } });
j = await r.json();
ok('wrong path -> 404', r.status === 404 && j.ok === false);

// 7. OPTIONS preflight + CORS
r = await callWorker({ method: 'OPTIONS' });
ok('OPTIONS -> 204 with allow-origin', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://lowkeyhud.com');

// 8. upstream failure -> 502
globalThis.fetch = async () => { throw new Error('network down'); };
r = await callWorker({ body: { license_key: 'X' } });
ok('upstream failure -> 502', r.status === 502);

// 9. rate limit: 20/min per IP -> 21st request is 429
mockLemon(200, { valid: true });
let saw429 = false;
for (let i = 0; i < 21; i++) {
  r = await callWorker({ body: { license_key: 'X' }, ip: 'rate-limit-test' });
  if (r.status === 429) { saw429 = true; break; }
}
ok('rate limit -> 429 after 20 requests', saw429);

globalThis.fetch = realFetch;

// 10. webhook signature verification
console.log('\nwebhook + lookup tests');
const wenv = mockEnv('test-secret');

const orderBody = JSON.stringify({
  meta: { event_name: 'order_created' },
  data: { type: 'orders', id: '42', attributes: { identifier: 'uuid-abc', user_email: 'a@b.com' } }
});
r = await callWorker({ path: '/webhook', method: 'POST', body: orderBody, env: wenv, headers: { 'X-Signature': sign(orderBody, 'test-secret'), 'X-Event-Name': 'order_created' } });
ok('order_created webhook (valid sig) -> 200', r.status === 200);

r = await callWorker({ path: '/webhook', method: 'POST', body: orderBody, env: wenv, headers: { 'X-Signature': 'deadbeef', 'X-Event-Name': 'order_created' } });
ok('webhook bad signature -> 401', r.status === 401);

r = await callWorker({ path: '/webhook', method: 'POST', body: orderBody, env: wenv });
ok('webhook missing signature -> 401', r.status === 401);

const lkBody = JSON.stringify({
  meta: { event_name: 'license_key_created' },
  data: { type: 'license-keys', id: '1', attributes: { key: 'KEY-123', order_id: 42 } }
});
r = await callWorker({ path: '/webhook', method: 'POST', body: lkBody, env: wenv, headers: { 'X-Signature': sign(lkBody, 'test-secret'), 'X-Event-Name': 'license_key_created' } });
ok('license_key_created webhook -> 200', r.status === 200);

// 11. lookup joins order_identifier -> order_id -> key
r = await callWorker({ path: '/lookup?order=uuid-abc', method: 'GET', env: wenv });
j = await r.json();
ok('lookup by order identifier -> key', r.status === 200 && j.ok === true && j.key === 'KEY-123');

r = await callWorker({ path: '/lookup?order=missing', method: 'GET', env: wenv });
ok('lookup unknown order -> 404 not ready', r.status === 404);

// 12. webhook without KV bound must NOT ack (500) so Lemon retries
r = await callWorker({ path: '/webhook', method: 'POST', body: lkBody, env: { WEBHOOK_SECRET: 'test-secret' }, headers: { 'X-Signature': sign(lkBody, 'test-secret'), 'X-Event-Name': 'license_key_created' } });
ok('webhook without KV -> 500', r.status === 500);

// optional live contract check against the real API
if (LIVE) {
  console.log('\nlive Lemon Squeezy contract check (fake key):');
  try {
    const res = await realFetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'license_key=00000000-0000-0000-0000-000000000000'
    });
    const data = await res.json();
    console.log('  HTTP ' + res.status + ' ' + JSON.stringify(data));
    ok('live: unknown key returns valid:false', data.valid === false);
  } catch (e) {
    failed++; failures.push('live check');
    console.log('  \u2717 live check failed: ' + e.message);
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
