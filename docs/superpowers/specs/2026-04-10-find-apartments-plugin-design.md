# Find Apartments — Claude Code Plugin Design

**Date:** 2026-04-10
**Status:** Approved

## Purpose

A distributable Claude Code plugin that searches Israeli real estate platforms for rental apartments, caches results locally, syncs new findings to a Google Sheet, and notifies via Telegram. Designed for repeated/scheduled runs where only **new** listings are reported.

## Plugin Structure

```
find-apartments/
├── plugin.json                    # Plugin manifest
├── package.json                   # Dependencies (googleapis)
├── config.schema.json             # JSON schema for user config
├── scripts/
│   └── google-sheets.mjs          # Sheets API helper (create/append/dedup)
├── skills/
│   ├── search.md                  # Orchestrator — fans out parallel agents
│   ├── search-yad2.md             # Yad2 scraper (web_search + web_fetch)
│   ├── search-madlan.md           # Madlan scraper (Chrome DevTools)
│   ├── search-facebook.md         # Facebook group scraper (Chrome DevTools)
│   ├── search-winwin.md           # WinWin scraper (web_search + web_fetch)
│   ├── notify.md                  # Telegram sender (new listings only)
│   ├── sync-sheet.md              # Google Sheets sync
│   └── cache.md                   # Local JSON cache manager
├── commands/
│   ├── find-apartments.md         # Main user command: /find-apartments
│   └── status.md                  # /find-apartments:status
└── data/                          # Runtime data dir: ~/.claude/plugins/find-apartments/data/
    ├── cache.json                 # Listing cache (keyed by URL)
    ├── config.yaml                # User search profiles
    └── sheet-id.txt               # Google Sheet ID (auto-created on first run)
```

## Data Flow

```
User runs /find-apartments
        |
        v
   search (orchestrator)
        |
        +-- reads config.yaml (or CLI args)
        |
        +-- spawns parallel agents --+-- search-yad2
        |                            +-- search-madlan (Chrome)
        |                            +-- search-winwin
        |                            +-- search-facebook (Chrome)
        |
        v
   Collect all listings (normalized format)
        |
        v
   cache (dedup by listing URL)
        |  filters out already-known listings
        v
   NEW listings only
        |
        +---> sync-sheet (append rows to Google Sheet)
        |         |
        |         v (after sheet sync succeeds)
        +---> notify (send each new listing to Telegram)
        |
        v
   Summary to user (X new listings found, Y total cached)
```

## User-Facing Commands

### `/find-apartments [city] [rooms]`

- **With arguments:** One-off search for that city and room count.
- **Without arguments:** Runs all search profiles defined in `config.yaml`.
- Displays progress, then a summary of new listings found.
- New listings are automatically saved to the Google Sheet and sent to Telegram.

### `/find-apartments:status`

- Shows total cached listings and last run date.
- Displays Google Sheet link.
- Summarizes active search profiles from config.

## Configuration

### User Config (`config.yaml`)

```yaml
searches:
  - city: "הוד השרון"
    min_rooms: 5
  - city: "כפר סבא"
    min_rooms: 4
    max_price: 8000

telegram:
  bot_token: "<user's bot token>"
  chat_id: "<user's chat id>"

google_sheets:
  credentials_path: "~/.config/find-apartments/service-account.json"
  # sheet_id is auto-generated on first run and saved to sheet-id.txt

facebook_groups:
  - "https://www.facebook.com/groups/805158968082506"
```

### Config Schema (`config.schema.json`)

Validates:
- `searches[].city` — required string
- `searches[].min_rooms` — required integer, >= 1
- `searches[].max_price` — optional integer
- `telegram.bot_token` — required string
- `telegram.chat_id` — required string
- `google_sheets.credentials_path` — required string, path to service account JSON
- `facebook_groups` — optional array of URL strings

## Google Sheet

### Layout

Single sheet named "Listings" with these columns:

| Column | Description | Managed by |
|---|---|---|
| Date Found | ISO date when listing was first seen | Agent (auto) |
| City | City name from search profile | Agent (auto) |
| Source | Platform name (Yad2, Madlan, WinWin, Facebook) | Agent (auto) |
| Address | Full street address | Agent (auto) |
| Neighborhood | Neighborhood name if available | Agent (auto) |
| Rooms | Number of rooms | Agent (auto) |
| Floor | Floor / total floors (e.g., "9/23") | Agent (auto) |
| Size (m²) | Built area in square meters | Agent (auto) |
| Price (₪) | Monthly rent in NIS | Agent (auto) |
| Mamad | Yes/No | Agent (auto) |
| Parking | Count and type (e.g., "2, covered") | Agent (auto) |
| Elevator | Yes/No | Agent (auto) |
| AC | Yes/No or details | Agent (auto) |
| Balcony | Yes/No or size | Agent (auto) |
| Pets | Yes/No | Agent (auto) |
| Available From | Date string | Agent (auto) |
| Link | Direct URL to the listing | Agent (auto) |
| Status | User-managed (Contacted, Visited, etc.) | User (manual) |

