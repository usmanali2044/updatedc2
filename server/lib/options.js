const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const OPTIONS_PATH = process.env.GC2_OPTIONS_PATH
  || path.resolve(__dirname, '../../c2/cmd/options.yml');

function loadOptions() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
    const doc = yaml.load(raw) || {};

    return {
      serviceAccountKey: doc.GoogleServiceAccountKey || '',
      sheetId: doc.GoogleSheetID || '',
      aesKey: doc.AESKey || '',
      rowId: doc.RowId || 1,
      proxy: doc.Proxy || null,
      verbose: doc.Verbose || false,
    };
  } catch (e) {
    console.error('[GC2] Failed to read options.yml:', e.message);
    return {};
  }
}

function updateOptions(updates) {
  const raw = fs.readFileSync(OPTIONS_PATH, 'utf8');
  const doc = yaml.load(raw) || {};

  if (updates.sheetId) doc.GoogleSheetID = updates.sheetId;
  if (updates.serviceAccountKey) doc.GoogleServiceAccountKey = updates.serviceAccountKey;
  if (updates.aesKey) doc.AESKey = updates.aesKey;

  fs.writeFileSync(OPTIONS_PATH, yaml.dump(doc), 'utf8');
}

function resolveParams(source = {}) {
  const opts = loadOptions();

  return {
    serviceAccountKey: source.serviceAccountKey || opts.serviceAccountKey,
    sheetId: source.sheetId || opts.sheetId,
    sheetName: source.sheetName,
  };
}

module.exports = {
  OPTIONS_PATH,
  loadOptions,
  resolveParams,
  updateOptions,
};
