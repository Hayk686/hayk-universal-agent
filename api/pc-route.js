"use strict";

const { proxyRequest } = require("./_proxy-backend");

/**
 * Single serverless entry for all /api/pc/* (see vercel.json rewrite).
 * Vercel's api/pc/[...path].js only reliably matches one path segment.
 */
module.exports = async function handler(req, res) {
  const url = new URL(req.url || "/", "https://local.invalid");
  const raw =
    url.searchParams.get("path") ??
    url.pathname.replace(/^\/api\/pc-route\/?/, "").replace(/^\/api\/pc\/?/, "");
  const segments = String(raw)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  return proxyRequest(req, res, segments);
};
