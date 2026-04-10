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
