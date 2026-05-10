const { QUESTIONS, send, handleError, getPromptLibrary } = require('./_google');

module.exports = async function handler(req, res) {
  try {
    const promptIds = await getPromptLibrary();
    send(res, 200, {
      prompts: promptIds,
      questions: QUESTIONS
    });
  } catch (error) {
    handleError(res, error);
  }
};
