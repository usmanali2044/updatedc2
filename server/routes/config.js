const express = require('express');
const { loadOptions, updateOptions } = require('../lib/options');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const opts = loadOptions();

    res.json({
      sheetId: opts.sheetId,
      rowId: opts.rowId,
      verbose: opts.verbose,
      hasServiceAccount: !!opts.serviceAccountKey,
      hasAesKey: !!opts.aesKey,
      usingDefaultAesKey: !opts.aesKey,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    updateOptions(req.body || {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
