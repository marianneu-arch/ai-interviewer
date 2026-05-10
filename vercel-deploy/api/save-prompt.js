const {
  QUESTIONS,
  send,
  handleError,
  requireAdmin,
  getPromptLibrary,
  savePromptMetadata,
  uploadVideoBuffer
} = require('./_google');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      requireAdmin(req);
      return send(res, 200, { prompts: await getPromptLibrary(), questions: QUESTIONS });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    requireAdmin(req);

    const { base64Data, questionNum, mimeType } = req.body || {};
    const qn = Number(questionNum);
    if (!QUESTIONS[qn]) throw new Error('Invalid question number.');

    const file = await uploadVideoBuffer({
      base64Data,
      mimeType: mimeType || 'video/webm',
      fileName: `prompt_Q${qn}_${Date.now()}.webm`
    });

    await savePromptMetadata(qn, file);
    send(res, 200, {
      ...file,
      title: QUESTIONS[qn],
      exists: true,
      recorded: true
    });
  } catch (error) {
    handleError(res, error);
  }
};
