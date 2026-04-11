---
name: search-madlan
description: Use when scraping Madlan rental listings for a specific city and room count — calls Madlan's internal GraphQL API directly via a Node.js script (no browser, no CAPTCHA).
---

# Madlan Rental Scraper (Direct API)

Scrapes rental apartment listings from madlan.co.il by calling their internal GraphQL API at `https://www.madlan.co.il/api2`. No browser required.

## Background

Madlan's HTML pages are protected by PerimeterX (HUMAN Security), which blocks `WebFetch`, Puppeteer, and most stealth approaches through TLS/JA3 fingerprinting and behavioral analysis. Their GraphQL API, however, is only gated by a Bearer token — not PerimeterX — and a visitor-role JWT captured from a real browser session works fine for read-only queries.

The token is baked into `scripts/madlan-api.mjs` and currently valid until 2027. If Madlan rotates the scheme or the token expires, re-capture a fresh one from the browser's Network tab (look for any `POST /api2` request and copy the `authorization: Bearer ...` header).

## Prerequisites

- Node.js 18+ (for global `fetch`).
- The plugin script at `scripts/madlan-api.mjs` must exist. Locate the plugin directory:

```bash
PLUGIN_DIR=$(find ~/.claude/plugins/cache -path "*/find-apartments/scripts/madlan-api.mjs" -exec dirname {} \; 2>/dev/null | head -1 | sed 's|/scripts||')
```

If not found, check `~/.claude/plugins/local/find-apartments/`.

## Input

- `city` — Hebrew city name (e.g., `"הוד השרון"`)
- `min_rooms` — minimum room count (e.g., `5`)
- `max_price` — optional (not yet filtered server-side; filter client-side after)

## Scraping

Run the script with the city and room count:

```bash
node "$PLUGIN_DIR/scripts/madlan-api.mjs" "הוד השרון" 5 --deal rent
```

Arguments:
1. City (quoted, Hebrew)
2. Minimum rooms (number — supports half rooms like `4.5`)
3. `--deal rent` (default) or `--deal buy`

The script converts spaces in the city name to hyphens and builds Madlan's `docId` pattern: `"<city>-ישראל"`. This works for standard Hebrew city names.

## Output

The script prints a single JSON object to stdout:

```json
{
  "total": 45,
  "count": 45,
  "listings": [
    {
      "url": "https://www.madlan.co.il/listings/DXVl8yEOS8M",
      "source": "Madlan",
      "city": "הוד השרון",
      "address": "הדרים 1",
      "neighborhood": "מגדיאל",
      "rooms": 5,
      "floor": "10",
      "size_sqm": 150,
      "price": 8500,
      "mamad": null,
      "parking": null,
      "elevator": null,
      "ac": null,
      "balcony": null,
      "pets": null,
      "available_from": "2026-04-01T12:21:49.000Z",
      "contact": null,
      "images": ["https://madlan.co.il/bulletins/..."]
    }
  ]
}
```

Parse the JSON and return `listings` from the skill. If `max_price` was passed as input, filter the listings array in-memory before returning.

## Error handling

- If the script exits non-zero, capture stderr, report `"Madlan API failed: <reason>"`, and return an empty array. Do NOT fail the entire search run.
- If the script returns an `errors` field or empty `poi`, return an empty array with a note.
- Common failure modes:
  - Expired or rotated JWT → fetch returns 401/403. Re-capture token from browser.
  - Madlan schema change → GraphQL errors. Update the query in `scripts/madlan-api.mjs`.

## Why this approach

Previous attempts that failed:
1. **`WebFetch`** — 403 from PerimeterX on every request.
2. **Chrome DevTools MCP** — captured the browser but PerimeterX still served the "press and hold" captcha on navigation.
3. **Puppeteer + stealth plugin** — bypassed `navigator.webdriver` and initial fingerprint, but PerimeterX caught behavioral/TLS signatures on the second request.
4. **Direct API** (current) — works because PerimeterX guards the HTML pages, not the JSON API. Zero browser, ~200ms per query, full listing details including images.
