# find-apartments

A Claude Code plugin that searches Israeli real estate platforms for rental apartments, deduplicates results via local cache, and sends new listings to Telegram.

## Platforms Searched

- **Yad2** (yad2.co.il) — via web search + fetch
- **WinWin** (winwin.co.il) — via web search + fetch
- **Madlan** (madlan.co.il) — via Chrome DevTools (requires [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp))
- **Facebook Groups** — via Chrome DevTools (requires logged-in Chrome session)

## Installation

### From GitHub

```bash
claude plugins marketplace add https://github.com/YOUR_USERNAME/find-apartments
claude plugins install find-apartments
```

### From local directory

```bash
claude plugins marketplace add /path/to/find-apartments
claude plugins install find-apartments
```

Restart Claude Code after installation.

## Setup

### 1. Create config

Create `~/.claude/plugins/find-apartments/data/config.yaml`:

```yaml
searches:
  - city: "הוד השרון"
    min_rooms: 5
  - city: "כפר סבא"
    min_rooms: 4
    max_price: 8000

telegram:
  bot_token: "YOUR_BOT_TOKEN"
  chat_id: "YOUR_CHAT_ID"

# Optional: Facebook groups to scan
facebook_groups:
  - "https://www.facebook.com/groups/YOUR_GROUP_ID"
```

### 2. Set up Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token to your config
4. Send a message to your bot, then get your chat ID via: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`

### 3. (Optional) Chrome DevTools for Madlan/Facebook

Install the Chrome DevTools MCP server to enable Madlan and Facebook scraping:

```bash
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

Without this, Yad2 and WinWin still work normally.

## Usage

### Search for apartments

```
/find-apartments
```

Runs all search profiles from your config. New listings are sent to Telegram automatically.

### One-off search

```
/find-apartments הוד השרון 5
```

Search a specific city and room count without modifying your config.

### Check status

```
/find-apartments:status
```

Shows cached listing count, last run date, and active search profiles.

## How It Works

```
/find-apartments
      |
      v
  Load config & cache
      |
      v
  Fan out scrapers (Yad2 + WinWin in parallel, Madlan + Facebook sequential)
      |
      v
  Collect & normalize listings
      |
      v
  Dedup against cache (by listing URL)
      |
      v
  Send NEW listings to Telegram
      |
      v
  Update cache
      |
      v
  Summary report
```

- **Deduplication**: Each listing URL is cached locally. On repeat runs, only new listings are reported.
- **Retry**: If Telegram fails, un-notified listings are retried on the next run.
- **Graceful degradation**: If a platform is unavailable (e.g., Chrome DevTools not running), others still work.

## Skills

The plugin includes these skills that Claude uses internally:

| Skill | Purpose |
|---|---|
| `search` | Orchestrates the full pipeline |
| `search-yad2` | Scrapes Yad2 listings |
| `search-winwin` | Scrapes WinWin listings |
| `search-madlan` | Scrapes Madlan via Chrome DevTools |
| `search-facebook` | Scrapes Facebook groups via Chrome DevTools |
| `cache` | Manages local dedup cache |
| `notify` | Sends Telegram messages |

## License

MIT
