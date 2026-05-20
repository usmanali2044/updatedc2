const express = require('express');
const { decryptCellValue, encryptCellValue } = require('../lib/encryption');
const { getSheetsClient } = require('../lib/google');
const { resolveParams } = require('../lib/options');

const router = express.Router();

router.get('/tabs', async (req, res) => {
  try {
    const params = resolveParams(req.query);
    const sheets = getSheetsClient(params.serviceAccountKey);
    const resp = await sheets.spreadsheets.get({ spreadsheetId: params.sheetId });
    const tabs = (resp.data.sheets || []).map((sheet) => ({
      id: sheet.properties.sheetId,
      title: sheet.properties.title,
      index: sheet.properties.index,
    }));

    res.json({ tabs });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tab', async (req, res) => {
  try {
    const params = resolveParams(req.body);
    const sheetTabId = Number(req.body.sheetTabId);
    if (!Number.isInteger(sheetTabId)) {
      return res.status(400).json({ error: 'sheetTabId is required' });
    }

    const sheets = getSheetsClient(params.serviceAccountKey);
    const meta = await sheets.spreadsheets.get({ spreadsheetId: params.sheetId });
    const allSheets = meta.data.sheets || [];

    if (allSheets.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only sheet in the spreadsheet' });
    }

    const target = allSheets.find((sheet) => sheet.properties.sheetId === sheetTabId);
    if (!target) {
      return res.status(404).json({ error: 'Sheet tab not found' });
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: params.sheetId,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: sheetTabId } }],
      },
    });

    res.json({
      success: true,
      deleted: {
        id: sheetTabId,
        title: target.properties.title,
      },
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/rows', async (req, res) => {
  try {
    const params = resolveParams(req.query);
    const sheets = getSheetsClient(params.serviceAccountKey);
    const range = `${params.sheetName}!A1:E200`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: params.sheetId,
      range,
    });

    const rows = (resp.data.values || []).map((row, index) => ({
      rowIndex: index + 1,
      command: decryptCellValue(row[0] || ''),
      output: decryptCellValue(row[1] || ''),
      timestamp: decryptCellValue(row[2] || ''),
      delayLabel: decryptCellValue(row[3] || ''),
      delayValue: decryptCellValue(row[4] || ''),
    }));

    res.json({ rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/command', async (req, res) => {
  try {
    const params = resolveParams(req.body);
    const sheets = getSheetsClient(params.serviceAccountKey);
    const range = `${req.body.sheetName}!A${req.body.rowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: params.sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [[encryptCellValue(req.body.command)]] },
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/ticker', async (req, res) => {
  try {
    const params = resolveParams(req.query);
    const sheets = getSheetsClient(params.serviceAccountKey);
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: params.sheetId,
      range: `${req.query.sheetName}!E2`,
    });

    const decryptedTicker = decryptCellValue(resp.data.values?.[0]?.[0] || '');
    res.json({ ticker: parseInt(decryptedTicker || '60', 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ticker', async (req, res) => {
  try {
    const params = resolveParams(req.body);
    const sheets = getSheetsClient(params.serviceAccountKey);

    await sheets.spreadsheets.values.update({
      spreadsheetId: params.sheetId,
      range: `${req.body.sheetName}!E2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[encryptCellValue(String(req.body.ticker))]] },
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
