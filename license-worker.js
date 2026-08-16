// license-worker.js — Cloudflare Worker for lowkeyhud Pro license keys.
//
// Three routes:
//   POST /validate            — proxy the Lemon Squeezy License API to check a key
//                               (no API key needed; the license key IS the credential).
//   POST /webhook             — receive signed Lemon Squeezy webhooks
//                               (order_created + license_key_created) and stash the
//                               license key in KV so it never appears in a redirect URL.
//   GET  /lookup?order=UUID   — return the stored key for an order identifier, so the
//                               /success page can fetch it after checkout.
//
// Why not put the key in the redirect URL? Lemon Squeezy's `[license_key]` link
// variable leaks the credential into the browser history, proxy logs and any
// screenshot of the URL bar. Instead the confirmation button redirects to
// /success?order=[order_identifier] — an opaque UUID that is NOT a credential —
// and this Worker joins it back to the key it stored from the webhook.
//
// Deploy (see wrangler.toml):
//   npx wrangler kv namespace create LOWKEYHUD_LICENSES   # paste id into wrangler.toml
//   npx wrangler secret put WEBHOOK_SECRET                # same value you put in Lemon Squeezy
//   npx wrangler deploy
//
// Then set:
//   PRO_VALIDATE_URL in generator.html + roast.html -> https://<worker>/validate
//   PRO_LOOKUP_URL  in success.html                   -> https://<worker>/lookup
// and in Lemon Squeezy:
//   Webhook  -> https://<worker>/webhook  (events: order_created + license_key_created)
//   Confirmation modal Button link -> https://lowkeyhud.com/success?order=[order_identifier]

const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";
const ALLOWED_ORIGINS = new Set([
  "https://lowkeyhud.com",
  "https://www.lowkeyhud.com",
  "https://lowkeyhud-site.vercel.app"
]);
const KEY_TTL = 60 * 60 * 24 * 7; // 7 days

// Naive per-IP rate limit (in-memory, per isolate). 20/min stays well under
// Lemon Squeezy's 60/min global limit. Webhooks + lookup are not rate limited.
const hits = new Map();

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const dev = origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost");
  const allow = ALLOWED_ORIGINS.has(origin) || dev;
  return {
    "Access-Control-Allow-Origin": allow ? origin : "https://lowkeyhud.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, extra)
  });
}

// Constant-time string comparison (same length after we normalize both to hex).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Lemon Squeezy signs the raw request body: HMAC-SHA256 hex digest with the
// webhook signing secret, sent in the X-Signature header.
async function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(hex, signature.trim().toLowerCase());
}

async function handleValidate(request, headers) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const now = Date.now();
  let win = hits.get(ip) || [];
  while (win.length && now - win[0] > 60000) win.shift();
  if (win.length >= 20) {
    return json({ ok: false, message: "too many tries — slow down, no cap." }, 429, headers);
  }
  win.push(now);
  hits.set(ip, win);

  let key;
  try {
    const body = await request.json();
    key = (body && body.license_key || "").trim();
  } catch (e) {
    return json({ ok: false, message: "bad request" }, 400, headers);
  }
  if (!key) {
    return json({ ok: false, message: "paste a code first." }, 400, headers);
  }

  let ls;
  try {
    ls = await fetch(LS_VALIDATE, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ license_key: key }).toString()
    });
  } catch (e) {
    return json({ ok: false, message: "couldn't reach the license server — try again." }, 502, headers);
  }

  if (!ls.ok) {
    return json({ ok: false, message: "that code isn't it. no cap." }, 200, headers);
  }

  let j;
  try { j = await ls.json(); } catch (e) { j = null; }

  if (j && j.valid) {
    return json({ ok: true }, 200, headers);
  }
  return json({ ok: false, message: "that code isn't it. no cap." }, 200, headers);
}

async function handleWebhook(request, env, headers) {
  // Must read the RAW body for the signature, then parse it ourselves.
  const raw = await request.text();
  const signature = request.headers.get("X-Signature") || "";
  const valid = await verifySignature(raw, signature, env.WEBHOOK_SECRET);
  if (!valid) {
    return json({ ok: false, message: "bad signature" }, 401, headers);
  }
  if (!env.LICENSES) {
    // Fail loudly — a webhook we can't store must not be acknowledged.
    return json({ ok: false, message: "KV not configured" }, 500, headers);
  }

  let body;
  try { body = JSON.parse(raw); } catch (e) {
    return json({ ok: false, message: "bad request" }, 400, headers);
  }

  const event = (body && body.meta && body.meta.event_name) ||
                request.headers.get("X-Event-Name") || "";
  const data = body && body.data;
  const attrs = (data && data.attributes) || {};

  if (event === "order_created") {
    // Join key: order_identifier (the UUID in the redirect URL) -> numeric order id.
    const id = data.id;
    const identifier = attrs.identifier;
    if (id != null && identifier) {
      await env.LICENSES.put(
        "order:" + identifier,
        JSON.stringify({ order_id: String(id), ts: Date.now() }),
        { expirationTtl: KEY_TTL }
      );
    }
  } else if (event === "license_key_created") {
    // Join key: numeric order id -> the license key itself.
    const key = attrs.key;
    const orderId = attrs.order_id;
    if (key && orderId != null) {
      await env.LICENSES.put(
        "key:" + orderId,
        JSON.stringify({ key: key, ts: Date.now() }),
        { expirationTtl: KEY_TTL }
      );
    }
  }
  // Always 200 so Lemon Squeezy doesn't retry (even for events we ignore).
  return json({ ok: true }, 200, headers);
}

async function handleLookup(url, env, headers) {
  const identifier = (url.searchParams.get("order") || "").trim();
  if (!identifier) {
    return json({ ok: false, message: "missing order" }, 400, headers);
  }
  if (!env.LICENSES) {
    return json({ ok: false, message: "not configured" }, 503, headers);
  }

  const orderRaw = await env.LICENSES.get("order:" + identifier);
  if (!orderRaw) {
    return json({ ok: false, message: "not ready" }, 404, headers);
  }
  let orderId;
  try { orderId = JSON.parse(orderRaw).order_id; } catch (e) {
    return json({ ok: false, message: "not ready" }, 404, headers);
  }

  const keyRaw = await env.LICENSES.get("key:" + orderId);
  if (!keyRaw) {
    return json({ ok: false, message: "not ready" }, 404, headers);
  }
  let key;
  try { key = JSON.parse(keyRaw).key; } catch (e) {
    return json({ ok: false, message: "not ready" }, 404, headers);
  }
  if (!key) {
    return json({ ok: false, message: "not ready" }, 404, headers);
  }
  return json({ ok: true, key: key }, 200, headers);
}

async function handle(request, env) {
  const headers = cors(request);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method === "POST" && url.pathname === "/validate") {
    return handleValidate(request, headers);
  }
  if (request.method === "POST" && url.pathname === "/webhook") {
    return handleWebhook(request, env || {}, headers);
  }
  if (request.method === "GET" && url.pathname === "/lookup") {
    return handleLookup(url, env || {}, headers);
  }
  return json({ ok: false, message: "not found" }, 404, headers);
}

export default {
  async fetch(request, env) { return handle(request, env); }
};
