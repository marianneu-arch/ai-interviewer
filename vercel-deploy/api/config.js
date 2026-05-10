const { QUESTIONS, send, handleError } = require('./_google');

module.exports = async function handler(req, res) {
  try {
    const promptIds = {};
    for (let i = 1; i <= 4; i += 1) {
      const id = process.env[`PROMPT_Q${i}_ID`] || '';
      promptIds[`q${i}`] = id
        ? {
            exists: true,
            id,
            mediaUrl: `https://drive.google.com/uc?export=download&id=${id}`,
            previewUrl: `https://drive.google.com/file/d/${id}/preview`,
            title: QUESTIONS[i]
          }
        : { exists: false, title: QUESTIONS[i] };
    }
    send(res, 200, {
      prompts: promptIds,
      questions: QUESTIONS
    });
  } catch (error) {
    handleError(res, error);
  }
};
