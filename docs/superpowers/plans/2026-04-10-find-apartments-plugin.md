# Find Apartments Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a distributable Claude Code plugin that searches Israeli real estate platforms for rental apartments, deduplicates via local cache, syncs new findings to Google Sheets, and notifies via Telegram.

**Architecture:** A Claude Code plugin with slash commands (`/find-apartments`, `/find-apartments:status`), per-platform scraper skills, a Google Sheets sync script (Node.js via `googleapis`), and a local JSON cache. The orchestrator skill fans out parallel agents per platform, collects normalized results, deduplicates against the cache, appends new rows to Sheets, and sends Telegram notifications.

**Tech Stack:** Claude Code plugin format (plugin.json, SKILL.md, commands), Node.js (googleapis for Sheets API), YAML (user config), JSON (cache), curl (Telegram API), Chrome DevTools MCP (Madlan/Facebook scraping).

**Spec:** `docs/superpowers/specs/2026-04-10-find-apartments-plugin-design.md`

---

## File Map

```
find-apartments/
├── .claude-plugin/
│   ├── plugin.json                # Plugin manifest
│   └── marketplace.json           # Marketplace registration
├── package.json                   # Node.js deps (googleapis, js-yaml)
├── scripts/
│   └── google-sheets.mjs          # Sheets API: create sheet, append rows, read existing URLs
├── skills/
│   ├── cache/
│   │   └── SKILL.md               # Read/write cache.json, check if URL is new
│   ├── search/
│   │   └── SKILL.md               # Orchestrator: fan out scrapers, collect, dedup, sync, notify
│   ├── search-yad2/
│   │   └── SKILL.md               # Yad2 scraper via web_search + web_fetch
│   ├── search-madlan/
│   │   └── SKILL.md               # Madlan scraper via Chrome DevTools
│   ├── search-winwin/
│   │   └── SKILL.md               # WinWin scraper via web_search + web_fetch
│   ├── search-facebook/
│   │   └── SKILL.md               # Facebook group scraper via Chrome DevTools
│   ├── sync-sheet/
│   │   └── SKILL.md               # Append new listings to Google Sheet
│   └── notify/
│       └── SKILL.md               # Send new listings to Telegram
├── commands/
│   ├── find-apartments.md         # /find-apartments [city] [rooms]
│   └── status.md                  # /find-apartments:status
└── config.schema.json             # JSON Schema for config.yaml validation
```

Runtime data lives at `~/.claude/plugins/find-apartments/data/`:
- `config.yaml` — user search profiles and credentials
- `cache.json` — listing cache keyed by URL
- `sheet-id.txt` — Google Sheet ID (auto-created)

---

## Task 1: Plugin Scaffold and Manifest

**Files:**
- Create: `find-apartments/.claude-plugin/plugin.json`
- Create: `find-apartments/.claude-plugin/marketplace.json`
- Create: `find-apartments/package.json`
- Create: `find-apartments/config.schema.json`

- [ ] **Step 1: Create plugin directory structure**

```bash
mkdir -p find-apartments/.claude-plugin
mkdir -p find-apartments/scripts
mkdir -p find-apartments/skills/{cache,search,search-yad2,search-madlan,search-winwin,search-facebook,sync-sheet,notify}
mkdir -p find-apartments/commands
```

- [ ] **Step 2: Create plugin.json**

Create `find-apartments/.claude-plugin/plugin.json`:

```json
{
  "name": "find-apartments",
  "version": "1.0.0",
  "description": "Search Israeli real estate platforms for rental apartments with Google Sheets sync and Telegram notifications",
  "author": {
    "name": "Doron Goldberg"
  },
  "license": "MIT",
  "keywords": [
    "real-estate",
    "israel",
    "apartments",
    "rental",
    "yad2",
    "madlan"
  ],
  "commands": [
    "./commands/find-apartments.md",
    "./commands/status.md"
  ]
}
```

- [ ] **Step 3: Create marketplace.json**

Create `find-apartments/.claude-plugin/marketplace.json`:

```json
{
  "name": "find-apartments",
  "owner": {
    "name": "Doron Goldberg"
  },
  "plugins": [
    {
      "name": "find-apartments",
      "source": "./",
      "description": "Search Israeli real estate platforms for rental apartments with Google Sheets sync and Telegram notifications",
      "version": "1.0.0",
      "author": {
        "name": "Doron Goldberg"
      },
      "license": "MIT",
      "keywords": [
        "real-estate",
        "israel",
        "apartments",
        "rental"
      ]
    }
  ]
}
```

- [ ] **Step 4: Create package.json**

Create `find-apartments/package.json`:

