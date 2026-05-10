const {
  send,
  handleError,
  requireAdmin,
  sanitizeName,
  createResumableUpload
} = require('./_google');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const { type, candidateName, questionNum, mimeType } = req.body || {};
    if (type === 'prompt') requireAdmin(req);

    const safeName = type === 'prompt'
      ? `prompt_Q${questionNum || 'X'}_${Date.now()}.webm`
      : `${sanitizeName(candidateName)}_Q${questionNum || 'X'}_${Date.now()}.webm`;

    const result = await createResumableUpload({
      fileName: safeName,
      mimeType: mimeType || 'video/webm'
    });

    send(res, 200, result);
  } catch (error) {
    handleError(res, error);
  }
};
