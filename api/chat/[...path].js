const { callOpenRouter, cors, json, readBody, validateMessage } = require("../_openrouter");

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/chat\/?/, "").replace(/\/$/, "");
}

function errorJson(res, route, error) {
  console.error(`chat/${route} failed`, {
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

async function send(req, res, { web = false } = {}) {
  const started = Date.now();
  const message = validateMessage(readBody(req));
  const result = await callOpenRouter(message, { web });
  return json(res, 200, {
    response: `${result.text.trim()}\n`,
    exitCode: 0,
    durationMs: Date.now() - started,
    mode: web ? "web-oneshot" : "oneshot",
  });
}

async function sessionSend(req, res) {
  const started = Date.now();
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
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const route = routeName(req);

  try {
    if (route === "sessions" && req.method === "GET") {
      return json(res, 200, { sessions: [] });
    }
    if (/^sessions\/[^/]+\/transcript$/.test(route) && req.method === "GET") {
      const sessionId = decodeURIComponent(route.split("/")[1] || "");
      return json(res, 200, { sessionId, title: null, messageCount: 0, messages: [] });
    }
    if (/^sessions\/[^/]+$/.test(route) && req.method === "DELETE") {
      const sessionId = decodeURIComponent(route.split("/")[1] || "");
      return json(res, 200, { ok: "true", sessionId });
    }
    if (route === "send" && req.method === "POST") {
      return await send(req, res);
    }
    if (route === "web-send" && req.method === "POST") {
      return await send(req, res, { web: true });
    }
    if (route === "session-send" && req.method === "POST") {
      return await sessionSend(req, res);
    }
    return json(res, 404, { detail: "Chat route not found" });
  } catch (error) {
    return errorJson(res, route, error);
  }
};
