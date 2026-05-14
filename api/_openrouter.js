const DEFAULT_MODEL = "minimax/minimax-m2.5:free";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function freeModelFromEnv(name, fallback = DEFAULT_MODEL) {
  const model = String(process.env[name] || fallback).trim() || fallback;
  if (process.env.AGENT_ALLOW_PAID_MODELS !== "true" && model !== "openrouter/free" && !model.endsWith(":free")) {
    throw new Error(`${name} must be a free model unless AGENT_ALLOW_PAID_MODELS=true`);
  }
  return model;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, payload) {
  cors(res);
  res.status(status).json(payload);
}

function validateMessage(body) {
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    const err = new Error("message must not be empty");
    err.statusCode = 422;
    throw err;
  }
  if (message.length > 8000) {
    const err = new Error("message exceeds maximum length of 8000 characters");
    err.statusCode = 422;
    throw err;
  }
  return message;
}

async function callOpenRouter(message, { web = false } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENROUTER_API_KEY is not set in Vercel environment variables");
    err.statusCode = 503;
    throw err;
  }
  const model = freeModelFromEnv(web ? "AGENT_WEB_MODEL" : "AGENT_WORKHORSE_MODEL");
  const system = web
    ? "You are a concise web-aware assistant. Answer directly in the user's language."
    : "You are Hayk Universal Agent. Answer directly in the user's language.";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://hayk-universal-agent.vercel.app",
      "X-Title": "Hayk Universal Agent",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const detail = payload.error?.message || payload.detail || text || `OpenRouter HTTP ${response.status}`;
    const err = new Error(String(detail));
    err.statusCode = 502;
    err.providerStatus = response.status;
    err.model = model;
    throw err;
  }
  return {
    text: payload.choices?.[0]?.message?.content || "",
    model,
  };
}

module.exports = {
  callOpenRouter,
  cors,
  DEFAULT_MODEL,
  json,
  readBody,
  validateMessage,
};
