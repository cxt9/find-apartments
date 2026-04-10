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
