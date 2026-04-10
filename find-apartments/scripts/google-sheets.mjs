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
    ''
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
    range: 'Listings!Q:Q',
  });

  const urls = (response.data.values || [])
    .flat()
    .filter(url => url && url !== 'Link');

  console.log(JSON.stringify({ urls }));
}

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
