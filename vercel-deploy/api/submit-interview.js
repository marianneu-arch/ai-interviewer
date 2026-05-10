const { randomUUID } = require('crypto');
const { getSheets, send, handleError } = require('./_google');

async function ensureHeader(sheets, spreadsheetId) {
  const header = [
    'id',
    'name',
    'email',
    'phone',
    'location',
    'submittedAt',
    'q1_video',
    'q2_video',
    'q3_video',
    'q4_video',
    'q1_text',
    'q2_text',
    'q3_text',
    'q4_text'
  ];

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const hasTab = (spreadsheet.data.sheets || []).some((sheet) => {
    return sheet.properties && sheet.properties.title === 'Video Responses';
  });

  if (!hasTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: 'Video Responses' }
            }
          }
        ]
      }
    });
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Video Responses!A1:N1'
  }).catch(() => null);

  if (!existing || !existing.data.values || existing.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Video Responses!A1:N1',
      valueInputOption: 'RAW',
      requestBody: { values: [header] }
    });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error('Missing GOOGLE_SHEET_ID.');

    const data = req.body || {};
    const sheets = getSheets();
    await ensureHeader(sheets, spreadsheetId);

    const id = randomUUID().replace(/-/g, '').substring(0, 12);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Video Responses!A:N',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          id,
          data.name || '',
          data.email || '',
          data.phone || '',
          data.location || '',
          new Date().toISOString(),
          data.q1_video || '',
          data.q2_video || '',
          data.q3_video || '',
          data.q4_video || '',
          data.q1_text || '',
          data.q2_text || '',
          data.q3_text || '',
          data.q4_text || ''
        ]]
      }
    });

    send(res, 200, { success: true, id });
  } catch (error) {
    handleError(res, error);
  }
};
