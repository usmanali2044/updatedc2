const express = require('express');
const cors = require('cors');
const configRoutes = require('./routes/config');
const sheetRoutes = require('./routes/sheets');
const { OPTIONS_PATH, loadOptions } = require('./lib/options');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/config', configRoutes);
app.use('/api/sheets', sheetRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const opts = loadOptions();
  console.log(`GC2 API Server -> http://localhost:${PORT}`);
  console.log(`  Config file  -> ${OPTIONS_PATH}`);
  console.log(`  Sheet ID     -> ${opts.sheetId || '(not set)'}`);
  console.log(`  Service Acct -> ${opts.serviceAccountKey ? '✓ loaded' : '✗ MISSING'}`);
});
