const { callOpenRouter, cors, json, readBody, validateMessage } = require("../_openrouter");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return json(res, 405, { detail: "Method not allowed" });
  }
  const started = Date.now();
  try {
    const message = validateMessage(readBody(req));
    const result = await callOpenRouter(message);
    return json(res, 200, {
      response: `${result.text.trim()}\n`,
      exitCode: 0,
      durationMs: Date.now() - started,
      mode: "oneshot",
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { detail: error.message || String(error) });
  }
};
