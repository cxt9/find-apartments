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
