const { callOpenRouter, cors, json, readBody, validateMessage } = require("../_openrouter");
const { enforceChatMessagePolicy, enforcePolicy } = require("../_lib/policy-enforce");

function routeName(req) {
  const pathname = new URL(req.url || "/", "https://local.invalid").pathname;
  return pathname.replace(/^\/api\/chat\/?/, "").replace(/\/$/, "");
}

function policyToken(body) {
  const token = body?.policyConfirmationToken;
  return typeof token === "string" && token.trim() ? token.trim() : null;
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
  const body = readBody(req);
  const message = validateMessage(body);
  const endpoint = web ? "/api/chat/web-send" : "/api/chat/send";

  if (web) {
    const gate = enforcePolicy({
      req,
      res,
      json,
      action: "network web-send",
      context: { endpoint, kind: "network" },
      confirmationToken: policyToken(body),
    });
    if (!gate.allowed) return;
  } else {
    const gate = enforceChatMessagePolicy({ req, res, json, message, endpoint });
    if (!gate.allowed) return;
  }

  const started = Date.now();
  const result = await callOpenRouter(message, { web });
  return json(res, 200, {
    response: `${result.text.trim()}\n`,
    exitCode: 0,
    durationMs: Date.now() - started,
    mode: web ? "web-oneshot" : "oneshot",
  });
}

function cloudSessionId(body) {
  return typeof body.sessionId === "string" && body.sessionId.trim()
    ? body.sessionId.trim()
    : `vercel-${Date.now()}`;
}

async function sessionSend(req, res) {
  const body = readBody(req);
  const message = validateMessage(body);
  const gate = enforceChatMessagePolicy({
    req,
    res,
    json,
    message,
    endpoint: "/api/chat/session-send",
  });
  if (!gate.allowed) return;

  const started = Date.now();
  const result = await callOpenRouter(message);
  return json(res, 200, {
    response: `${result.text.trim()}\n`,
    sessionId: cloudSessionId(body),
    exitCode: 0,
    durationMs: Date.now() - started,
    mode: "hermes-session",
    parseWarning: "Cloud session is stateless on Vercel; local browser history keeps the visible chat.",
  });
}

async function webSessionSend(req, res) {
  const body = readBody(req);
  const message = validateMessage(body);
  const endpoint = "/api/chat/web-send";
  const gate = enforcePolicy({
    req,
    res,
    json,
    action: "network web-send",
    context: { endpoint, kind: "network" },
    confirmationToken: policyToken(body),
  });
  if (!gate.allowed) return;

  const started = Date.now();
  const result = await callOpenRouter(message, { web: true });
  return json(res, 200, {
    response: `${result.text.trim()}\n`,
    sessionId: cloudSessionId(body),
    exitCode: 0,
    durationMs: Date.now() - started,
    mode: "web-session",
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
      // Sessions live on the local Hermes runtime (state.db). The Vercel
      // serverless layer cannot list them. Return an empty list together with
      // an explanatory ``mode`` flag so the frontend can render "no persistent
      // sessions in cloud mode" instead of treating it as a clean slate.
      return json(res, 200, {
        sessions: [],
        mode: "vercel-cloud",
        message:
          "Persistent Hermes sessions live on the local Hermes runtime (state.db). " +
          "Cloud mode is stateless; visible chat is browser-local only.",
      });
    }
    if (/^sessions\/[^/]+\/transcript$/.test(route) && req.method === "GET") {
      const sessionId = decodeURIComponent(route.split("/")[1] || "");
      return json(res, 404, {
        detail:
          "Session transcripts are not available in Vercel cloud mode. " +
          "Set BACKEND_URL (PC proxy) or VITE_API_BASE_URL to a FastAPI tunnel " +
          "to load Hermes session exports.",
        sessionId,
      });
    }
    if (/^sessions\/[^/]+$/.test(route) && req.method === "DELETE") {
      const sessionId = decodeURIComponent(route.split("/")[1] || "");
      return json(res, 501, {
        detail:
          "Session deletion is not available in Vercel cloud mode (sessions live on the local " +
          "Hermes runtime). Delete via local CLI: hermes sessions delete <id>.",
        sessionId,
      });
    }
    if (route === "send" && req.method === "POST") {
      return await send(req, res);
    }
    if (route === "web-send" && req.method === "POST") {
      return await webSessionSend(req, res);
    }
    if (route === "session-send" && req.method === "POST") {
      return await sessionSend(req, res);
    }
    return json(res, 404, { detail: "Chat route not found" });
  } catch (error) {
    return errorJson(res, route, error);
  }
};
