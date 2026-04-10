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
