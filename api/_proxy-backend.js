"use strict";

const { cors } = require("./_openrouter");

function backendOrigin() {
  const raw = process.env.BACKEND_URL || process.env.BACKEND_PROXY_URL || "";
  return String(raw).replace(/\/$/, "");
}

function ngrokHeaders(target) {
  const host = target.toLowerCase();
  if (
    host.includes("ngrok-free.app") ||
    host.includes("ngrok-free.dev") ||
    host.includes(".ngrok.io")
  ) {
    return { "ngrok-skip-browser-warning": "1" };
  }
  return {};
}

function targetUrl(pathSegments, search, rootHealth) {
  const backend = backendOrigin();
  if (!backend) return null;
  if (rootHealth) {
    return `${backend}/health${search || ""}`;
  }
  const subpath = Array.isArray(pathSegments)
    ? pathSegments.filter(Boolean).join("/")
    : String(pathSegments || "").replace(/^\/+/, "");
  return `${backend}/api/${subpath}${search || ""}`;
}

async function proxyRequest(req, res, pathSegments, { rootHealth = false } = {}) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }

  const backend = backendOrigin();
  if (!backend) {
    cors(res);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        detail:
          "BACKEND_URL is not set on Vercel. Add your FastAPI tunnel URL (https://….ngrok-free.dev) in Project → Environment Variables, then redeploy or wait for a new deployment.",
      }),
    );
    return;
  }

  const url = new URL(req.url || "/", "https://local.invalid");
  const target = targetUrl(pathSegments, url.search, rootHealth);
  if (!target) {
    cors(res);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ detail: "Invalid proxy target" }));
    return;
  }

  const headers = {
    ...ngrokHeaders(backend),
    accept: req.headers.accept || "application/json",
  };
  if (req.headers["content-type"]) {
    headers["content-type"] = req.headers["content-type"];
  }
  if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body =
      typeof req.body === "string"
        ? req.body
        : req.body
          ? JSON.stringify(req.body)
          : undefined;
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });
  } catch (error) {
    cors(res);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        detail: `PC backend unreachable at ${backend}: ${error.message || String(error)}`,
      }),
    );
    return;
  }

  const text = await upstream.text();
  cors(res);
  res.statusCode = upstream.status;
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("Content-Type", ct);
  res.end(text);
}

module.exports = { backendOrigin, proxyRequest, targetUrl };
