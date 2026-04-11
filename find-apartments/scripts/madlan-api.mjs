#!/usr/bin/env node
// Madlan scraper using the internal GraphQL API.
// No browser, no stealth — just direct HTTPS to their /api2 endpoint.
//
// Usage: node madlan-api.mjs <city> <minRooms> [--deal rent|buy]
// Example: node madlan-api.mjs "הוד השרון" 5 --deal rent

const city = process.argv[2] || 'הוד השרון';
const minRooms = parseFloat(process.argv[3] || '5');
const dealArg = process.argv.includes('--deal')
  ? process.argv[process.argv.indexOf('--deal') + 1]
  : 'rent';
const dealType = dealArg === 'buy' ? 'unitBuy' : 'unitRent';

// Visitor JWT — captured from a real browser session. Expires 2027.
// This is a public visitor token, not tied to any user account.
const AUTH_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleGFjdC10aW1lIjoxNzc1OTE3OTAxNTEyLCJwYXlsb2FkIjoie1widWlkXCI6XCI2OWQyYTcxNS02MmI1LTQ2N2QtYmEyNS04Y2QzNzcyOWQ3NDFcIixcInNlc3Npb24taWRcIjpcImZkN2UxNTY2LTUwNTQtNGJkOC04N2E3LTc5OTA3MzlhZWEzNFwiLFwidHRsXCI6MzE1NTc2MDB9IiwiaWF0IjoxNzc1OTE3OTAxLCJpc3MiOiJsb2NhbGl6ZSIsInVzZXJJZCI6IjY5ZDJhNzE1LTYyYjUtNDY3ZC1iYTI1LThjZDM3NzI5ZDc0MSIsInJlZ2lzdHJhdGlvblR5cGUiOiJWSVNJVE9SIiwicm9sZXMiOlsiVklTSVRPUiJdLCJpc0ltcGVyc29uYXRpb25Mb2dJbiI6ZmFsc2UsInNhbHQiOiJmZDdlMTU2Ni01MDU0LTRiZDgtODdhNy03OTkwNzM5YWVhMzQiLCJ2IjoyLCJleHAiOjE4MDc0NzU1MDF9.DDWfqoNJhGgXYYWu1WJnpnk0E8VselJICUY4HMi3jFA';

const docId = `${city.replace(/\s+/g, '-')}-ישראל`;

const query = `
query searchPoi(
  $dealType: String,
  $roomsRange: [Float],
  $locationDocId: String,
  $poiTypes: [PoiType],
  $offset: Int,
  $limit: Int,
  $sort: [SortField],
  $amenities: inputAmenitiesFilter
) {
  searchPoiV2(
    dealType: $dealType,
    roomsRange: $roomsRange,
    locationDocId: $locationDocId,
    poiTypes: $poiTypes,
    offset: $offset,
    limit: $limit,
    sort: $sort,
    amenities: $amenities
  ) {
    total
    poi {
      id
      type
      ... on Bulletin {
        address
        dealType
        price
        beds
        baths
        area
        floor
        buildingYear
        lastUpdated
        firstTimeSeen
        generalCondition
        rentalBrokerFee
        images { imageUrl }
        addressDetails {
          city
          streetName
          neighbourhood
          streetNumber
        }
      }
    }
  }
}
`;

async function fetchListings() {
  const response = await fetch('https://www.madlan.co.il/api2', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${AUTH_TOKEN}`,
      'content-type': 'application/json',
      origin: 'https://www.madlan.co.il',
      referer: `https://www.madlan.co.il/for-${dealArg}/${encodeURIComponent(docId)}`,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
      'x-source': 'web',
    },
    body: JSON.stringify({
      operationName: 'searchPoi',
      variables: {
        dealType,
        roomsRange: [minRooms, null],
        locationDocId: docId,
        poiTypes: ['bulletin'],
        offset: 0,
        limit: 100,
        sort: [
          {
            field: 'geometry',
            order: 'asc',
            reference: null,
            docIds: [docId],
          },
        ],
        amenities: {},
      },
      query,
    }),
  });

  const data = await response.json();

  if (data.errors) {
    console.error(JSON.stringify({ error: 'graphql', details: data.errors }));
    process.exit(1);
  }

  const result = data?.data?.searchPoiV2;
  if (!result) {
    console.error(JSON.stringify({ error: 'no_data', raw: data }));
    process.exit(1);
  }

  const listings = (result.poi || []).map((item) => {
    const d = item.addressDetails || {};
    const street = [d.streetName, d.streetNumber].filter(Boolean).join(' ');
    return {
      url: `https://www.madlan.co.il/listings/${item.id}`,
      source: 'Madlan',
      city: d.city || city,
      address: street || item.address || '',
      neighborhood: d.neighbourhood || '',
      rooms: item.beds,
      floor: item.floor,
      size_sqm: item.area,
      price: item.price,
      mamad: null,
      parking: null,
      elevator: null,
      ac: null,
      balcony: null,
      pets: null,
      available_from: item.firstTimeSeen || '',
      contact: null,
      images: (item.images || [])
        .filter((img) => img.imageUrl)
        .map((img) => {
          const url = img.imageUrl;
          return url.startsWith('http')
            ? url
            : `https://madlan.co.il/${url.replace(/^\//, '')}`;
        }),
    };
  });

  console.log(
    JSON.stringify({
      total: result.total,
      count: listings.length,
      listings,
    })
  );
}

fetchListings().catch((err) => {
  console.error(JSON.stringify({ error: 'fetch_failed', message: err.message }));
  process.exit(1);
});
