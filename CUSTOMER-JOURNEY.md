# lowkeyhud — customer journey map

Every path from the landing page to "customer", where each one branches, and where each path dead-ends today.

**Status legend:** ✅ works today · 🟡 works, money dead · ⚠️ looks alive, stores nothing · ❌ dead-end · ⛔ blocked by empty wiring

---

## The core loop (the one that matters)

```
landing → generator → build card → download / copy link
                                          ↓
                              post to X / Discord
                                          ↓
                     someone clicks → card auto-renders
                                          ↓
                            they remix → make their own → share
                                          ↓
                              (repeat) → each one is a future Pro buyer
```

Everything below is a branch off this loop.

---

## Path A — The share loop (acquisition engine) ✅

1. Landing → **"Generate your HUD"** → generator.
2. Type facts (or accept the default `YOU, PROBABLY`) → live preview.
3. **Download PNG** (free, watermarked `lowkeyhud` diagonal) or **Copy link** (the URL carries the whole card as a hash).
4. Post it. Anyone who clicks the link gets the card auto-rendered, pre-filled, ready to remix.
5. Loop repeats. This is the only journey that fully works right now — it converts to *shares*, not *money*, because Path C's checkout is dead.
6. Since the upsell shipped: a free download now shows an **"unlock clean"** strip with one tap into the Pro modal — the loop finally has a money on-ramp.

## Path B — Gallery remix (fastest entry) ✅

1. Landing → **examples** → tap any of the 4 cards → generator opens pre-filled with that exact card (`#mode=personal&…`).
2. Remix 1–2 fields → share. Same loop as A, but the visitor sees output *before* typing — the highest-converting entry to the generator.

## Path C — The impulse Pro buy (the money path) ⛔ *one paste from alive*

1. Generator → **Download PNG** → see the watermark → (or click the ⚡ bar / GIF / Loop video buttons) → **Pro modal**.
2. **"Get Pro"** → `$4 once` → **Lemon Squeezy checkout** ← *blocked: `PRO_CHECKOUT_URL` empty → button hidden, modal says "checkout link not configured".*
3. Once wired: pay → Lemon's confirmation modal → **"Get your key"** → `/success?order=[order_identifier]`.
4. Success page polls the Worker's `/lookup` → key displayed → **"Unlock in the generator"** → `generator#pro=1` → key pre-filled → validate against Worker → **PRO on**.
5. From then on: no watermark, 2× HD export, GIF + video loops. The success page's **"what happens next"** box walks buyers through exactly this.

**Gaps between step 2 and PRO-on:** checkout URL (empty), Worker not deployed (`PRO_VALIDATE_URL` empty → only `DEMO123` works), webhook/KV lookup (`PRO_LOOKUP_URL` empty → success page falls back to "check your receipt email"). All four are ~10 minutes of wiring.

## Path D — The roast funnel (retention + second money path) 🟡

1. Landing → footer **daily roast** → roast page (amber card).
2. **Share the roast** (everyone gets the same one that day — the joke) or **Download PNG**.
3. **Streak + countdown** ("next roast in 07:12:33") — the only built-in *return* mechanic; what could make people come back daily.
4. Same Pro modal ($4) → same dead checkout.
5. Terminal: repeat daily visitor → eventually tries the generator → Path A/C.

## Path E — Email capture (lead funnel) ⚠️

1. Landing → **"Be lowkey about it"** → email form → button flips to "you're in ✓" — but `EMAIL_FORM_ID` is empty, so **zero emails are collected**.
2. Once wired (Formspree): subscriber → welcome → daily roast in inbox → return visits → conversion. The only journey that builds an asset (a list) instead of a one-off visitor.

## Path F — Career HUD (secondary product, alive) 🟡

1. Landing → footer **career HUD** → generator in `mode=career` (`ROLE`/`EXP`/`SKILL`/`REPUTATION`, amber accent).
2. Build → share on LinkedIn. Same watermark → same dead Pro path. Kept alive on purpose but out of the wedge.

## Path G — Desktop app (dead-end today) ❌

1. Landing → footer **desktop app** → GitHub source. **No installers exist** ("macOS / Windows / Linux — soon"), so this journey ends in "install what?" — pure dilution while it's source-only.

## Path H — Success page as an entry (edge case)

Someone reopens their `/success` link or lands with a key → sees it / copies it → unlocks in generator. Only matters after Path C is live.

---

## Where money can actually be made (the terminal points)

| Terminal | Path | Status |
|---|---|---|
| **Paying Pro customer ($4)** | C, D | ⛔ blocked by empty checkout URL + undeployed Worker |
| **Email subscriber (asset)** | E | ⚠️ no-op until Formspree ID |
| **Daily retainer (roast)** | D | works but unmonetized |
| **Sharers (distribution)** | A, B | working — the fuel for all of the above |

---

## The honest read

The site has a working acquisition loop (A + B) and a working retention hook (D) — the two things that matter most for a viral product. What it doesn't have is any way to turn that motion into money (C) or into an owned asset (E). Every path that ends in "customer" today ends in a wall with an empty string on it. The moment the checkout URL + Worker are wired, Paths A→C become a single continuous journey: *see card → want it clean → pay → unlock.* Until then, the loop spins and collects nothing.

The one journey worth optimizing for launch is **A → C**: get a visitor to the generator, get them to download (and see the watermark), and convert the watermark-gripe into a $4 unlock. Everything else (D/E/F/G) should feed that single path.

---

## Launch-week checklist (ordered by ROI)

| # | Step | Who | ~Time | Done when |
|---|------|-----|-------|-----------|
| 1 | **Wire the money loop** — paste `PRO_CHECKOUT_URL` (Lemon), `EMAIL_FORM_ID` (Formspree), deploy the Worker, paste `PRO_VALIDATE_URL` + `PRO_LOOKUP_URL` | you create → me pastes + ships | 15 min | "Get Pro" opens a real checkout on generator + roast; the email form actually submits |
| 2 | **Real test purchase** — buy the $4 product (Lemon test mode or real card) | you | 10 min | Full Path C works end-to-end: pay → /success → key → PRO on → HD export with no watermark |
| 3 | **Export the 3 launch cards as images** | me | 15 min | 3 PNGs (or GIFs) on disk, ready to post |
| 4 | **Seed the loop — launch day** — post the hero post + 3 cards (image + link), get friends to remix | you | 30 min | First shares; someone outside your circle remixes a card |
| 5 | **Product Hunt launch** — draft is ready in LAUNCH-KIT.md; pick a slot, ship it, answer comments | you | 30–60 min | PH page live with maker comment + card link |
| 6 | **Email sequence** — welcome + daily roast emails wired to the Formspree list | you approve → me wires | 45 min | First subscriber gets the welcome email |
| 7 | **Measure + iterate** — traffic, downloads, checkout clicks, upsell taps | both | ongoing | You know the one number that matters: conversions → $4 |
| 8 | **Hygiene before/around launch** — sweep dead CSS, set git identity, decide the desktop app's fate | me / you | 30 min | Site is clean; no empty-feeling pages |

Steps 1–2 are the entire difference between "ready to launch" and "live and charging" — nothing after them converts money without them. Step 4 is the biggest growth lever once 1–2 are closed: distribution beats features.