```json
{
  "name": "find-apartments",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "googleapis": "^144.0.0",
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 5: Create config.schema.json**

Create `find-apartments/config.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["searches", "telegram", "google_sheets"],
  "properties": {
    "searches": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["city", "min_rooms"],
        "properties": {
          "city": { "type": "string" },
          "min_rooms": { "type": "integer", "minimum": 1 },
          "max_price": { "type": "integer", "minimum": 0 }
        }
      }
    },
    "telegram": {
      "type": "object",
      "required": ["bot_token", "chat_id"],
      "properties": {
        "bot_token": { "type": "string" },
        "chat_id": { "type": "string" }
      }
    },
    "google_sheets": {
      "type": "object",
      "required": ["credentials_path"],
      "properties": {
        "credentials_path": { "type": "string" }
      }
    },
    "facebook_groups": {
      "type": "array",
      "items": { "type": "string", "format": "uri" }
    }
  }
}
```

- [ ] **Step 6: Install dependencies**

```bash
cd find-apartments && npm install
```

- [ ] **Step 7: Commit**

```bash
git add find-apartments/.claude-plugin/ find-apartments/package.json find-apartments/package-lock.json find-apartments/node_modules/ find-apartments/config.schema.json
git commit -m "feat: scaffold find-apartments plugin with manifest and deps"
```

Note: Add `node_modules/` to `.gitignore` if one exists. If not, create one:
```
find-apartments/node_modules/
```

---

## Task 2: Google Sheets Script

**Files:**
- Create: `find-apartments/scripts/google-sheets.mjs`

This script is invoked by the sync-sheet skill via `node scripts/google-sheets.mjs <action> [args]`. It handles three actions: `create` (create a new sheet), `append` (add rows), and `list-urls` (get existing listing URLs for dedup verification).

- [ ] **Step 1: Create google-sheets.mjs**

Create `find-apartments/scripts/google-sheets.mjs`:

```javascript
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const DATA_DIR = resolve(homedir(), '.claude/plugins/find-apartments/data');
const SHEET_ID_FILE = resolve(DATA_DIR, 'sheet-id.txt');

const COLUMNS = [
  'Date Found', 'City', 'Source', 'Address', 'Neighborhood',
  'Rooms', 'Floor', 'Size (m²)', 'Price (₪)', 'Mamad',
  'Parking', 'Elevator', 'AC', 'Balcony', 'Pets',
  'Available From', 'Link', 'Status'
];

