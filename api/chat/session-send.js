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
    const body = readBody(req);
    const message = validateMessage(body);
    const result = await callOpenRouter(message);
    const sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : `vercel-${Date.now()}`;
    return json(res, 200, {
      response: `${result.text.trim()}\n`,
      sessionId,
      exitCode: 0,
      durationMs: Date.now() - started,
      mode: "hermes-session",
      parseWarning: "Cloud session is stateless on Vercel; local browser history keeps the visible chat.",
    });
  } catch (error) {
    console.error("chat/session-send failed", {
      message: error.message || String(error),
      providerStatus: error.providerStatus,
      model: error.model,
    });
    return json(res, error.statusCode || 500, {
      detail: error.message || String(error),
      providerStatus: error.providerStatus || null,
      model: error.model || null,
    });
  }
};
