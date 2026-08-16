# lowkeyhud — launch kit

One-liner: **Turn yourself into a HUD. Paste a few facts, get an animated, shareable card. No signup, no cap.**

---

## Post copy (X / Threads / Bluesky)

### Hero post
```
turn yourself into a HUD. no signup. no cap.

paste a few facts → animated, shareable card.
AURA meter · radar sweep · stat bars.

your grid is fine. your HUD is better.

→ lowkeyhud.com
```

### Short posts (drop anytime)
```
your personality, as a stats screen. lowkeyhud.com
```
```
i quantified my aura. it's 74/100 and it's a lifestyle. lowkeyhud.com
```
```
me, but with an AURA meter and a radar sweep. lowkeyhud.com
```

### Engagement bait (post the card image, this goes in the text)
```
rate my build. AURA 92 · FOCUS 40 · RIPPLES 66.

lowkeyhud.com
```

### The ask (seed the loop)
```
made a HUD of myself. tap it to remix yours. no signup.

lowkeyhud.com/generator
```

---

## Product Hunt draft

**Name:** lowkeyhud
**Tagline:** Turn yourself into a HUD — no signup, no cap.
**One-liner:** Paste a few facts and get an animated, shareable heads-up-display card — stat bars, an aura meter, and a radar sweep.
**Topics:** Social Media · Design Tools · Entertainment

**Description:**
lowkeyhud turns you into a HUD. Drop in a few facts about yourself and it renders an animated identity card — stat bars, an aura meter, a radar sweep — that you export and share anywhere. It's the opposite of a résumé: no buzzwords, no "thrilled to announce," just a cooler you in about 20 seconds.

- Animated card (PNG export; GIF + video loops on Pro)
- Share link that remixes your card for anyone who clicks
- A daily roast — one HUD read on your day, every day

No signup wall. Just a URL.

**First comment (maker):**
hey — i built this because posting about myself online is exhausting, but a stat screen is not. it's 20 seconds from "what's your deal" to a shareable card. here's me → [PASTE CARD LINK]. tap it to remix yours. ask me anything — and if your aura meter comes back lower than expected, that's between you and the radar.

**Likely Q&A, pre-answered:**
- *"It's a novelty — what's the point?"* → correct, it's a fun novelty. the point is you look cooler than your grid does, in 20 seconds.
- *"Is there a free tier?"* → yes. PNG export is free (small watermark). Pro removes the watermark and adds HD + GIF/video loops, $4 once.

---

## 3 ready-to-share cards

Each link opens the generator with that exact card rendered. To post as an **image** (images out-reach bare links by a lot): open the link → "Download PNG" (or "GIF" on Pro) → post the image with the caption + link.

**Exported PNGs and looping GIFs are already done** — `launch-cards/night-owl.png`, `launch-cards/2am-theorist.png`, `launch-cards/lowkey-legend.png` (1080×1350, watermarked, free tier) plus the same three as `.gif` (540×675, 18 frames, looping — these upload natively to X and Discord with motion). Re-render anytime with `node scripts/export-cards.mjs`.

### 1 · NIGHT OWL — the "up late again" card
`https://lowkeyhud.com/generator#mode=personal&name=NIGHT+OWL&cls=ARTIST&status=UP+LATE&lvl=6&tag=DOING+IT+LIVE&s1=68&s2=52&s3=80&chips=VIBES,DELULU,NO+MEETINGS`

Caption: `me at 2am — AURA intact, NO MEETINGS on the calendar. tap to remix →`

### 2 · 2AM THEORIST — the delulu one
`https://lowkeyhud.com/generator#mode=personal&name=2AM+THEORIST&cls=PHILOSOPHER&status=SLEEPY&lvl=5&tag=ONE+MORE+VIDEO&s1=90&s2=35&s3=72&chips=VIBES,DELULU,SNACK+ECONOMY`

Caption: `one more video. trust the process. (my HUD, obviously) →`

### 3 · LOWKEY LEGEND — the flex
`https://lowkeyhud.com/generator#mode=personal&name=LOWKEY+LEGEND&cls=MENACE&status=UNBOTHERED&lvl=11&tag=TOO+CHILL&s1=94&s2=40&s3=66&chips=NO+CAP,OFF+GRID,COLD+EMAILS`

Caption: `rate my build. AURA 94 · FOCUS 40 · RIPPLES 66. →`

*(A fourth, STUDIO GOBLIN, is on the landing gallery if you want variety.)*

---

## Posting notes

- **Post the image, not the bare link.** On X/Discord, a bare link gets no embed for card pages; a PNG/GIF gets the reach. Put the remix link in the post text.
- **Don't remove the watermark.** The small "lowkeyhud" mark on free exports is the whole distribution loop — it's what turns a share into a click back.
- **Share links unfurl.** Any link posted anywhere (landing, generator, roast, success) already carries OG/Twitter tags + `og.png`, so the text-preview card is on-brand.
- **The loop to hit:** post your card → someone taps "remix" → they make their card → they post theirs → repeat. The gallery on the landing page is the proof section for that.