### Rules

- Agent **never overwrites** existing rows — append only.
- Agent **never touches** the Status column.
- Sheet is created automatically on first run via `scripts/google-sheets.mjs`.
- Sheet ID is saved to `data/sheet-id.txt` for subsequent runs.
- Sheet is shared with the service account email and optionally with the user's personal email.

## Cache

### Format (`cache.json`)

```json
{
  "https://www.yad2.co.il/item/fity5pgk": {
    "first_seen": "2026-04-10",
    "city": "הוד השרון",
    "price": 9000,
    "rooms": 5,
    "address": "יונה וולך 4",
    "synced_to_sheet": true,
    "notified": true
  }
}
```

### Deduplication Logic

- **Primary key:** Listing URL (unique per platform).
- **Cross-platform duplicates are allowed.** The same physical apartment listed on both Yad2 and Madlan will appear as two separate entries. This is intentional — different platforms may have different details, photos, or contact info.
- On each run, new scrape results are compared against `cache.json` keys. Only URLs not present in the cache are treated as new.

### Cache Lifecycle

- New listings are added to cache immediately after scraping.
- `synced_to_sheet` is set to `true` after successful Google Sheets append.
- `notified` is set to `true` after successful Telegram send.
- If sheet sync or notification fails, the flags remain `false` and will be retried on next run.

## Platform-Specific Scraping

| Platform | Method | Reason |
|---|---|---|
| Yad2 | `web_search` + `web_fetch` per listing | Reliable, API-friendly listing URLs (`/item/{id}`) |
| Madlan | Chrome DevTools (`navigate_page` + `evaluate_script` + `take_screenshot`) | Returns 403 on automated `web_fetch` |
| WinWin | `web_search` + `web_fetch` | Standard HTML pages |
| Facebook | Chrome DevTools (navigate, scroll, extract DOM) | Requires logged-in browser session |

### Normalized Listing Format

All platform scrapers return listings in a common format:

```json
{
  "url": "https://www.yad2.co.il/item/fity5pgk",
  "source": "Yad2",
  "city": "הוד השרון",
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
  "contact": null,
  "images": []
}
```

## Parallel Execution Strategy

For N search profiles x 4 platforms:

- **Web-based scrapers** (Yad2, WinWin) can all run as parallel subagents — no shared resource.
- **Chrome-based scrapers** (Madlan, Facebook) share the browser — these run **sequentially** to avoid tab conflicts.
- Practical grouping per search profile:
  1. Launch Yad2 + WinWin agents in parallel (background)
  2. Run Madlan via Chrome (foreground, sequential)
  3. Run Facebook via Chrome (foreground, sequential)
  4. Collect all results

## Notification (Telegram)

- Only **new** listings (not in cache) are sent.
- Listings are sent **after** successful Google Sheet sync.
- Each listing is sent as a separate Telegram message in Hebrew with:
  - Address (bold)
  - Price, rooms, size
  - Key amenities (parking, mamad, elevator, balcony)
  - Direct link to listing
- Uses `curl` to the Telegram Bot API.

## Scheduling

As a Claude Code plugin, users can schedule automated runs:

```
/schedule find-apartments every 6 hours
```

Scheduled runs use `config.yaml` profiles, cache ensures no duplicate notifications.

## Setup Flow (First Run)

1. User installs the plugin.
2. User runs `/find-apartments` for the first time.
3. Agent checks for `config.yaml` — if missing, walks user through creating one:
   - Which cities/rooms to search
   - Telegram bot token and chat ID
   - Google service account credentials path
4. Agent creates the Google Sheet, saves the sheet ID.
5. Agent runs the first search, populates sheet, sends all findings to Telegram.
6. Subsequent runs only report new listings.

## Error Handling

- If Chrome DevTools is unavailable (MCP disconnected), skip Madlan/Facebook scrapers and note it in the summary. Do not fail the entire run.
- If Google Sheets API fails, cache listings with `synced_to_sheet: false` and retry on next run.
- If Telegram fails, cache listings with `notified: false` and retry on next run.
- If a platform returns no results, log it but continue with other platforms.

## Permissions

The plugin's `settings.json` should pre-authorize:
- `WebSearch`
- `WebFetch` for yad2.co.il, winwin.co.il
- `Bash` for curl (Telegram), node (Google Sheets script)
- Chrome DevTools MCP tools for Madlan/Facebook

## Future Considerations (Out of Scope)

- Additional platforms (Homeless, Komo, etc.)
- WhatsApp group integration
- Price change tracking for existing listings
- Map visualization of findings
- SMS/email notifications as alternative to Telegram
