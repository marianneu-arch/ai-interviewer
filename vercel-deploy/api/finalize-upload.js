const { send, handleError, requireAdmin, makeFilePublic } = require('./_google');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const { fileId, type } = req.body || {};
    if (!fileId) throw new Error('Missing fileId.');
    if (type === 'prompt') requireAdmin(req);

    const result = await makeFilePublic(fileId);
    send(res, 200, result);
  } catch (error) {
    handleError(res, error);
  }
};
