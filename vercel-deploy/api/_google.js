const { google } = require('googleapis');
const { Readable } = require('stream');

const QUESTIONS = {
  1: 'Walk us through your largest closed deal.',
  2: 'Name 3 people you could introduce us to in 30 days.',
  3: 'What was your quota last year and what did you actually close?',
  4: "'We already have an outsourcing partner and we're happy.' What do you say?"
};

function getAuth() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Missing Google service account env vars.');

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  });
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function requireAdmin(req) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    const err = new Error('Admin access required.');
    err.statusCode = 401;
    throw err;
  }
}

function send(res, status, body) {
  res.status(status).json(body);
}

function handleError(res, error) {
  const status = error.statusCode || 500;
  send(res, status, { error: error.message || 'Server error' });
}

function sanitizeName(value) {
  return String(value || 'candidate').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
}

async function ensureSheetTab(title, header) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('Missing GOOGLE_SHEET_ID.');

  const sheets = getSheets();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const hasTab = (spreadsheet.data.sheets || []).some((sheet) => {
    return sheet.properties && sheet.properties.title === title;
  });

  if (!hasTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }]
      }
    });
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A1:Z1`
  }).catch(() => null);

  if (!existing || !existing.data.values || existing.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1:Z1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] }
    });
  }

  return { sheets, spreadsheetId };
}

async function getPromptLibrary() {
  const { sheets, spreadsheetId } = await ensureSheetTab('Prompt Videos', [
    'questionNum',
    'title',
    'fileId',
    'fileName',
    'webViewLink',
    'updatedAt'
  ]);

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Prompt Videos!A2:F'
  }).catch(() => ({ data: { values: [] } }));

  const prompts = {};
  for (let i = 1; i <= 4; i += 1) {
    prompts[`q${i}`] = { exists: false, title: QUESTIONS[i] };
  }

  for (const row of result.data.values || []) {
    const questionNum = Number(row[0]);
    const fileId = row[2];
    if (!questionNum || !fileId) continue;
    prompts[`q${questionNum}`] = {
      exists: true,
      recorded: true,
      title: row[1] || QUESTIONS[questionNum],
      id: fileId,
      name: row[3] || '',
      url: row[4] || `https://drive.google.com/file/d/${fileId}/view`,
      mediaUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      previewUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      updatedAt: row[5] || ''
    };
  }

  return prompts;
}

async function savePromptMetadata(questionNum, file) {
  const qn = Number(questionNum);
  if (!qn || !QUESTIONS[qn]) throw new Error('Invalid question number.');

  const { sheets, spreadsheetId } = await ensureSheetTab('Prompt Videos', [
    'questionNum',
    'title',
    'fileId',
    'fileName',
    'webViewLink',
    'updatedAt'
  ]);

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Prompt Videos!A2:F'
  }).catch(() => ({ data: { values: [] } }));

  const rows = values.data.values || [];
  const rowIndex = rows.findIndex((row) => Number(row[0]) === qn);
  const row = [
    qn,
    QUESTIONS[qn],
    file.id,
    file.name || '',
    file.url || file.webViewLink || '',
    new Date().toISOString()
  ];

  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Prompt Videos!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] }
    });
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Prompt Videos!A${rowIndex + 2}:F${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  }
}

function decodeBase64Video(data) {
  if (!data) throw new Error('Missing video data.');
  return Buffer.from(String(data).replace(/^data:video\/[^;]+;base64,/, ''), 'base64');
}

async function uploadVideoBuffer({ base64Data, fileName, mimeType }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID.');

  const buffer = decodeBase64Video(base64Data);
  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId]
    },
    media: {
      mimeType: mimeType || 'video/webm',
      body: Readable.from(buffer)
    },
    fields: 'id,name,webViewLink'
  });

  return makeFilePublic(created.data.id);
}

async function createResumableUpload({ fileName, mimeType }) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID.');

  const auth = getAuth();
  const token = await auth.getAccessToken();
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token || token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'video/webm'
    },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Could not start Drive upload: ${message}`);
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive did not return an upload URL.');
  return { uploadUrl };
}

async function makeFilePublic(fileId) {
  const drive = getDrive();
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' }
  });

  const file = await drive.files.get({
    fileId,
    fields: 'id,name,webViewLink'
  });

  return {
    id: file.data.id,
    name: file.data.name,
    url: file.data.webViewLink,
    mediaUrl: `https://drive.google.com/uc?export=download&id=${file.data.id}`,
    previewUrl: `https://drive.google.com/file/d/${file.data.id}/preview`
  };
}

module.exports = {
  QUESTIONS,
  getDrive,
  getSheets,
  requireAdmin,
  send,
  handleError,
  sanitizeName,
  getPromptLibrary,
  savePromptMetadata,
  uploadVideoBuffer,
  createResumableUpload,
  makeFilePublic
};
