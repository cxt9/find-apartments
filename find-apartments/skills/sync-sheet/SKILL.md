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
