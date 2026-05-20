const { google } = require('googleapis');
const { loadOptions } = require('./options');

function getAuthClient(keyOverride) {
  const opts = loadOptions();
  const raw = keyOverride || opts.serviceAccountKey;

  if (!raw) {
    throw new Error('No GoogleServiceAccountKey found in options.yml');
  }

  const credentials = typeof raw === 'string' ? JSON.parse(raw) : raw;

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient(serviceAccountKey) {
  const auth = getAuthClient(serviceAccountKey);
  return google.sheets({ version: 'v4', auth });
}

module.exports = {
  getAuthClient,
  getSheetsClient,
};
