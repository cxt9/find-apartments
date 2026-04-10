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
