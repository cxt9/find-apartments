---
name: search-madlan
description: Use when scraping Madlan rental listings for a specific city and room count — uses Chrome DevTools MCP tools because Madlan blocks automated web_fetch requests with 403 errors
---

# Madlan Rental Scraper (Chrome DevTools)

Scrapes rental apartment listings from madlan.co.il using Chrome DevTools MCP tools. Madlan returns 403 on automated `WebFetch` requests, so we must use the browser.

## Prerequisites

- Chrome DevTools MCP server must be running and connected.
- If `mcp__chrome-devtools__list_pages` fails, report that Madlan scraping is unavailable and return an empty array. Do NOT fail the entire search run.

## Input

You will receive search parameters:
- `city` — city name in Hebrew (e.g., "הוד השרון")
- `min_rooms` — minimum number of rooms (e.g., 5)
- `max_price` — optional maximum monthly rent in NIS

## Scraping Process

### Step 1: Check Chrome DevTools availability

```
mcp__chrome-devtools__list_pages
```

If this fails, return empty results with a note: "Chrome DevTools unavailable — Madlan skipped."

### Step 2: Navigate to Madlan rental page

Build the Madlan URL for the city. The URL pattern for Madlan rental pages uses Hebrew URL-encoded city names:

```
mcp__chrome-devtools__navigate_page
URL: https://www.madlan.co.il/for-rent/{city_name_hebrew}-ישראל
```

For example, for הוד השרון: `https://www.madlan.co.il/for-rent/הוד-השרון-ישראל`

### Step 3: Apply room filter

Take a screenshot to see the current state, then use `evaluate_script` to interact with filters:

```
mcp__chrome-devtools__take_screenshot
```

Look for room filter controls. Use `evaluate_script` or `click` to set minimum rooms to the desired value.

### Step 4: Scroll and extract listings

Scroll down multiple times to load listings (Madlan uses infinite scroll):

```javascript
// Use evaluate_script to scroll and wait
() => { window.scrollBy(0, 1500); return 'scrolled'; }
```

Repeat 3-4 times with short pauses between scrolls. Take a screenshot after scrolling to verify content loaded.

### Step 5: Extract listing data from DOM

Use `evaluate_script` to extract listing data:

```javascript
() => {
  const listings = document.querySelectorAll('[data-testid="listing-card"], .listing-card, article');
  return Array.from(listings).map(el => ({
    text: el.innerText,
    href: el.querySelector('a')?.href || ''
  }));
}
```

Adapt the selectors based on what the screenshot shows. Madlan's DOM structure may change — use `take_snapshot` to inspect the element tree if selectors don't work.

### Step 6: Fetch individual listing details

For each listing URL found, navigate to it and extract details:

```
mcp__chrome-devtools__navigate_page URL: <listing URL>
mcp__chrome-devtools__take_screenshot
```

Use `evaluate_script` to extract: address, price, rooms, floor, size, amenities.

### Step 7: Normalize output

Return listings in the same normalized format as other scrapers:

```json
{
  "url": "https://www.madlan.co.il/listing/XXXXX",
  "source": "Madlan",
  "city": "{city}",
  "address": "...",
  "neighborhood": "...",
  "rooms": 5,
  "floor": "3/9",
  "size_sqm": 140,
  "price": 10000,
  "mamad": null,
  "parking": null,
  "elevator": null,
  "ac": null,
  "balcony": null,
  "pets": null,
  "available_from": "",
  "contact": null,
  "images": []
}
```

## Rules

- This scraper runs SEQUENTIALLY (not in parallel) because it shares the Chrome browser with the Facebook scraper.
- Fetch up to 10 listings per search.
- If Chrome DevTools is unavailable, return empty results gracefully — do not error.
- Use `take_screenshot` after each navigation to verify the page loaded correctly.
- Madlan's DOM changes frequently — if selectors fail, use `take_snapshot` to inspect and adapt.

## Output

Return the array of normalized listings. Report count found, count fetched, and note if Chrome DevTools was unavailable.
