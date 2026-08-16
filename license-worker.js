// license-worker.js — Cloudflare Worker that validates lowkeyhud Pro license keys.
//
// It proxies the Lemon Squeezy License API (https://api.lemonsqueezy.com),
// which validates the license key itself and needs NO API key.
//
// Deploy:
//   npx wrangler deploy license-worker.js --name lowkeyhud-license
//
// Then set PRO_VALIDATE_URL in generator.html and roast.html to:
//   https://lowkeyhud-license.<your-subdomain>.workers.dev/validate

const LS_VALIDATE = "https://api.lemonsqueezy.com/v1/licenses/validate";
const ALLOW_ORIGIN = "https://lowkeyhud.com";

// Naive per-IP rate limit (in-memory, per isolate). 20/min stays well under
// Lemon Squeezy's 60/min global limit.
const hits = new Map();

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const dev = origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost");
  const allow = origin === ALLOW_ORIGIN || dev;
  return {
    "Access-Control-Allow-Origin": allow ? origin : ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function handle(request) {
  const headers = cors(request);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST" || url.pathname !== "/validate") {
    return json({ ok: false, message: "not found" }, 404, headers);
  }

  // rate limit
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

  // Proxy to Lemon Squeezy. Form-encoded, license key as the body.
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

export default {
  async fetch(request) { return handle(request); }
};
