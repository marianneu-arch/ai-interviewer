const { google } = require('googleapis');

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
  createResumableUpload,
  makeFilePublic
};