async function getAuth(credentialsPath) {
  const resolvedPath = credentialsPath.replace(/^~/, homedir());
  const credentials = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

async function createSheet(credentialsPath, title) {
  const auth = await getAuth(credentialsPath);
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{
        properties: { title: 'Listings' },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{
            values: COLUMNS.map(col => ({
              userEnteredValue: { stringValue: col },
              userEnteredFormat: { textFormat: { bold: true } }
            }))
          }]
        }]
      }]
    }
  });

  const spreadsheetId = response.data.spreadsheetId;

  // Freeze header row and auto-resize
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: COLUMNS.length }
          }
        }
      ]
    }
  });

  // Save sheet ID
  writeFileSync(SHEET_ID_FILE, spreadsheetId, 'utf-8');
  console.log(JSON.stringify({ spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` }));
}

async function appendRows(credentialsPath, rowsJson) {
  const spreadsheetId = readFileSync(SHEET_ID_FILE, 'utf-8').trim();
  const auth = await getAuth(credentialsPath);
  const sheets = google.sheets({ version: 'v4', auth });
  const rows = JSON.parse(rowsJson);

  const values = rows.map(row => [
    row.date_found || new Date().toISOString().split('T')[0],
    row.city || '',
    row.source || '',
    row.address || '',
    row.neighborhood || '',
    row.rooms ?? '',
    row.floor || '',
    row.size_sqm ?? '',
    row.price ?? '',
    row.mamad === true ? 'Yes' : row.mamad === false ? 'No' : '',
    row.parking || '',
    row.elevator === true ? 'Yes' : row.elevator === false ? 'No' : '',
    row.ac === true ? 'Yes' : row.ac === false ? 'No' : '',
    row.balcony === true ? 'Yes' : row.balcony === false ? 'No' : '',
    row.pets === true ? 'Yes' : row.pets === false ? 'No' : '',
    row.available_from || '',
    row.url || '',
    ''  // Status — always empty, user-managed
  ]);

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Listings!A:R',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });

  console.log(JSON.stringify({ appended: response.data.updates.updatedRows }));
}

async function listUrls(credentialsPath) {
  const spreadsheetId = readFileSync(SHEET_ID_FILE, 'utf-8').trim();
  const auth = await getAuth(credentialsPath);
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Listings!Q:Q',  // Link column
  });

  const urls = (response.data.values || [])
    .flat()
    .filter(url => url && url !== 'Link');  // Skip header

  console.log(JSON.stringify({ urls }));
}

// CLI dispatcher
const [action, ...args] = process.argv.slice(2);

switch (action) {
  case 'create':
    await createSheet(args[0], args[1] || 'Apartment Listings');
    break;
  case 'append':
    await appendRows(args[0], args[1]);
    break;
  case 'list-urls':
    await listUrls(args[0]);
    break;
  default:
    console.error(`Usage: node google-sheets.mjs <create|append|list-urls> <credentials_path> [args]`);
    process.exit(1);
}
```

- [ ] **Step 2: Test the script can be parsed without errors**

```bash
cd find-apartments && node -c scripts/google-sheets.mjs
```

Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add find-apartments/scripts/google-sheets.mjs
git commit -m "feat: add Google Sheets API script for create/append/list-urls"
```

---

## Task 3: Cache Skill

**Files:**
- Create: `find-apartments/skills/cache/SKILL.md`

The cache skill instructs the agent how to read/write the local JSON cache file, check if a listing URL is already known, and update sync/notify flags.

- [ ] **Step 1: Create cache SKILL.md**

Create `find-apartments/skills/cache/SKILL.md`:

````markdown
---
name: cache
description: Use when checking if a listing URL is already cached, adding new listings to the cache, or updating sync/notify flags after Google Sheets or Telegram operations
---

# Listing Cache Manager

Manages the local JSON cache at `~/.claude/plugins/find-apartments/data/cache.json`. The cache is the single source of truth for deduplication — a listing is "new" if its URL is not a key in this file.

## Cache File Format

```json
{
  "https://www.yad2.co.il/item/abc123": {
    "first_seen": "2026-04-10",
    "city": "הוד השרון",
    "price": 9000,
    "rooms": 5,
    "address": "יונה וולך 4",
    "source": "Yad2",
    "synced_to_sheet": true,
    "notified": true
  }
}
```

## Operations

### Check if URL is new

Read `~/.claude/plugins/find-apartments/data/cache.json` using the Read tool. If the file doesn't exist, all listings are new. Check if the listing URL exists as a key in the JSON object.

### Add new listings to cache

After scraping, for each new listing (URL not in cache), add an entry:

```bash
# Read existing cache (or start with empty object)
# Add new entries with synced_to_sheet: false, notified: false
# Write back with the Write tool
```

Use the Read tool to read the current cache, then use the Write tool to write the updated cache. Always set `first_seen` to today's date (ISO format), `synced_to_sheet` to `false`, and `notified` to `false` for new entries.

### Update flags after sync/notify

After successful Google Sheets append, update `synced_to_sheet` to `true` for the synced URLs.
After successful Telegram send, update `notified` to `true` for the notified URLs.

Read the cache, update the flags, write it back.

### Find un-synced listings

Read the cache and filter for entries where `synced_to_sheet` is `false` — these need to be retried for sheet sync. Similarly filter `notified` is `false` for Telegram retries.

## Data Directory

Ensure `~/.claude/plugins/find-apartments/data/` exists before reading/writing:

```bash
mkdir -p ~/.claude/plugins/find-apartments/data
```

If `cache.json` does not exist, treat it as an empty object `{}`.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/cache/SKILL.md
git commit -m "feat: add cache skill for listing deduplication"
```

---

## Task 4: Search-Yad2 Skill

**Files:**
- Create: `find-apartments/skills/search-yad2/SKILL.md`

- [ ] **Step 1: Create search-yad2 SKILL.md**

Create `find-apartments/skills/search-yad2/SKILL.md`:

````markdown
---
name: search-yad2
description: Use when scraping Yad2 rental listings for a specific city and room count — uses web_search to find the listing page then web_fetch on each individual listing to extract full details
---

# Yad2 Rental Scraper

Scrapes rental apartment listings from yad2.co.il for a given city and minimum room count.

## Input

You will receive search parameters:
- `city` — city name in Hebrew (e.g., "הוד השרון")
- `min_rooms` — minimum number of rooms (e.g., 5)
- `max_price` — optional maximum monthly rent in NIS

## Scraping Process

### Step 1: Search for the listing page

Use `WebSearch` to find the Yad2 rental search page for the city:

```
WebSearch: "דירה להשכרה {city} {min_rooms} חדרים site:yad2.co.il"
```

Look for a URL matching this pattern:
`https://www.yad2.co.il/realestate/rent?topArea=19&area=54&city=XXXX&minRooms=Y`

### Step 2: Fetch the search results page

Use `WebFetch` on the Yad2 search URL. Ask it to extract all listing IDs and basic info:

```
WebFetch URL: <the yad2 search URL>
Prompt: "Extract all apartment rental listings. For each listing, get: listing ID, price, address/neighborhood, number of rooms, floor, size in sqm, and any amenities. Return as a structured list."
```

This returns listing IDs like `fity5pgk`, `pvbzzxjg`, etc.

### Step 3: Fetch each individual listing

For each listing ID found, fetch the full details:

```
WebFetch URL: https://www.yad2.co.il/item/{listing_id}
Prompt: "Extract ALL details: full address, price, rooms, floor, size, amenities (parking, elevator, mamad, balcony, AC, storage, pets), available date, contact info, image URLs."
```

### Step 4: Normalize output

Return each listing in this normalized JSON format:

```json
{
  "url": "https://www.yad2.co.il/item/{id}",
  "source": "Yad2",
  "city": "{city}",
  "address": "extracted address",
  "neighborhood": "extracted neighborhood or empty string",
  "rooms": 5,
  "floor": "9/23",
  "size_sqm": 130,
  "price": 9000,
  "mamad": true,
  "parking": "2",
  "elevator": true,
  "ac": true,
  "balcony": true,
  "pets": null,
  "available_from": "מיידי",
  "contact": null,
  "images": []
}
```

## Rules

- Always fetch individual listing pages — the search results page only has partial data.
- Use `null` for fields where data is not available.
- Use boolean `true`/`false` for mamad, elevator, ac, balcony, pets when the answer is clear. Use `null` if not mentioned.
- For parking, use a string like "2, covered" or "1" or "none".
- For floor, use format "X/Y" where X is the apartment floor and Y is total building floors.
- Fetch up to 15 listings per search to avoid excessive API calls.
- If WebFetch fails for a specific listing, skip it and continue with others.

## Output

Return the complete array of normalized listing objects as a JSON array. Report how many listings were found and how many were successfully fetched.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/search-yad2/SKILL.md
git commit -m "feat: add Yad2 scraper skill"
```

---

## Task 5: Search-WinWin Skill

**Files:**
- Create: `find-apartments/skills/search-winwin/SKILL.md`

- [ ] **Step 1: Create search-winwin SKILL.md**

Create `find-apartments/skills/search-winwin/SKILL.md`:

````markdown
---
name: search-winwin
description: Use when scraping WinWin rental listings for a specific city and room count — uses web_search to find listings then web_fetch on each individual listing page to extract full details
---

# WinWin Rental Scraper

Scrapes rental apartment listings from winwin.co.il for a given city and minimum room count.

## Input

You will receive search parameters:
- `city` — city name in Hebrew (e.g., "הוד השרון")
- `min_rooms` — minimum number of rooms (e.g., 5)
- `max_price` — optional maximum monthly rent in NIS

## Scraping Process

### Step 1: Search for listings

Use `WebSearch` with domain filter:

```
WebSearch: "דירה להשכרה {city} {min_rooms} חדרים site:winwin.co.il"
```

### Step 2: Fetch the search results

Use `WebFetch` on the WinWin search results page to extract individual listing URLs. Look for URLs matching patterns like:
`https://www.winwin.co.il/RealEstate/ForRent/Ads/RealEstateAds,XXXXXXX.aspx`

### Step 3: Fetch each individual listing

For each listing URL found, fetch full details:

```
WebFetch URL: <listing URL>
Prompt: "Extract ALL details about this rental listing: full address, price, rooms, floor, size in sqm, amenities (parking, elevator, mamad, balcony, AC, storage, pets), available date, contact info, and image URLs."
```

### Step 4: Normalize output

Return each listing in the normalized format:

```json
{
  "url": "https://www.winwin.co.il/RealEstate/ForRent/Ads/RealEstateAds,XXXXXXX.aspx",
  "source": "WinWin",
  "city": "{city}",
  "address": "extracted address",
  "neighborhood": "extracted neighborhood or empty string",
  "rooms": 5,
  "floor": "3/8",
  "size_sqm": 150,
  "price": 8000,
  "mamad": true,
  "parking": "1",
  "elevator": true,
  "ac": true,
  "balcony": true,
  "pets": null,
  "available_from": "",
  "contact": null,
  "images": []
}
```

## Rules

- Same normalization rules as Yad2: boolean for yes/no fields, string for parking, "X/Y" for floor, null for unknown.
- Fetch up to 10 listings per search.
- If a search returns no specific listing URLs (only category pages), note "0 listings found on WinWin" and return an empty array.
- If WebFetch fails for a listing, skip it and continue.

## Output

Return the complete array of normalized listing objects. Report count found and count successfully fetched.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/search-winwin/SKILL.md
git commit -m "feat: add WinWin scraper skill"
```

---

## Task 6: Search-Madlan Skill (Chrome DevTools)

**Files:**
- Create: `find-apartments/skills/search-madlan/SKILL.md`

- [ ] **Step 1: Create search-madlan SKILL.md**

Create `find-apartments/skills/search-madlan/SKILL.md`:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/search-madlan/SKILL.md
git commit -m "feat: add Madlan scraper skill using Chrome DevTools"
```

---

## Task 7: Search-Facebook Skill (Chrome DevTools)

**Files:**
- Create: `find-apartments/skills/search-facebook/SKILL.md`

- [ ] **Step 1: Create search-facebook SKILL.md**

Create `find-apartments/skills/search-facebook/SKILL.md`:

````markdown
---
name: search-facebook
description: Use when scraping Facebook group rental listings using Chrome DevTools MCP tools — requires user to be logged into Facebook in their local Chrome browser
---

# Facebook Group Rental Scraper (Chrome DevTools)

Scrapes rental listings from Facebook groups using Chrome DevTools MCP tools. Requires the user to be logged into Facebook in their local Chrome browser.

## Prerequisites

- Chrome DevTools MCP server must be running and connected.
- User must be logged into Facebook in Chrome.
- Facebook groups to search are listed in `config.yaml` under `facebook_groups`.

## Input

You will receive:
- `city` — city name in Hebrew (e.g., "הוד השרון")
- `min_rooms` — minimum number of rooms (e.g., 5)
- `groups` — array of Facebook group URLs from config

## Scraping Process

### Step 1: Check Chrome DevTools availability

```
mcp__chrome-devtools__list_pages
```

If this fails, return empty results with a note: "Chrome DevTools unavailable — Facebook skipped."

### Step 2: Navigate to each Facebook group

For each group URL in the config:

```
mcp__chrome-devtools__navigate_page
URL: https://www.facebook.com/groups/XXXXXXXXX
```

### Step 3: Verify login and access

```
mcp__chrome-devtools__take_screenshot
```

Check the screenshot:
- If a login page appears, report "Facebook login required — skipping" and return empty.
- If a "Join group" prompt appears, report "Group membership required for [group URL]" and skip to the next group.
- If the group feed is visible, proceed.

### Step 4: Scroll to load posts

Scroll down multiple times to load recent posts:

```javascript
() => { window.scrollBy(0, 1500); return 'scrolled'; }
```

Repeat 4-5 times. Facebook loads posts dynamically — take screenshots between scrolls to verify new content.

### Step 5: Extract post content

Use `evaluate_script` to extract post text:

```javascript
() => {
  const posts = document.querySelectorAll('[data-ad-comet-preview="message"], [role="article"]');
  return Array.from(posts).slice(0, 20).map(post => ({
    text: post.innerText?.substring(0, 1000) || '',
    links: Array.from(post.querySelectorAll('a')).map(a => a.href)
  }));
}
```

### Step 6: Filter relevant posts

From the extracted posts, filter for ones that mention:
- The target city in Hebrew (e.g., הוד השרון)
- Room count keywords: 5 חדרים, 6 חדרים, etc. (>= min_rooms)
- Rental keywords: להשכרה, השכרה

### Step 7: Extract details from relevant posts

For each relevant post, parse the text to extract:
- Address (look for street names)
- Price (look for ₪ or ש"ח followed by numbers)
- Room count (X חדרים)
- Size (X מ"ר or X sqm)
- Any amenities mentioned (חניה, מעלית, ממ"ד, מרפסת, מיזוג)
- Post permalink (extract from timestamp link or construct from post ID)

Use `click` on the post timestamp to get the permalink URL if needed.

### Step 8: Normalize output

```json
{
  "url": "https://www.facebook.com/groups/XXXXX/posts/YYYYY",
  "source": "Facebook",
  "city": "{city}",
  "address": "extracted from post text",
  "neighborhood": "",
  "rooms": 5,
  "floor": "",
  "size_sqm": null,
  "price": 8500,
  "mamad": null,
  "parking": null,
  "elevator": null,
  "ac": null,
  "balcony": null,
  "pets": null,
  "available_from": "",
  "contact": "extracted phone number if visible",
  "images": []
}
```

## Rules

- Runs SEQUENTIALLY — shares Chrome browser with Madlan scraper.
- Posts are in Hebrew — parse Hebrew text for details.
- Facebook posts are unstructured — extract what you can, use `null` for missing fields.
- If post text is ambiguous about room count, include it if it might match (err on inclusion).
- Limit to 10 most recent matching posts per group.
- If a group is inaccessible (not a member, login required), skip it and note it in the output.

## Output

Return the array of normalized listings from all groups. Report: groups searched, posts scanned, matching listings found. List any inaccessible groups separately.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/search-facebook/SKILL.md
git commit -m "feat: add Facebook group scraper skill using Chrome DevTools"
```

---

## Task 8: Sync-Sheet Skill

**Files:**
- Create: `find-apartments/skills/sync-sheet/SKILL.md`

- [ ] **Step 1: Create sync-sheet SKILL.md**

Create `find-apartments/skills/sync-sheet/SKILL.md`:

````markdown
---
name: sync-sheet
description: Use when appending new rental listings to the Google Sheet — creates the sheet on first run, appends rows for new listings, and never overwrites existing data
---

# Google Sheets Sync

Manages the Google Sheet that stores all rental listings. Uses the Node.js script at `scripts/google-sheets.mjs` within the plugin directory.

## Prerequisites

- `config.yaml` must have `google_sheets.credentials_path` pointing to a valid Google service account JSON file.
- The `googleapis` npm package must be installed (via the plugin's `package.json`).

## Finding the Plugin Directory

The google-sheets.mjs script lives in the plugin's install directory. Use this to locate it:

```bash
PLUGIN_DIR=$(find ~/.claude/plugins/cache -path "*/find-apartments/scripts/google-sheets.mjs" -exec dirname {} \; 2>/dev/null | head -1 | sed 's|/scripts||')
```

If not found, check `~/.claude/plugins/local/find-apartments/scripts/google-sheets.mjs`.

## Operations

### First Run: Create the Sheet

Check if `~/.claude/plugins/find-apartments/data/sheet-id.txt` exists. If not, create the sheet:

```bash
mkdir -p ~/.claude/plugins/find-apartments/data
node "$PLUGIN_DIR/scripts/google-sheets.mjs" create "<credentials_path>"
```

This creates a new Google Sheet named "Apartment Listings" with the header row and formatting, and saves the sheet ID to `sheet-id.txt`.

The output is JSON: `{"spreadsheetId": "...", "url": "https://docs.google.com/spreadsheets/d/..."}`.

Report the URL to the user so they can bookmark it.

### Append New Listings

Pass an array of listing objects as JSON:

```bash
node "$PLUGIN_DIR/scripts/google-sheets.mjs" append "<credentials_path>" '<json_array>'
```

The JSON array should contain objects with these fields (matching the normalized listing format):
```json
[
  {
    "date_found": "2026-04-10",
    "city": "הוד השרון",
    "source": "Yad2",
    "address": "יונה וולך 4",
    "neighborhood": "גרין פארק",
    "rooms": 5,
    "floor": "9/23",
    "size_sqm": 130,
    "price": 9000,
    "mamad": true,
    "parking": "2",
    "elevator": true,
    "ac": true,
    "balcony": true,
    "pets": null,
    "available_from": "מיידי",
    "url": "https://www.yad2.co.il/item/fity5pgk"
  }
]
```

Output: `{"appended": N}` where N is the number of rows added.

### Sharing the Sheet

After creating the sheet, remind the user to share it with their personal Google account. The sheet is owned by the service account — the user needs to:
1. Open the sheet URL
2. Or add their email as an editor via the Google Cloud Console

Alternatively, add a sharing step in the script if the user provides their email in config.

## Error Handling

- If the script fails (credentials invalid, network error), report the error but do NOT stop the run.
- The cache skill will keep `synced_to_sheet: false` for failed listings — they'll be retried next run.
- If `sheet-id.txt` is missing but listings exist in cache with `synced_to_sheet: false`, create a new sheet first, then sync the un-synced listings.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/sync-sheet/SKILL.md
git commit -m "feat: add Google Sheets sync skill"
```

---

## Task 9: Notify Skill (Telegram)

**Files:**
- Create: `find-apartments/skills/notify/SKILL.md`

- [ ] **Step 1: Create notify SKILL.md**

Create `find-apartments/skills/notify/SKILL.md`:

````markdown
---
name: notify
description: Use when sending new rental listings to Telegram after they have been synced to Google Sheets — sends each listing as a separate formatted message via the Telegram Bot API
---

# Telegram Notification Sender

Sends new rental listings to Telegram via the Bot API. Only called for listings that are new (not in cache) and have been successfully synced to Google Sheets.

## Prerequisites

- `config.yaml` must have `telegram.bot_token` and `telegram.chat_id`.

## Input

You will receive:
- `bot_token` — Telegram bot API token from config
- `chat_id` — Telegram chat ID from config
- `listings` — array of normalized listing objects to send

## Sending Messages

For each listing, send a separate Telegram message using curl:

```bash
curl -s -X POST "https://api.telegram.org/bot{bot_token}/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "{chat_id}",
    "text": "🏠 *{address}, {city}*\n💰 מחיר: ₪{price}\n🛏 חדרים: {rooms}\n📐 שטח: {size_sqm} מ\"ר\n🅿️ חניה: {parking} | 🛡 ממ\"ד: {mamad} | 🛗 מעלית: {elevator}\n📅 כניסה: {available_from}\n🔗 [קישור למודעה]({url})\n📊 מקור: {source}",
    "parse_mode": "Markdown",
    "disable_web_page_preview": false
  }'
```

### Field Formatting

- **price**: Format with commas (e.g., 9,000). If null, show "לא צוין".
- **mamad**: Show "כן" for true, "לא" for false, "-" for null.
- **elevator**: Same as mamad.
- **parking**: Show the string value, or "-" if null/empty.
- **size_sqm**: Show number, or "-" if null.
- **available_from**: Show the string, or "-" if empty.

### Sending Rate

- Send messages with a brief pause between them (no explicit sleep needed — the sequential curl calls provide natural spacing).
- If a send fails (non-200 response), log the error but continue with the remaining listings.

## Output

Report:
- Number of messages sent successfully.
- Number of failures (if any), with error details.
- The cache skill should then update `notified: true` for successfully sent listings.

## Error Handling

- If `bot_token` or `chat_id` is missing from config, report the error and skip all notifications.
- If a specific message fails, continue with the rest — don't abort.
- Failed notifications will have `notified: false` in cache and will be retried on the next run.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/notify/SKILL.md
git commit -m "feat: add Telegram notification skill"
```

---

## Task 10: Search Orchestrator Skill

**Files:**
- Create: `find-apartments/skills/search/SKILL.md`

This is the core skill that coordinates the entire search pipeline.

- [ ] **Step 1: Create search SKILL.md**

Create `find-apartments/skills/search/SKILL.md`:

````markdown
---
name: search
description: Use when orchestrating a full apartment search run — reads config, fans out parallel scraper agents per platform, collects results, deduplicates against cache, syncs new listings to Google Sheets, and sends Telegram notifications
---

# Search Orchestrator

Coordinates the full apartment search pipeline: scrape all platforms, dedup, sync to sheet, notify via Telegram.

## Input

Either:
- **From config**: Read `~/.claude/plugins/find-apartments/data/config.yaml` for search profiles
- **From CLI args**: `city` and `min_rooms` provided directly (one-off search)

If CLI args are provided, use them as a single search profile. Otherwise, use all profiles from config.

## Pipeline

### Phase 1: Load Config

Read `~/.claude/plugins/find-apartments/data/config.yaml`.

If the file doesn't exist, stop and tell the user:
> "No config found. Create `~/.claude/plugins/find-apartments/data/config.yaml` with your search profiles, Telegram credentials, and Google Sheets credentials path. See the plugin README for the format."

Extract:
- `searches` — array of search profiles
- `telegram.bot_token` and `telegram.chat_id`
- `google_sheets.credentials_path`
- `facebook_groups` — optional

### Phase 2: Load Cache

Invoke the **cache** skill to read the current cache from `~/.claude/plugins/find-apartments/data/cache.json`. Collect all known URLs.

Also check for un-synced listings (`synced_to_sheet: false` or `notified: false`) — these will be retried alongside new findings.

### Phase 3: Fan Out Scrapers

For each search profile, launch scrapers:

**Parallel group (web-based, launch all at once using the Agent tool):**
- Invoke **search-yad2** skill — pass city, min_rooms, max_price
- Invoke **search-winwin** skill — pass city, min_rooms, max_price

**Sequential group (Chrome-based, one at a time):**
- Invoke **search-madlan** skill — pass city, min_rooms, max_price
- Invoke **search-facebook** skill — pass city, min_rooms, facebook_groups from config

Launch the parallel agents using the Agent tool with `run_in_background: true` for Yad2 and WinWin. Run Madlan and Facebook sequentially in the foreground.

Wait for all agents to complete and collect their listing arrays.

### Phase 4: Dedup Against Cache

Combine all listings from all scrapers into one array. For each listing:
- If `listing.url` exists in the cache AND `synced_to_sheet` is `true` AND `notified` is `true` → skip (fully processed)
- If `listing.url` exists in the cache but flags are `false` → include for retry
- If `listing.url` is NOT in the cache → new listing, include

### Phase 5: Update Cache

Invoke the **cache** skill to add all new listings to cache with `synced_to_sheet: false` and `notified: false`.

### Phase 6: Sync to Google Sheet

Invoke the **sync-sheet** skill with the array of new + un-synced listings and the `credentials_path` from config.

If successful, invoke the **cache** skill to update `synced_to_sheet: true` for the synced URLs.

### Phase 7: Send Telegram Notifications

Invoke the **notify** skill with the successfully synced listings, `bot_token`, and `chat_id` from config.

If successful, invoke the **cache** skill to update `notified: true` for the notified URLs.

### Phase 8: Summary

Report to the user:

```
## Search Complete

- **Profiles searched:** N cities
- **Platforms scraped:** Yad2, WinWin, Madlan, Facebook (list which succeeded)
- **Total listings found:** X
- **New listings:** Y (not seen before)
- **Synced to Google Sheet:** Z rows appended
- **Telegram notifications sent:** W messages
- **Sheet URL:** https://docs.google.com/spreadsheets/d/...

### Skipped Platforms
- [List any platforms that were unavailable with reason]

### Also Check Manually
- WhatsApp groups for {city} real estate
- [Any Facebook groups that couldn't be accessed]
```

## Error Recovery

- If one scraper fails, continue with the others. Report the failure in the summary.
- If Google Sheets sync fails, still attempt Telegram notifications for any cached-but-un-notified listings.
- If Telegram fails, listings remain in cache with `notified: false` for next run.
- Never let a single platform failure abort the entire pipeline.
````

- [ ] **Step 2: Commit**

```bash
git add find-apartments/skills/search/SKILL.md
git commit -m "feat: add search orchestrator skill"
```

---

## Task 11: User-Facing Commands

**Files:**
- Create: `find-apartments/commands/find-apartments.md`
- Create: `find-apartments/commands/status.md`

- [ ] **Step 1: Create find-apartments.md command**

Create `find-apartments/commands/find-apartments.md`:

````markdown
---
description: Search Israeli real estate platforms for rental apartments. Syncs to Google Sheets and notifies via Telegram. Use with args like "הוד השרון 5" for one-off or without args to run all saved profiles.
---

# Find Apartments

Search for rental apartments across Israeli real estate platforms (Yad2, Madlan, WinWin, Facebook groups).

## Arguments

- `$ARGUMENTS` — optional: `<city> <min_rooms>` for a one-off search (e.g., "הוד השרון 5")

## Preflight

1. Check if config exists at `~/.claude/plugins/find-apartments/data/config.yaml`
2. If no config AND no arguments provided, walk the user through creating one:
   - Ask for cities and room counts to search
   - Ask for Telegram bot token and chat ID
   - Ask for Google service account credentials path
   - Write the config file
3. If arguments are provided, they override the config for this run

## Execution

Invoke the **search** skill with either:
- The parsed CLI arguments (city and min_rooms from `$ARGUMENTS`)
- Or all profiles from config.yaml (if no arguments)

The search skill handles the full pipeline: scrape → dedup → sheet sync → notify.

## First Run

On the very first run (no `sheet-id.txt` exists), the sync-sheet skill will create a new Google Sheet and report the URL. Remind the user to bookmark it and optionally share it with their personal Google account.
````

- [ ] **Step 2: Create status.md command**

Create `find-apartments/commands/status.md`:

````markdown
---
description: Show the current state of the apartment search — cached listings count, last run date, Google Sheet link, and active search profiles.
---

# Find Apartments Status

Show the current state of the apartment search system.

## Execution

1. **Read cache**: Read `~/.claude/plugins/find-apartments/data/cache.json`
   - Count total cached listings
   - Find the most recent `first_seen` date (last run date)
   - Count listings with `synced_to_sheet: false` (pending sync)
   - Count listings with `notified: false` (pending notification)

2. **Read sheet ID**: Read `~/.claude/plugins/find-apartments/data/sheet-id.txt`
   - If exists, show the Google Sheet URL: `https://docs.google.com/spreadsheets/d/{sheet_id}`
   - If not, show "No Google Sheet created yet"

3. **Read config**: Read `~/.claude/plugins/find-apartments/data/config.yaml`
   - List each search profile (city, min_rooms, max_price)
   - Show Telegram status (configured yes/no)
   - Show Google Sheets status (credentials path configured yes/no)
   - List Facebook groups (if any)

## Output Format

```
## Apartment Search Status

📊 **Cache:** X listings total
📅 **Last run:** YYYY-MM-DD
⏳ **Pending sync:** Y listings
⏳ **Pending notify:** Z listings
📋 **Google Sheet:** [link](url) (or "Not created yet")

### Search Profiles
1. {city} — {min_rooms}+ rooms, max ₪{max_price}
2. {city} — {min_rooms}+ rooms

### Integrations
- Telegram: ✓ configured / ✗ not configured
- Google Sheets: ✓ configured / ✗ not configured
- Facebook groups: N groups configured
```
````

- [ ] **Step 3: Commit**

```bash
git add find-apartments/commands/find-apartments.md find-apartments/commands/status.md
git commit -m "feat: add /find-apartments and /find-apartments:status commands"
```

---

## Task 12: Gitignore and Final Cleanup

**Files:**
- Create: `find-apartments/.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `find-apartments/.gitignore`:

```
node_modules/
data/
```

The `data/` directory contains user-specific runtime data (cache, config, credentials) and should never be committed.

- [ ] **Step 2: Verify the full plugin structure**

```bash
find find-apartments -type f | sort
```

Expected output:
```
find-apartments/.claude-plugin/marketplace.json
find-apartments/.claude-plugin/plugin.json
find-apartments/.gitignore
find-apartments/commands/find-apartments.md
find-apartments/commands/status.md
find-apartments/config.schema.json
find-apartments/package.json
find-apartments/scripts/google-sheets.mjs
find-apartments/skills/cache/SKILL.md
find-apartments/skills/notify/SKILL.md
find-apartments/skills/search/SKILL.md
find-apartments/skills/search-facebook/SKILL.md
find-apartments/skills/search-madlan/SKILL.md
find-apartments/skills/search-winwin/SKILL.md
find-apartments/skills/search-yad2/SKILL.md
find-apartments/skills/sync-sheet/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git add find-apartments/.gitignore
git commit -m "chore: add .gitignore for node_modules and runtime data"
```

---

## Task 13: Remove Old Command

**Files:**
- Delete: `.claude/commands/find-apartments.md`

- [ ] **Step 1: Delete the old monolithic command**

```bash
rm .claude/commands/find-apartments.md
```

- [ ] **Step 2: Commit**

```bash
git rm .claude/commands/find-apartments.md
git commit -m "chore: remove old monolithic find-apartments command (replaced by plugin)"
```

---

## Task 14: Install and Verify Plugin

- [ ] **Step 1: Install npm dependencies**

```bash
cd find-apartments && npm install
```

- [ ] **Step 2: Install the plugin locally**

Link the plugin for local development:

```bash
claude plugins install ./find-apartments
```

If `claude plugins install` doesn't support local paths, add to `~/.claude/settings.json` under `enabledPlugins`:

```json
{
  "enabledPlugins": {
    "find-apartments": "/Users/dorongoldberg/Developer/Personal/agents/find-apartments"
  }
}
```

- [ ] **Step 3: Verify plugin is loaded**

Start a new Claude Code session and check that:
- `/find-apartments` appears as an available command
- `/find-apartments:status` appears as an available command
- Skills are listed (search, cache, notify, etc.)

- [ ] **Step 4: Create a test config**

Create `~/.claude/plugins/find-apartments/data/config.yaml`:

```yaml
searches:
  - city: "הוד השרון"
    min_rooms: 5

telegram:
  bot_token: "REDACTED_TELEGRAM_BOT_TOKEN"
  chat_id: "REDACTED_CHAT_ID"

google_sheets:
  credentials_path: "~/.config/find-apartments/service-account.json"

facebook_groups:
  - "https://www.facebook.com/groups/805158968082506"
```

- [ ] **Step 5: Test /find-apartments:status**

Run `/find-apartments:status` and verify it reports:
- 0 cached listings
- No sheet created yet
- Config loaded correctly

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: find-apartments plugin ready for testing"
```
